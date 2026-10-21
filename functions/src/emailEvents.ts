// functions/src/emailEvents.ts
// Which email a booking change should send (DEC-038: "pending" means REQUEST
// RECEIVED and only an approval means confirmed). Pure, so it is unit-tested; the
// triggers in index.ts do the sending.
//
//   created pending (online request)   -> "received"   We have your request; not confirmed yet
//   created confirmed (walk-in/admin)   -> "confirmed"
//   pending -> confirmed (approval)     -> "confirmed"
//   pending -> cancelled (declined or
//     expired)                          -> "not_confirmed"
//
// Anything else (arrived, completed, a confirmed booking later cancelled by the
// owner...) sends nothing: the salon talks to the customer about those.

export type BookingEmailKind = "received" | "confirmed" | "not_confirmed";

interface Shape {
  bookingType?: string;
  status?: string;
}

const isCustomerFacing = (b: Shape): boolean =>
  b.bookingType === "customer" || b.bookingType === "walkin";

export const emailKindOnCreate = (after: Shape): BookingEmailKind | null => {
  if (!isCustomerFacing(after)) return null;
  if (after.status === "pending") return "received";
  if (after.status === "confirmed") return "confirmed";
  return null;
};

export const emailKindOnUpdate = (
  before: Shape,
  after: Shape,
): BookingEmailKind | null => {
  if (!isCustomerFacing(after) || before.status === after.status) return null;
  if (before.status === "pending" && after.status === "confirmed") return "confirmed";
  if (before.status === "pending" && after.status === "cancelled") return "not_confirmed";
  return null;
};

export const idempotencyKey = (kind: BookingEmailKind, bookingId: string): string =>
  `${kind}-${bookingId}`;
