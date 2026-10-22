// bookingApi.ts
// The browser's side of the booking commands (functions/src/bookingCommands.ts).
// Customers and the owner no longer write bookings themselves for these actions:
// they ask the server, which validates, prices, assigns a stylist, re-checks the
// slot under the stylist-day lock and writes the booking and its public
// availability projection together (DEC-035).
//
//   createBookingRequest   public    a customer's request; holds the slot
//   joinWaitlist           public    a waitlist entry
//   approveBooking         owner     pending -> confirmed
//   declineBooking         owner     pending -> cancelled
//   cancelBooking          owner     any open booking -> cancelled
//   restoreBooking         owner     cancelled / no-show -> back
//   assignStylist          owner     a legacy "any" booking -> a real stylist
//
// Every refusal arrives as a BookingCommandError whose message is written to be
// shown to the person as it is.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { BookingStatus } from "../types";

export type BookingCommandReason =
  | "invalid"
  | "closed"
  | "blocked"
  | "limit"
  | "rate-limited"
  | "slot-taken"
  | "not-found"
  | "precondition"
  | "needs-stylist"
  | "network"
  | "unknown";

export class BookingCommandError extends Error {
  readonly reason: BookingCommandReason;

  constructor(reason: BookingCommandReason, message: string) {
    super(message);
    this.name = "BookingCommandError";
    this.reason = reason;
  }
}

const SERVER_FAULT =
  "Something went wrong on our side. Please try again, or call us on (03) 9569 0840.";

const toCommandError = (err: unknown): BookingCommandError => {
  const e = err as { code?: string; message?: string; details?: { reason?: string } };
  const code = (e.code ?? "").replace(/^functions\//, "");
  const reason = e.details?.reason as BookingCommandReason | undefined;
  if (code === "unavailable" || code === "deadline-exceeded") {
    return new BookingCommandError(
      "network",
      "We couldn't reach the server. Please check your connection and try again.",
    );
  }
  if (code === "internal" || code === "unknown" || code === "unauthenticated") {
    return new BookingCommandError("unknown", SERVER_FAULT);
  }
  return new BookingCommandError(reason ?? "unknown", e.message || SERVER_FAULT);
};

const call = async <In, Out>(name: string, data: In): Promise<Out> => {
  try {
    const res = await httpsCallable<In, Out>(functions, name)(data);
    return res.data;
  } catch (err) {
    throw toCommandError(err);
  }
};

// ── Customer ────────────────────────────────────────────────────────────────

/** What the customer sends: choices and contact details - never a price or phases. */
export interface BookingRequestInput {
  serviceIds: string[];
  /** a stylist id, or "any" for no preference (the server assigns a real one) */
  stylistId: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  consent: true;
  /** Ticked the optional box to hear about coming back (FR-030) */
  marketingConsent?: true;
  /** makes a retry of the same request return the same booking */
  requestId: string;
}

/** What the server decided. "pending" means REQUEST RECEIVED, not confirmed. */
export interface BookingRequestResult {
  bookingId: string;
  bookingRef: string;
  status: "pending";
  stylistId: string;
  stylistName: string;
  stylistLevel: "director" | "senior" | "junior";
  assignedAutomatically: boolean;
  date: string;
  time: string;
  totalTime: number;
  activeTime: number;
  restTime: number;
  /** when the stylist is first due back, if the booking has a processing gap */
  returnTime?: string;
  services: { id: string; name: string; price: number }[];
  total: number;
  holdExpiresAt: string;
}

export const createBookingRequest = (input: BookingRequestInput) =>
  call<BookingRequestInput, BookingRequestResult>("createBookingRequest", input);

export interface WaitlistInput {
  customerName: string;
  customerPhone: string;
  requestedDate: string;
  requestedStylistId?: string;
}

export const joinWaitlist = (input: WaitlistInput) =>
  call<WaitlistInput, { waitlistId: string }>("joinWaitlist", input);

/** A fresh id for one booking attempt (reused if the same attempt is retried). */
export const newRequestId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// ── Owner ───────────────────────────────────────────────────────────────────

interface Outcome {
  bookingId: string;
  status: BookingStatus;
}

export const approveBooking = (bookingId: string) =>
  call<{ bookingId: string }, Outcome>("approveBooking", { bookingId });

export const declineBooking = (bookingId: string) =>
  call<{ bookingId: string }, Outcome>("declineBooking", { bookingId });

export const cancelBooking = (bookingId: string) =>
  call<{ bookingId: string }, Outcome>("cancelBooking", { bookingId });

export const restoreBooking = (bookingId: string, status?: BookingStatus) =>
  call<{ bookingId: string; status?: BookingStatus }, Outcome>("restoreBooking", {
    bookingId,
    ...(status ? { status } : {}),
  });

export const assignStylist = (bookingId: string, stylistId: string) =>
  call<
    { bookingId: string; stylistId: string },
    Outcome & { price: number; stylistName: string }
  >("assignStylist", { bookingId, stylistId });

/**
 * Which command a status change is, when it needs the server's slot check. Changes
 * that only move a booking along its day (arrived, in service, completed, no-show,
 * confirmed -> confirmed...) stay direct writes.
 */
export const commandForStatusChange = (
  from: BookingStatus,
  to: BookingStatus,
): "approve" | "decline" | "cancel" | "restore" | null => {
  const released = from === "cancelled" || from === "no_show";
  if (from === "pending" && to === "confirmed") return "approve";
  if (from === "pending" && to === "cancelled") return "decline";
  if (to === "cancelled" && !released) return "cancel";
  if (released && to !== "cancelled" && to !== "no_show") return "restore";
  return null;
};

// ── A customer's own booking, from the link in their email or text (FR-028) ──
// The link carries the booking id and a secret; the server checks both and the salon's
// change policy (src/lib/changePolicy.ts), so what is offered here is what it will allow.

export interface ManagedBookingView {
  bookingId: string;
  status: BookingStatus;
  firstName: string;
  date: string;
  time: string;
  serviceName: string;
  stylistName: string;
  totalTime: number;
  canCancel: boolean;
  canChange: boolean;
  /** Why not, in words for the customer (null when both are allowed) */
  reason: string | null;
  /** When changes close (ISO), for confirmed bookings */
  closesAt: string | null;
  rescheduleMode: "request" | "instant";
  pendingChange: { bookingId: string; date: string; time: string } | null;
  replacesSummary: string | null;
  salonPhone: string;
}

export const getManagedBooking = (bookingId: string, token: string) =>
  call<{ bookingId: string; token: string }, ManagedBookingView>("getManagedBooking", { bookingId, token });

export const listChangeSlots = (bookingId: string, token: string, date: string) =>
  call<{ bookingId: string; token: string; date: string }, { date: string; times: string[] }>("listChangeSlots", {
    bookingId,
    token,
    date,
  });

export const cancelManagedBooking = (bookingId: string, token: string) =>
  call<{ bookingId: string; token: string }, { status: BookingStatus }>("cancelManagedBooking", { bookingId, token });

export const requestBookingChange = (bookingId: string, token: string, date: string, time: string) =>
  call<
    { bookingId: string; token: string; date: string; time: string },
    { bookingId: string; status: "pending" | "confirmed"; date: string; time: string }
  >("requestBookingChange", { bookingId, token, date, time });
