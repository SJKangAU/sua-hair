// slotBlocks.ts
// Keeps the public-readable `slotBlocks` projection collection in sync with
// the authenticated-only `bookings` collection.
//
// Why this exists: Firestore Security Rules cannot redact individual fields
// from an authorized document read — a rule either authorizes the whole
// document or it doesn't. The public booking calendar previously queried
// `bookings` directly by date, which meant any anonymous visitor (or anyone
// scripting the public Firebase Web SDK config directly) could retrieve
// complete booking records — customerName, customerPhone, notes — for any
// date range. Firestore Rules also can't distinguish "this specific query
// shape" from "any query an attacker crafts", so the only real fix is to
// stop putting PII in the collection the public app is allowed to read.
//
// `slotBlocks/{bookingId}` documents share the booking's document ID and
// carry only the fields src/lib/scheduling.ts needs to compute availability
// — stylistId, date, time, activeTime, totalTime, restTime, status — never
// any customer-identifying field. See firestore.rules: `bookings` requires
// staff auth to read; `slotBlocks` is public-read.
//
// Every booking create/status-change/time-edit write site must also write
// the corresponding slotBlocks projection (batched so both writes succeed
// or fail together). See BookingForm.tsx, CreateBookingModal.tsx,
// TrainingForm.tsx, and useBookings.ts.

import { doc, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { Booking } from "../types";

type SlotBlockSource = Pick<
  Booking,
  | "stylistId"
  | "date"
  | "time"
  | "activeTime"
  | "totalTime"
  | "restTime"
  | "status"
>;

// Queues the paired `slotBlocks/{id}` create onto an existing batch so a new
// booking and its public availability projection commit atomically. The
// document ID (== the booking ID) is the identifier — it is intentionally
// NOT duplicated as a field, so it can't drift from the doc it's attached
// to and so firestore.rules' field allow-list stays simple.
export const queueSlotBlockCreate = (
  batch: WriteBatch,
  id: string,
  booking: SlotBlockSource,
): void => {
  batch.set(doc(db, "slotBlocks", id), {
    stylistId: booking.stylistId,
    date: booking.date,
    time: booking.time,
    activeTime: booking.activeTime,
    totalTime: booking.totalTime,
    restTime: booking.restTime,
    status: booking.status,
  });
};
