// changePolicy.ts
// The salon's cancellation and change policy (FR-028, DEC-054): what a customer may do to
// their own booking from the link in their email or text. The owner sets it in Manage; the
// customer's page and the server both apply it, so the page can only ever show what the
// server will allow. Pure - shared by the functions, the Manage screen and the customer page.
//
// Defaults: a customer may cancel a confirmed booking up to 24 hours before; a reschedule is
// a new request the owner approves (and the original stays until it is); a pending request
// may be cancelled at any time.

import { businessInstant } from "./businessTime";
import { timeStringToMinutes } from "./scheduling";

export type RescheduleMode = "request" | "instant";

export interface ChangePolicy {
  /** A customer may cancel a confirmed booking (before the cutoff) */
  allowCancel: boolean;
  /** A customer may ask to move a confirmed booking (before the cutoff) */
  allowReschedule: boolean;
  /** How long before the appointment changes close; 0 = right up to the start */
  cutoffHours: number;
  /** "request": the owner approves a move first. "instant": it moves at once if the time is free. */
  rescheduleMode: RescheduleMode;
  /** What the customer reads once it is too late (the phone number is shown beside it) */
  pastCutoffMessage: string;
}

export const MAX_CUTOFF_HOURS = 720; // 30 days
export const MAX_MESSAGE_LENGTH = 300;

export const DEFAULT_CHANGE_POLICY: ChangePolicy = {
  allowCancel: true,
  allowReschedule: true,
  cutoffHours: 24,
  rescheduleMode: "request",
  pastCutoffMessage: "It's too close to your appointment to change it online. Please call the salon.",
};

/** What is wrong with a policy, in words for the owner; an empty list when fine. */
export const policyProblems = (p: ChangePolicy): string[] => {
  const out: string[] = [];
  if (!Number.isInteger(p.cutoffHours) || p.cutoffHours < 0 || p.cutoffHours > MAX_CUTOFF_HOURS) {
    out.push(`The cutoff must be a whole number of hours from 0 to ${MAX_CUTOFF_HOURS}.`);
  }
  if (p.pastCutoffMessage.trim() === "") out.push("Write what customers should read once it is too late.");
  if (p.pastCutoffMessage.length > MAX_MESSAGE_LENGTH) {
    out.push(`Keep that message to ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }
  return out;
};

/** Whatever is stored (possibly nothing) -> a complete, safe policy. Bad fields fall back to the default. */
export const effectivePolicy = (raw: unknown): ChangePolicy => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CHANGE_POLICY;
  const cutoff = typeof r.cutoffHours === "number" && Number.isInteger(r.cutoffHours) ? r.cutoffHours : d.cutoffHours;
  const message = typeof r.pastCutoffMessage === "string" ? r.pastCutoffMessage : d.pastCutoffMessage;
  const policy: ChangePolicy = {
    allowCancel: typeof r.allowCancel === "boolean" ? r.allowCancel : d.allowCancel,
    allowReschedule: typeof r.allowReschedule === "boolean" ? r.allowReschedule : d.allowReschedule,
    cutoffHours: cutoff,
    rescheduleMode: r.rescheduleMode === "instant" ? "instant" : "request",
    pastCutoffMessage: message,
  };
  const bad = policyProblems(policy);
  return bad.length === 0 ? policy : { ...policy, cutoffHours: d.cutoffHours, pastCutoffMessage: d.pastCutoffMessage };
};

export interface ChangeableBooking {
  bookingType?: string;
  status?: string;
  date?: string;
  time?: string;
  /** This booking is itself a change request waiting for approval */
  replacesBookingId?: string;
}

export interface ChangeRights {
  canCancel: boolean;
  canChange: boolean;
  /** Why not, in words for the customer (null when both are allowed) */
  reason: string | null;
  /** The change closes at this instant (confirmed bookings only) */
  closesAt: number | null;
}

const NONE = (reason: string): ChangeRights => ({ canCancel: false, canChange: false, reason, closesAt: null });

/**
 * What the customer may do with this booking right now.
 *   pending    cancel (always); a change is a new request, not a move
 *   confirmed  cancel / move, each only if the policy allows it and the cutoff has not passed
 *   anything else (arrived, completed, cancelled, no-show...) nothing
 */
export const changeRights = (policy: ChangePolicy, b: ChangeableBooking, nowMs: number): ChangeRights => {
  if (b.bookingType !== "customer" && b.bookingType !== "walkin") {
    return NONE("This booking can't be changed online. Please call the salon.");
  }
  if (b.status === "pending") {
    return {
      canCancel: true,
      canChange: false,
      reason: b.replacesBookingId
        ? "This is a request to move your booking. Your original time stays until the salon approves it."
        : "This request is waiting for the salon. You can cancel it, or call the salon to change it.",
      closesAt: null,
    };
  }
  if (b.status !== "confirmed") return NONE("This booking can no longer be changed online.");

  const start = businessInstant(b.date ?? "", timeStringToMinutes(b.time ?? ""));
  if (start === null) return NONE("This booking can't be changed online. Please call the salon.");
  const closesAt = start - policy.cutoffHours * 3_600_000;
  if (nowMs > closesAt) return { canCancel: false, canChange: false, reason: policy.pastCutoffMessage, closesAt };

  const canCancel = policy.allowCancel;
  const canChange = policy.allowReschedule;
  if (canCancel && canChange) return { canCancel, canChange, reason: null, closesAt };
  return {
    canCancel,
    canChange,
    closesAt,
    reason: !canCancel && !canChange
      ? "Changes to this booking aren't made online. Please call the salon."
      : !canCancel
        ? "To cancel this booking, please call the salon."
        : "To move this booking, please call the salon or cancel it and book again.",
  };
};
