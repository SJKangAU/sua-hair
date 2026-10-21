// useBookings.ts
// Real-time bookings subscription via Firestore onSnapshot
// Provides all bookings and mutation helpers (updateStatus)
// Optimistic updates — UI updates immediately, Firestore write in background
// On failure, rolls back to previous state

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  deleteField,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { todayString, addDays } from "../lib/dates";
import { bookingConverter } from "../lib/converters";
import { isSlotFreeing } from "../lib/bookingStatus";
import { phaseEditHistoryEntry } from "../lib/bookingHistory";
import { resolvePhases } from "../lib/bookingPhases";
import { phaseWriteFields } from "../lib/phaseFields";
import { slotBlockSchedulePatch } from "../lib/slotBlockData";
import { buildStatusPatch } from "../lib/statusPatch";
import {
  updateBookingWithSlotLock,
  writePhaseEdit,
  writeStatusChange,
} from "../lib/adminBookingWrites";
import {
  approveBooking,
  cancelBooking,
  commandForStatusChange,
  declineBooking,
  restoreBooking,
} from "../lib/bookingApi";
import {
  BookingConflictError,
  fetchBookingConflict,
} from "../lib/bookingConflicts";
import {
  buildReschedule,
  isSameSlot,
  type PriceSource,
  type RescheduleTarget,
  type StylistInfo,
} from "../lib/reschedule";
import type { Booking, BookingStatus, Phase } from "../types";

interface UseBookings {
  bookings: Booking[];
  // The latest copy of one booking, read from the provider-owned ref. Safe to
  // call from a toast "Undo" after the component that started the action has
  // unmounted (a per-component copy of `bookings` would be stale by then).
  getBooking: (id: string) => Booking | undefined;
  loading: boolean;
  error: string | null;
  updateStatus: (id: string, status: BookingStatus) => Promise<void>;
  setFlag: (id: string, flagged: boolean, reason?: string) => Promise<void>;
  // Per-session override of a single booking's active/rest time split —
  // distinct from editing the Service template in Manage → Services, which
  // only affects future bookings. Recomputes totalTime and the locked-in
  // returnTime, then persists just this booking's record.
  updateTimes: (
    id: string,
    activeTime: number,
    restTime: number,
  ) => Promise<void>;
  // Replace this booking's phases (see updatePhases below)
  updatePhases: (id: string, phases: Phase[]) => Promise<void>;
  updateNotes: (id: string, notes: string) => Promise<void>;
  rescheduleBooking: (id: string, target: RescheduleTarget) => Promise<void>;
}

// What rescheduling needs to know about the salon: who the target stylist is
// (name, level) and what each service costs at each level.
interface SalonLookup {
  stylists: StylistInfo[];
  services: PriceSource[];
}

