// bookingHistory.ts
// The booking history log shown in the booking drawer. Entries are appended to
// Booking.history whenever a booking's status, time/stylist or phase lengths
// change (see useBookings); the "Created" row is derived from createdAt so
// bookings made before the log existed still show where they came from.
//
// Labels are written once, at the time of the change, so an old entry keeps
// reading the way it did even if wording changes later.

import { formatClockTime, isSlotFreeing, STATUS_LABELS } from "./bookingStatus";
import { parseLocalDate } from "./dates";
import { clockParts } from "./businessTime";
import { phaseLabels } from "./bookingPhases";
import type {
  Booking,
  Phase,
  BookingHistoryEntry,
  BookingStatus,
} from "../types";

export interface HistoryViewEntry {
  at: string;
  type: BookingHistoryEntry["type"] | "created";
  label: string;
  status?: BookingStatus;
}

interface Where {
  date: string;
  time: string;
  stylistName: string;
}

// Built from fixed name tables rather than toLocaleDateString, whose short
// forms ("Wed," vs "Wed", "Sept" vs "Sep") differ between ICU versions and
// would make stored labels and tests environment-dependent.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "Mon 19 Oct"
export const formatDayShort = (date: string): string => {
  const d = parseLocalDate(date);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

// "Mon 19 Oct, 10:30 AM"
export const formatWhen = (date: string, time: string): string =>
  `${formatDayShort(date)}, ${time}`;

export const statusHistoryEntry = (
  from: BookingStatus,
  to: BookingStatus,
  at: string = new Date().toISOString(),
): BookingHistoryEntry => ({
  at,
  type: "status",
  status: to,
  label:
    isSlotFreeing(from) && !isSlotFreeing(to)
      ? `Restored to ${STATUS_LABELS[to].toLowerCase()}`
      : STATUS_LABELS[to],
});

export const movedHistoryEntry = (
  from: Where,
  to: Where,
  priceChange: { from: number; to: number } | null = null,
  at: string = new Date().toISOString(),
): BookingHistoryEntry => {
  const sameStylist = from.stylistName === to.stylistName;
  const base = sameStylist
    ? `Moved from ${formatWhen(from.date, from.time)} to ${formatWhen(
        to.date,
        to.time,
      )}`
    : `Moved from ${formatWhen(from.date, from.time)} with ${
        from.stylistName
      } to ${formatWhen(to.date, to.time)} with ${to.stylistName}`;
  const price = priceChange
    ? ` (price $${priceChange.from} to $${priceChange.to})`
    : "";
  return { at, type: "moved", label: `${base}${price}` };
};

// One line for an edit to a booking's phases, e.g.
// "Timings changed: processing 30 to 45 min, return 30 to 15 min (back at 11:45 AM)"
export const phaseEditHistoryEntry = (
  before: readonly Phase[],
  after: readonly Phase[],
  returnTime: string | undefined,
  at: string = new Date().toISOString(),
): BookingHistoryEntry => {
  const nameBefore = phaseLabels(before);
  const nameAfter = phaseLabels(after);
  const parts: string[] = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const was = before[i]?.minutes ?? 0;
    const now = after[i]?.minutes ?? 0;
    if (was !== now) {
      parts.push(
        `${(nameAfter[i] ?? nameBefore[i]).toLowerCase()} ${was} to ${now} min`,
      );
    }
  }
  return {
    at,
    type: "phases",
    label: `Timings changed: ${parts.join(", ") || "phases"}${
      returnTime ? ` (back at ${returnTime})` : ""
    }`,
  };
};

const CREATED_LABELS: Record<Booking["bookingType"], string> = {
  customer: "Booked online",
  walkin: "Walk-in created",
  break: "Break added",
  training: "Training session added",
};

// Newest first, with the derived "Created" row last.
export const buildHistoryView = (booking: Booking): HistoryViewEntry[] => {
  const stored = Array.isArray(booking.history) ? booking.history : [];
  const created: HistoryViewEntry = {
    at: booking.createdAt,
    type: "created",
    label: CREATED_LABELS[booking.bookingType] ?? "Booking created",
  };
  return [...stored, created].sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  );
};

// "19 Oct, 10:12 AM" on the salon's (Melbourne) clock; empty if the timestamp is
// unusable.
export const formatHistoryTime = (iso: string): string => {
  const clock = formatClockTime(iso);
  if (!clock) return "";
  const p = clockParts(new Date(iso));
  return `${p.day} ${MONTHS[p.month - 1]}, ${clock}`;
};
