// bookingConflicts.ts
// Firestore-backed conflict lookup for admin booking writes (walk-ins, breaks,
// restoring a cancelled booking and rescheduling). Reads the authoritative
// `bookings` collection for the stylist and date — not the in-memory context,
// which is a rolling window and may be a moment behind — then applies the same
// overlap rules as the customer flow via findBookingConflict.
//
// The Firestore client SDK cannot run queries inside a transaction, so this
// lookup on its own is check-then-write: two staff saving the same slot within
// the same second could both pass. adminBookingWrites.ts closes that gap by
// running the lookup inside a transaction that also reads and bumps a
// per-stylist-per-day lock document (see slotLock there).
//
// Takes the Firestore instance as an argument (rather than importing the app's
// own) so the same code runs against the emulator in tests.

import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import { bookingConverter } from "./converters";
import {
  describeConflict,
  findBookingConflict,
  type ConflictProbe,
} from "./scheduling";
import type { Booking } from "../types";

// Thrown when a write would double-book a stylist. The message names the
// clashing booking so the UI can show it inline as-is.
export class BookingConflictError extends Error {
  readonly conflict: Booking;

  constructor(conflict: Booking) {
    super(
      `${conflict.stylistName || "That stylist"} is already booked at that time: ${describeConflict(
        conflict,
      )}.`,
    );
    this.name = "BookingConflictError";
    this.conflict = conflict;
  }
}

export const fetchBookingConflict = async (
  firestore: Firestore,
  probe: ConflictProbe,
): Promise<Booking | null> => {
  const snap = await getDocs(
    query(
      collection(firestore, "bookings").withConverter(bookingConverter),
      where("date", "==", probe.date),
      where("stylistId", "==", probe.stylistId),
    ),
  );
  return findBookingConflict(
    probe,
    snap.docs.map((d) => d.data()),
  );
};
