// slotBlockData.ts
// The PII-free `slotBlocks/{id}` projection of a booking.
//
// Why it exists: Firestore Security Rules cannot redact individual fields from an
// authorized document read - a rule either authorizes the whole document or it
// doesn't. A public calendar that queried `bookings` would hand any visitor (or
// anyone scripting the public Firebase Web SDK config) every customerName,
// customerPhone and note. So the public booking calendar reads only `slotBlocks`,
// which carries just what src/lib/scheduling.ts needs to compute availability -
// stylistId, date, time, activeTime, totalTime, restTime, status and the busy
// blocks - and never any customer-identifying field. `slotBlocks/{id}` shares the
// booking's document ID (not duplicated as a field). Anonymous visitors can READ it
// and nothing else (firestore.rules).
//
// Every write that creates or changes a booking writes this projection in the same
// transaction: the booking functions (functions/src/bookingCommands.ts) and the
// owner's browser writes (adminBookingWrites.ts, useBookings.ts). Kept free of any
// Firebase import so they all share one definition of which fields are copied.

import { slotFootprint } from "./scheduling";
import type { Booking } from "../types";

export type SlotBlockSource = Pick<
  Booking,
  | "stylistId"
  | "date"
  | "time"
  | "activeTime"
  | "totalTime"
  | "restTime"
  | "status"
> &
  Partial<Pick<Booking, "phases">>;

// The busy blocks are the whole point of the projection: public availability is
// computed from where the stylist is hands-on (and when she is due back), never
// from a customer's identity. `busy` is minutes from midnight; `returnAt` is the
// minute she is due back when the booking ends in processing, else null.
export const toSlotBlock = (booking: SlotBlockSource) => {
  const fp = slotFootprint(booking);
  return {
    stylistId: booking.stylistId,
    date: booking.date,
    time: booking.time,
    activeTime: booking.activeTime,
    totalTime: booking.totalTime,
    restTime: booking.restTime,
    status: booking.status,
    busy: fp.busy.map((b) => ({ start: b.start, end: b.end })),
    returnAt: fp.returnAt,
  };
};

// The projection fields that change when only the schedule changes (a phase
// edit or a reschedule); status etc. are written separately.
export const slotBlockSchedulePatch = (booking: SlotBlockSource) => {
  const { busy, returnAt, activeTime, restTime, totalTime, time, date, stylistId } =
    toSlotBlock(booking);
  return { stylistId, date, time, activeTime, restTime, totalTime, busy, returnAt };
};
