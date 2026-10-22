// timeOff.ts
// Stylist days off and blocked times (FR-029, DEC-055): the rules for asking for them, which
// existing bookings they would clash with, and how they become "break" blocks on the
// calendar - which the timeline, the customer booking page and every conflict check already
// understand. A stylist asks; the owner (or a stylist the owner trusts with "approve time
// off") decides. Pure - shared by the functions, the owner's and the stylists' screens.
//
//   dayoff  one or more whole days (the stylist's working hours that day), a date range
//   block   one stretch of time on one day (an appointment, an errand)
//
// A block is laid AROUND the bookings already there: the free stretches of the window become
// breaks, and a booking the owner chooses to keep stays exactly where it is.

import { addDaysToDate, daysBetweenDates, isValidDateString, parseTime12h } from "./businessTime";
import { minutesToTimeString, timeStringToMinutes } from "./scheduling";
import { findFreeIntervals } from "./timelineLayout";

export type TimeOffKind = "dayoff" | "block";
export type TimeOffStatus = "pending" | "approved" | "declined" | "withdrawn";

export const MAX_RANGE_DAYS = 60;
export const MAX_AHEAD_DAYS = 365;
export const MAX_REASON_LENGTH = 200;
const GRID_MINUTES = 15;

export interface TimeOffInput {
  stylistId: string;
  kind: TimeOffKind;
  startDate: string;
  endDate: string;
  /** Blocks only, "10:30 AM" */
  startTime?: string;
  endTime?: string;
  reason: string;
}

/** A request as stored (timeOff/{id}) and shown. */
export interface TimeOffRecord extends TimeOffInput {
  id: string;
  stylistName: string;
  status: TimeOffStatus;
  requestedByUid: string;
  requestedByName: string;
  requestedAt: string;
  decidedByUid?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** Applied straight away by the policy, without anyone deciding */
  auto?: boolean;
  breakIds: string[];
}

/** A client's booking a request would clash with. */
export interface Clash {
  id: string;
  date: string;
  time: string;
  status: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Any input -> a valid request or the reason it is not one, in words for the person asking. */
export const parseTimeOffInput = (raw: unknown, today: string): Parsed<TimeOffInput> => {
  if (typeof raw !== "object" || raw === null) return fail("Something went wrong with that request.");
  const r = raw as Record<string, unknown>;
  const stylistId = typeof r.stylistId === "string" ? r.stylistId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(stylistId)) return fail("Choose which stylist this is for.");
  const kind = r.kind;
  if (kind !== "dayoff" && kind !== "block") return fail("Choose a day off or a block of time.");

  const startDate = typeof r.startDate === "string" ? r.startDate : "";
  if (!isValidDateString(startDate)) return fail("Choose a valid date.");
  const endDate = kind === "dayoff" ? (typeof r.endDate === "string" && r.endDate !== "" ? r.endDate : startDate) : startDate;
  if (!isValidDateString(endDate)) return fail("Choose a valid last day.");
  if (startDate < today) return fail("That date has already passed.");
  if (endDate < startDate) return fail("The last day can't be before the first day.");
  if (daysBetweenDates(today, endDate) > MAX_AHEAD_DAYS) return fail("That's too far ahead. Please choose a nearer date.");
  if (daysBetweenDates(startDate, endDate) + 1 > MAX_RANGE_DAYS) {
    return fail(`Ask for up to ${MAX_RANGE_DAYS} days at a time.`);
  }

  const reason = (typeof r.reason === "string" ? r.reason : "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (reason.length > MAX_REASON_LENGTH) return fail(`Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.`);

  const base = { stylistId, kind, startDate, endDate, reason } as TimeOffInput;
  if (kind === "dayoff") return { ok: true, value: base };

  const startTime = typeof r.startTime === "string" ? r.startTime : "";
  const endTime = typeof r.endTime === "string" ? r.endTime : "";
  const s = parseTime12h(startTime);
  const e = parseTime12h(endTime);
  if (!s || !e) return fail("Choose a start and an end time.");
  const startMin = s.hour * 60 + s.minute;
  const endMin = e.hour * 60 + e.minute;
  if (endMin <= startMin) return fail("The end time must be after the start time.");
  if (startMin % GRID_MINUTES !== 0 || endMin % GRID_MINUTES !== 0) {
    return fail(`Times are in ${GRID_MINUTES}-minute steps.`);
  }
  return {
    ok: true,
    value: { ...base, startTime: minutesToTimeString(startMin), endTime: minutesToTimeString(endMin) },
  };
};

export const datesInRange = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = start; d <= end && out.length <= MAX_RANGE_DAYS; d = addDaysToDate(d, 1)) out.push(d);
  return out;
};

// ── The owner's policy for a request that is waiting ─────────────────────────

export type PendingBehaviour = "hold" | "wait" | "auto";

