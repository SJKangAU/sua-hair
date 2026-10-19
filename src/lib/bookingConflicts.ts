// bookingConflicts.ts
// Firestore-backed conflict lookup for admin booking writes (walk-ins and
// breaks today; rescheduling next). Reads the authoritative `bookings`
// collection for the stylist and date — not the in-memory context, which is
// a rolling window and may be a moment behind — then applies the same
// overlap rules as the customer flow via findBookingConflict.
//
// This is check-then-write, not a transaction: the Firestore client SDK
// cannot run queries inside a transaction, so two staff saving the same slot
// within the same second could both pass. Auto-generated document IDs mean
// that worst case is a double-booking you can see, never a silent overwrite.

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { bookingConverter } from "./converters";
import { findBookingConflict, type ConflictProbe } from "./scheduling";
import type { Booking } from "../types";

export const fetchBookingConflict = async (
  probe: ConflictProbe,
): Promise<Booking | null> => {
  const snap = await getDocs(
    query(
      collection(db, "bookings").withConverter(bookingConverter),
      where("date", "==", probe.date),
      where("stylistId", "==", probe.stylistId),
    ),
  );
  return findBookingConflict(
    probe,
    snap.docs.map((d) => d.data()),
  );
};
