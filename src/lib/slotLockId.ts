// slotLockId.ts
// The id of the per-stylist-per-day lock document (stylistDayLocks/{id}). Every
// writer that claims a slot - the owner's browser (adminBookingWrites.ts) and the
// booking functions (functions/src/bookingCommands.ts) - reads and bumps the SAME
// document in the same transaction as its conflict check, which is what makes two
// writers unable to take one slot. Kept in its own file, free of any Firebase
// import, so both sides share one definition of the id.

export const slotLockId = (stylistId: string, date: string): string =>
  `${date}_${stylistId}`;