const useBookings = (salon: SalonLookup): UseBookings => {
  const salonRef = useRef(salon);
  useEffect(() => {
    salonRef.current = salon;
  }, [salon]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the current bookings so updateStatus can read the latest
  // value without needing bookings in its dependency array — prevents the
  // callback reference from changing on every render
  const bookingsRef = useRef<Booking[]>(bookings);
  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  // Subscribe to real-time booking updates via onSnapshot.
  // Scoped to a rolling 90-day window and forward — an unbounded subscription
  // streams the entire collection every admin session and grows without limit.
  // Consumers needing full history (analytics, client search) run their own
  // on-demand queries instead of reading this context.
  // Unsubscribes automatically on component unmount.
  useEffect(() => {
    const windowStart = addDays(todayString(), -90);
    const q = query(
      collection(db, "bookings").withConverter(bookingConverter),
      where("date", ">=", windowStart),
      orderBy("date", "asc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Converter applies defaults — no unchecked spread-cast needed
        setBookings(snapshot.docs.map((doc) => doc.data()));
        setLoading(false);
      },
      (err) => {
        console.error("Bookings subscription error:", err);
        setError("Failed to load bookings. Please refresh and try again.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Optimistic status update
  // Updates UI immediately, then writes to Firestore
  // On failure, rolls back and throws so the caller can show an error
  // Uses bookingsRef instead of bookings to keep this callback stable
  const updateStatus = useCallback(
    async (id: string, status: BookingStatus) => {
      // Read latest bookings from ref — avoids stale closure
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      // Patch for Firestore + the same fields for local state (statusPatch.ts)
      const { patch, local } = buildStatusPatch(previous, status);

      // Optimistic update — update UI immediately
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...local } : b)),
      );

      try {
        // Approve, decline, cancel and restore are SERVER commands: they re-check
        // the slot under the stylist-day lock, and write the booking and its
        // slotBlocks together (functions/src/bookingCommands.ts). They throw a
        // BookingCommandError (with a message fit to show) if the slot no longer
        // fits. Everything else moves a booking along its day and stays a plain
        // batch (adminBookingWrites.writeStatusChange).
        const command = commandForStatusChange(previous.status, status);
        if (command === "approve") await approveBooking(id);
        else if (command === "decline") await declineBooking(id);
        else if (command === "cancel") await cancelBooking(id);
        else if (command === "restore") await restoreBooking(id, status);
        else await writeStatusChange(db, previous, status, patch);
      } catch (err) {
        console.error("Error updating booking status:", err);

        // Rollback on failure — restore previous state
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status: previous.status,
                  arrivedAt: previous.arrivedAt,
                  restoreStatus: previous.restoreStatus,
                  history: previous.history,
                }
              : b,
          ),
        );

        throw err; // Re-throw so caller can show error toast
      }
    },
    [],
  ); // stable — no dependencies needed now that we use bookingsRef

  // Flag/unflag a booking for owner review (walk-in oddities, discrepancies).
  // Same optimistic-update-then-write-then-rollback pattern as updateStatus.
  const setFlag = useCallback(
    async (id: string, flagged: boolean, reason?: string) => {
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      const flagReason = flagged ? (reason ?? "").trim() : "";

      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, flagged, flagReason } : b)),
      );

      try {
        await updateDoc(doc(db, "bookings", id), { flagged, flagReason });
      } catch (err) {
        console.error("Error updating booking flag:", err);

        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  flagged: previous.flagged,
                  flagReason: previous.flagReason,
                }
              : b,
          ),
        );

        throw err;
      }
    },
    [],
  );

  // Save a new set of phases for ONE booking (per-booking customisation: the
  // service's defaults are never touched). Optimistic with rollback like the
  // rest, but the write itself runs in a transaction with the conflict check on
  // every busy block (adminBookingWrites.writePhaseEdit): a collision throws
  // BookingConflictError, the optimistic change is rolled back, nothing is saved.
  const updatePhases = useCallback(async (id: string, phases: Phase[]) => {
    const previous = bookingsRef.current.find((b) => b.id === id);
    if (!previous) return;

    const before = resolvePhases(previous);
    const fields = phaseWriteFields(previous.time, phases);
    const changed = JSON.stringify(before) !== JSON.stringify(phases);
    const historyEntry = phaseEditHistoryEntry(before, phases, fields.returnTime);

    setBookings((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              ...fields,
              returnTime: fields.returnTime,
              ...(changed
                ? { history: [...(b.history ?? []), historyEntry] }
                : {}),
            }
          : b,
      ),
    );

    try {
      await writePhaseEdit(db, previous, phases, historyEntry);
    } catch (err) {
      if (!(err instanceof BookingConflictError)) {
        console.error("Error updating booking phases:", err);
      }
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                phases: previous.phases,
                segments: previous.segments,
                activeTime: previous.activeTime,
                restTime: previous.restTime,
                totalTime: previous.totalTime,
                returnTime: previous.returnTime,
                history: previous.history,
              }
            : b,
        ),
      );
      throw err;
    }
  }, []);

  // The two-number form (hands-on, processing) used by the timeline's resize
  // handle and undo: the booking's phases with its first hands-on and first
  // processing phase set to these lengths.
  const updateTimes = useCallback(
    async (id: string, activeTime: number, restTime: number) => {
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;
      const phases = resolvePhases(previous);
      const next = phases.map((p) => ({ ...p }));
      const firstActive = next.findIndex((p) => p.type === "active");
      const firstRest = next.findIndex((p) => p.type === "rest");
      if (firstActive >= 0) next[firstActive].minutes = activeTime;
      if (firstRest >= 0) next[firstRest].minutes = restTime;
      else if (restTime > 0) next.push({ type: "rest", minutes: restTime });
      await updatePhases(id, next);
    },
    [updatePhases],
  );

  // Save a booking's free-text notes — optimistic with rollback, like the rest.
  const updateNotes = useCallback(async (id: string, notes: string) => {
    const previous = bookingsRef.current.find((b) => b.id === id);
    if (!previous) return;

    const trimmed = notes.trim();
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, notes: trimmed } : b)),
    );

    try {
      await updateDoc(doc(db, "bookings", id), { notes: trimmed });
    } catch (err) {
      console.error("Error updating booking notes:", err);
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, notes: previous.notes } : b)),
      );
      throw err;
    }
  }, []);

  // Move a booking to a new date / time / stylist.
  //  1. Refuses cancelled / no-show bookings (restore them first)
  //  2. Runs the walk-in conflict check against the target stylist's day,
  //     excluding this booking itself — rejects with BookingConflictError
  //  3. Writes the booking, its slotBlocks projection and a history entry in
  //     one batch; prices follow the new stylist's level (see reschedule.ts)
  const rescheduleBooking = useCallback(
    async (id: string, target: RescheduleTarget) => {
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) throw new Error("That booking could not be found.");
      if (isSlotFreeing(previous.status)) {
        throw new Error("Restore this booking before moving it.");
      }
      if (isSameSlot(previous, target)) return;

      const stylist: StylistInfo | undefined =
        target.stylistId === "any"
          ? { id: "any", name: "Any available stylist", level: "junior" }
          : salonRef.current.stylists.find((s) => s.id === target.stylistId);
      if (!stylist) throw new Error("Choose a stylist to move this booking to.");

      const clash = await fetchBookingConflict(db, {
        stylistId: target.stylistId,
        date: target.date,
        time: target.time,
        totalTime: previous.totalTime,
        activeTime: previous.activeTime,
        phases: previous.phases,
        excludeId: id,
      });
      if (clash) throw new BookingConflictError(clash);

      const { fields: baseFields, entry } = buildReschedule(
        previous,
        target,
        stylist,
        salonRef.current.services,
      );
      // The booking's phases move with it: new absolute segments, and the time
      // the stylist is first due back follows the phases (not just the total)
      const placed = phaseWriteFields(target.time, resolvePhases(previous));
      const fields = { ...baseFields, returnTime: placed.returnTime };

      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                ...fields,
                segments: placed.segments,
                history: [...(b.history ?? []), entry],
              }
            : b,
        ),
      );

      try {
        const { returnTime, ...rest } = fields;
        // Under the stylist-day lock, so a walk-in saved at the same instant
        // for the target slot cannot slip in alongside this move. The
        // PII-free availability projection follows the move, so the old slot
        // frees up and the new one blocks on the public calendar.
        await updateBookingWithSlotLock(
          db,
          id,
          {
            stylistId: target.stylistId,
            date: target.date,
            time: target.time,
            totalTime: previous.totalTime,
            activeTime: previous.activeTime,
            phases: previous.phases,
          },
          {
            ...rest,
            segments: placed.segments,
            returnTime: returnTime ?? deleteField(),
            history: arrayUnion(entry),
          },
          slotBlockSchedulePatch({
            ...previous,
            stylistId: fields.stylistId,
            date: fields.date,
            time: fields.time,
          }),
        );
      } catch (err) {
        console.error("Error rescheduling booking:", err);
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  date: previous.date,
                  time: previous.time,
                  stylistId: previous.stylistId,
                  stylistName: previous.stylistName,
                  stylistLevel: previous.stylistLevel,
                  servicePrice: previous.servicePrice,
                  services: previous.services,
                  returnTime: previous.returnTime,
                  history: previous.history,
                }
              : b,
          ),
        );
        throw err;
      }
    },
    [],
  );

  const getBooking = useCallback(
    (id: string) => bookingsRef.current.find((b) => b.id === id),
    [],
  );

  return {
    bookings,
    getBooking,
    loading,
    error,
    updateStatus,
    setFlag,
    updateTimes,
    updatePhases,
    updateNotes,
    rescheduleBooking,
  };
};

export default useBookings;
