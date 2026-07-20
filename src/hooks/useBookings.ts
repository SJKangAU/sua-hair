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
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { todayString, addDays } from "../lib/dates";
import { bookingConverter } from "../lib/converters";
import { computeReturnTime } from "../lib/scheduling";
import type { Booking } from "../types";

interface UseBookings {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  updateStatus: (
    id: string,
    status: "pending" | "confirmed" | "cancelled",
  ) => Promise<void>;
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
}

const useBookings = (): UseBookings => {
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
    async (id: string, status: "pending" | "confirmed" | "cancelled") => {
      // Read latest bookings from ref — avoids stale closure
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      // Optimistic update — update UI immediately
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b)),
      );

      try {
        // slotBlocks/{id} is the PII-free projection the public
        // availability calendar reads from — keep its status in sync so a
        // cancelled/confirmed booking's slot correctly frees up or stays
        // blocked. Batched so both writes succeed or fail together.
        const batch = writeBatch(db);
        batch.update(doc(db, "bookings", id), { status });
        batch.update(doc(db, "slotBlocks", id), { status });
        await batch.commit();
      } catch (err) {
        console.error("Error updating booking status:", err);

        // Rollback on failure — restore previous state
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, status: previous.status } : b,
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

  // Per-session time override — same optimistic-update-then-write-then-
  // rollback pattern as updateStatus/setFlag. Recomputes totalTime and the
  // locked returnTime from the new split so the timeline, booking cards, and
  // confirmation views stay consistent with the override immediately.
  const updateTimes = useCallback(
    async (id: string, activeTime: number, restTime: number) => {
      const previous = bookingsRef.current.find((b) => b.id === id);
      if (!previous) return;

      const totalTime = activeTime + restTime;
      const returnTime =
        restTime > 0 ? computeReturnTime(previous.time, totalTime) : undefined;

      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, activeTime, restTime, totalTime, returnTime }
            : b,
        ),
      );

      try {
        // Keep the slotBlocks projection's schedule fields in sync —
        // batched with the bookings write so they never drift apart.
        const batch = writeBatch(db);
        batch.update(doc(db, "bookings", id), {
          activeTime,
          restTime,
          totalTime,
          returnTime: returnTime ?? deleteField(),
        });
        batch.update(doc(db, "slotBlocks", id), {
          activeTime,
          restTime,
          totalTime,
        });
        await batch.commit();
      } catch (err) {
        console.error("Error updating booking times:", err);

        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  activeTime: previous.activeTime,
                  restTime: previous.restTime,
                  totalTime: previous.totalTime,
                  returnTime: previous.returnTime,
                }
              : b,
          ),
        );

        throw err;
      }
    },
    [],
  );

  return { bookings, loading, error, updateStatus, setFlag, updateTimes };
};

export default useBookings;
