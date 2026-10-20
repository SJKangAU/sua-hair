// slotBlockData.ts
// The PII-free `slotBlocks/{id}` projection of a booking (see slotBlocks.ts for
// why it exists). Kept free of any Firebase app import so both the batched
// write path (slotBlocks.ts) and the transactional admin write path
// (adminBookingWrites.ts, which also runs against the emulator in tests) share
// one definition of which fields are copied.

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
