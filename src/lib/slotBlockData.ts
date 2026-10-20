// slotBlockData.ts
// The PII-free `slotBlocks/{id}` projection of a booking (see slotBlocks.ts for
// why it exists). Kept free of any Firebase app import so both the batched
// write path (slotBlocks.ts) and the transactional admin write path
// (adminBookingWrites.ts, which also runs against the emulator in tests) share
// one definition of which fields are copied.

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
>;

export const toSlotBlock = (booking: SlotBlockSource) => ({
  stylistId: booking.stylistId,
  date: booking.date,
  time: booking.time,
  activeTime: booking.activeTime,
  totalTime: booking.totalTime,
  restTime: booking.restTime,
  status: booking.status,
});
