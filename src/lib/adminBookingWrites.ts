// adminBookingWrites.ts
// How admin-created bookings (walk-ins and breaks) reach Firestore, and the
// shared slot-lock transaction every admin write that CLAIMS a slot uses
// (walk-in, break, restoring a cancelled booking, rescheduling).
//
//  - The document ID is always auto-generated, so a new booking can never
//    replace an existing one (the readable reference lives in `bookingRef`).
//  - The booking, its PII-free slotBlocks projection and (for a named client)
//    the customerLookups visit record are written together or not at all.
//  - The stylist's day is checked with the customer flow's own rest-aware
//    overlap rules; a clash throws BookingConflictError and writes nothing.
//  - Two admins cannot race. The Firestore client SDK cannot query inside a
//    transaction, so each slot-claiming write runs in a transaction that FIRST
//    reads the `stylistDayLocks/{date}_{stylistId}` document, THEN runs the
//    conflict query, and commits a bumped version of that lock together with
//    its own writes. If another admin committed in between, the lock changed,
//    Firestore aborts this transaction and it re-runs — re-querying, and now
//    seeing the other booking. Every admin write path must go through here.
//
// This serialises ADMIN writes only. A customer's online booking still writes
// directly (the public rules do not let anonymous visitors touch the lock), so
// an online booking landing in the same instant as an admin walk-in is not
// prevented — see docs/PILOT_READINESS.md "Remaining risks".
//
// Takes the Firestore instance as an argument so tests can run it against the
// emulator with real security rules.

import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  increment,
  runTransaction,
  writeBatch,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import { BookingConflictError, fetchBookingConflict } from "./bookingConflicts";
import { isSlotFreeing } from "./bookingStatus";
import { slotBlockSchedulePatch, toSlotBlock } from "./slotBlockData";
import { phaseWriteFields } from "./phaseFields";
import { cleanPhone } from "./validation";
import type { ConflictProbe } from "./scheduling";
import type { Booking, BookingHistoryEntry, Phase } from "../types";

// Admin concurrency is a handful of people at most; allow more optimistic
// retries than the SDK default of 5 so a busy moment never surfaces as a
// confusing "aborted" error instead of a clean result.
const LOCK_TRANSACTION_ATTEMPTS = 10;

export const slotLockId = (stylistId: string, date: string): string =>
  `${date}_${stylistId}`;

// Runs `write` inside a transaction that holds the stylist-day lock and has
// just confirmed the probe's slot is free. Throws BookingConflictError (and
// writes nothing) when it is not.
export const withSlotLock = <T>(
  firestore: Firestore,
  probe: ConflictProbe,
  write: (tx: Transaction) => T,
): Promise<T> =>
  runTransaction(
    firestore,
    async (tx) => {
      const lockRef = doc(
        firestore,
        "stylistDayLocks",
        slotLockId(probe.stylistId, probe.date),
      );
      const lock = await tx.get(lockRef);

      const clash = await fetchBookingConflict(firestore, probe);
      if (clash) throw new BookingConflictError(clash);

      const version = (lock.data()?.version as number | undefined) ?? 0;
      tx.set(lockRef, { version: version + 1, updatedAt: new Date().toISOString() });
      return write(tx);
    },
    { maxAttempts: LOCK_TRANSACTION_ATTEMPTS },
  );

export const createAdminBooking = (
  firestore: Firestore,
  booking: Omit<Booking, "id">,
): Promise<string> => {
  const ref = doc(collection(firestore, "bookings"));
  return withSlotLock(
    firestore,
    {
      stylistId: booking.stylistId,
      date: booking.date,
      time: booking.time,
      totalTime: booking.totalTime,
      activeTime: booking.activeTime,
      phases: booking.phases,
    },
    (tx) => {
      tx.set(ref, booking);
      tx.set(doc(firestore, "slotBlocks", ref.id), toSlotBlock(booking));
      if (booking.customerPhone.trim()) {
        tx.set(
          doc(firestore, "customerLookups", cleanPhone(booking.customerPhone)),
          {
            name: booking.customerName,
            lastVisit: booking.date,
            visitCount: increment(1),
          },
          { merge: true },
        );
      }
      return ref.id;
    },
  );
};

// Moves an existing booking (and its slotBlocks projection) into the slot in
// `probe`, under the same lock and conflict check as a new booking. The
// booking's own record is ignored by the check, so staying put is not a clash.
export const updateBookingWithSlotLock = (
  firestore: Firestore,
  id: string,
  probe: ConflictProbe,
  bookingPatch: Record<string, unknown>,
  slotBlockPatch: Record<string, unknown>,
): Promise<void> =>
  withSlotLock(firestore, { ...probe, excludeId: id }, (tx) => {
    tx.update(doc(firestore, "bookings", id), bookingPatch);
    tx.update(doc(firestore, "slotBlocks", id), slotBlockPatch);
  });

// Writes a status change. Cancelling, completing, confirming etc. just release
// or keep the slot, so they are a plain batch. BRINGING BACK a cancelled /
// no-show booking claims the slot again - someone may have booked it since -
// so that goes through the slot lock and throws BookingConflictError if taken.
export const writeStatusChange = async (
  firestore: Firestore,
  previous: Pick<
    Booking,
    | "id"
    | "status"
    | "stylistId"
    | "date"
    | "time"
    | "totalTime"
    | "activeTime"
    | "phases"
  >,
  status: Booking["status"],
  patch: Record<string, unknown>,
): Promise<void> => {
  const restoring = isSlotFreeing(previous.status) && !isSlotFreeing(status);
  if (restoring) {
    await updateBookingWithSlotLock(
      firestore,
      previous.id,
      {
        stylistId: previous.stylistId,
        date: previous.date,
        time: previous.time,
        totalTime: previous.totalTime,
        activeTime: previous.activeTime,
        phases: previous.phases,
      },
      patch,
      { status },
    );
    return;
  }
  // slotBlocks/{id} is the PII-free projection the public availability
  // calendar reads - keep its status in sync, batched so both writes succeed
  // or fail together.
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, "bookings", previous.id), patch);
  batch.update(doc(firestore, "slotBlocks", previous.id), { status });
  await batch.commit();
};

// Saves a new set of phases for ONE booking, in a transaction with its conflict
// check: the lock is taken, every busy block of the new shape is checked against
// every other booking for the stylist, and the booking and its slotBlocks
// projection are written together. Throws BookingConflictError (naming the
// clashing booking) and writes nothing if it would collide. The service the
// booking came from is never touched.
export const writePhaseEdit = (
  firestore: Firestore,
  previous: Pick<
    Booking,
    | "id"
    | "stylistId"
    | "date"
    | "time"
    | "status"
    | "activeTime"
    | "restTime"
    | "totalTime"
  >,
  phases: Phase[],
  historyEntry: BookingHistoryEntry,
): Promise<void> => {
  const fields = phaseWriteFields(previous.time, phases);
  const { returnTime, ...rest } = fields;
  return updateBookingWithSlotLock(
    firestore,
    previous.id,
    {
      stylistId: previous.stylistId,
      date: previous.date,
      time: previous.time,
      totalTime: fields.totalTime,
      activeTime: fields.activeTime,
      phases,
    },
    {
      ...rest,
      returnTime: returnTime ?? deleteField(),
      history: arrayUnion(historyEntry),
    },
    slotBlockSchedulePatch({ ...previous, ...fields }),
  );
};