export interface TimeOffPolicy {
  /**
   * hold  the time is blocked for customers as soon as it is asked for (released if declined)
   * wait  nothing is blocked until it is approved
   * auto  a short block applies at once and the owner is told; anything longer is held like "hold"
   */
  pending: PendingBehaviour;
  /** "auto": blocks up to this many hours on one day apply at once */
  autoMaxHours: number;
}

export const DEFAULT_TIME_OFF_POLICY: TimeOffPolicy = { pending: "hold", autoMaxHours: 3 };

export const timeOffPolicyProblems = (p: TimeOffPolicy): string[] =>
  Number.isInteger(p.autoMaxHours) && p.autoMaxHours >= 1 && p.autoMaxHours <= 12
    ? []
    : ["Short blocks can be 1 to 12 hours."];

export const effectiveTimeOffPolicy = (raw: unknown): TimeOffPolicy => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pending: PendingBehaviour = r.pending === "wait" || r.pending === "auto" ? r.pending : "hold";
  const hours = typeof r.autoMaxHours === "number" && Number.isInteger(r.autoMaxHours) ? r.autoMaxHours : DEFAULT_TIME_OFF_POLICY.autoMaxHours;
  const p: TimeOffPolicy = { pending, autoMaxHours: hours };
  return timeOffPolicyProblems(p).length === 0 ? p : { pending, autoMaxHours: DEFAULT_TIME_OFF_POLICY.autoMaxHours };
};

/** A single-day block no longer than the policy's "short". */
export const isShortBlock = (input: TimeOffInput, policy: TimeOffPolicy): boolean => {
  if (input.kind !== "block" || !input.startTime || !input.endTime) return false;
  const minutes = timeStringToMinutes(input.endTime) - timeStringToMinutes(input.startTime);
  return minutes > 0 && minutes <= policy.autoMaxHours * 60;
};

// ── Clashes and the breaks that get laid ─────────────────────────────────────

export interface DayBooking {
  id: string;
  bookingType?: string;
  status?: string;
  date: string;
  time: string;
  totalTime: number;
  /** Set on a break this request made itself, so it is never counted as a clash */
  timeOffId?: string;
}

/** What a request asks to block on one date: the window inside the stylist's working hours. */
export const windowFor = (
  input: TimeOffInput,
  hours: { open: number; close: number } | null,
): { start: number; end: number } | null => {
  if (!hours) return null; // not working that day: nothing to block
  const open = hours.open * 60;
  const close = hours.close * 60;
  if (input.kind === "dayoff") return { start: open, end: close };
  const start = Math.max(open, timeStringToMinutes(input.startTime ?? ""));
  const end = Math.min(close, timeStringToMinutes(input.endTime ?? ""));
  return end > start ? { start, end } : null;
};

const OPEN = new Set(["pending", "confirmed", "arrived", "in_service"]);

const isClient = (b: DayBooking): boolean =>
  (b.bookingType === "customer" || b.bookingType === "walkin") && OPEN.has(b.status ?? "");

/** The clients' bookings that fall inside the blocked time (the owner decides what to do with each). */
export const clashingBookings = (
  input: TimeOffInput,
  bookings: DayBooking[],
  hoursFor: (date: string) => { open: number; close: number } | null,
): DayBooking[] =>
  bookings
    .filter((b) => isClient(b) && b.date >= input.startDate && b.date <= input.endDate)
    .filter((b) => {
      const w = windowFor(input, hoursFor(b.date));
      if (!w) return false;
      const start = timeStringToMinutes(b.time);
      return start < w.end && start + b.totalTime > w.start;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || timeStringToMinutes(a.time) - timeStringToMinutes(b.time));

export interface PlannedBreak {
  date: string;
  time: string;
  /** Minutes */
  duration: number;
}

/**
 * The breaks that block this request: for each date, the free stretches of the window once
 * the bookings that stay are taken out. `staying` holds every booking on that stylist's days
 * that is NOT being cancelled (clients' bookings, training, other breaks), keyed by date.
 */
export const planBreaks = (
  input: TimeOffInput,
  hoursFor: (date: string) => { open: number; close: number } | null,
  staying: Record<string, DayBooking[]>,
): PlannedBreak[] => {
  const out: PlannedBreak[] = [];
  for (const date of datesInRange(input.startDate, input.endDate)) {
    const window = windowFor(input, hoursFor(date));
    if (!window) continue;
    const occupied = (staying[date] ?? [])
      .filter((b) => b.status !== "cancelled" && b.status !== "no_show")
      .map((b) => {
        const start = timeStringToMinutes(b.time);
        return { start, end: start + b.totalTime };
      });
    for (const gap of findFreeIntervals(occupied, window, GRID_MINUTES)) {
      out.push({ date, time: minutesToTimeString(gap.start), duration: gap.end - gap.start });
    }
  }
  return out;
};
