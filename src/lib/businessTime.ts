// businessTime.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE SALON'S CLOCK (DEC-034)
// ─────────────────────────────────────────────────────────────────────────────
// The salon trades in Australia/Melbourne and every decision about "today", "now",
// the same-day cutoff, the 2-hour notice, opening hours and which day of the week
// a date falls on is made on THAT clock - never on the clock of the browser or
// server that happens to be running the code (a customer in Sydney or Los Angeles,
// a Cloud Function in UTC, a CI runner). This is the one module that knows how.
//
// Pure and dependency-free (Intl only, no date library), so the browser app and
// the Cloud Functions import the same file. Bookings store `date` ("YYYY-MM-DD")
// and `time` ("10:30 AM") as wall-clock strings in this zone; an INSTANT is only
// produced here, with daylight saving handled by a two-pass offset search.
//
// Calendar-date arithmetic (weekday, add days) is done on UTC midnights, so it
// never depends on the machine's zone or on a daylight-saving change.
// ─────────────────────────────────────────────────────────────────────────────

export const BUSINESS_TIME_ZONE = "Australia/Melbourne";

export interface ClockParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
};

/** What the wall clock in `timeZone` reads at `instant` (epoch ms or a Date). */
export const clockParts = (
  instant: number | Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): ClockParts => {
  const ms = typeof instant === "number" ? instant : instant.getTime();
  const parts = formatterFor(timeZone).formatToParts(new Date(ms));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
};

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** "YYYY-MM-DD" of `instant` on the salon's wall clock. */
export const businessDateOf = (
  instant: number | Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): string => {
  const p = clockParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
};

/** Minutes since midnight on the salon's wall clock at `instant`. */
export const businessMinutesOf = (
  instant: number | Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): number => {
  const p = clockParts(instant, timeZone);
  return p.hour * 60 + p.minute;
};

/** Today's date at the salon. */
export const businessToday = (now: number = Date.now()): string =>
  businessDateOf(now);

/** Minutes since midnight right now at the salon. */
export const businessNowMinutes = (now: number = Date.now()): number =>
  businessMinutesOf(now);

// ── Calendar dates ("YYYY-MM-DD") - pure arithmetic, zone-independent ────────

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export const isValidDateString = (date: string): boolean => {
  const m = DATE_PATTERN.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

/** 0 = Sunday ... 6 = Saturday, for a calendar date. */
export const weekdayOfDate = (date: string): number => {
  const m = DATE_PATTERN.exec(date);
  if (!m) return NaN;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
};

/** The calendar date `days` after (or before, if negative) `date`. */
export const addDaysToDate = (date: string, days: number): string => {
  const m = DATE_PATTERN.exec(date);
  if (!m) return date;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetweenDates = (a: string, b: string): number => {
  const pa = DATE_PATTERN.exec(a);
  const pb = DATE_PATTERN.exec(b);
  if (!pa || !pb) return NaN;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86_400_000);
};

// ── Wall clock -> instant ────────────────────────────────────────────────────

/** Offset (ms) of `timeZone` from UTC at `instant`: local - UTC. */
const offsetMs = (instant: number, timeZone: string): number => {
  const p = clockParts(instant, timeZone);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUtc - Math.floor(instant / 1000) * 1000;
};

/**
 * The instant (epoch ms) at which the wall clock in `timeZone` reads `date` +
 * `minutes` past midnight. Daylight saving is handled by a two-pass offset
 * search. A wall time that does not exist (the hour skipped when clocks go
 * forward) resolves to the instant just after the gap; one that happens twice
 * (clocks going back) resolves to the first occurrence.
 */
export const businessInstant = (
  date: string,
  minutes: number,
  timeZone: string = BUSINESS_TIME_ZONE,
): number | null => {
  const m = DATE_PATTERN.exec(date);
  if (!m || !Number.isFinite(minutes)) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + minutes * 60_000;
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
};

// ── "10:30 AM" ───────────────────────────────────────────────────────────────

/** Parse "10:30 AM" / "12:00 PM" into 24-hour {hour, minute}; null if invalid. */
export const parseTime12h = (
  time: string,
): { hour: number; minute: number } | null => {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(time);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3].toUpperCase() === "PM";
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return { hour, minute };
};

/** The instant a booking starts: its salon-local date + "10:30 AM" time. */
export const bookingStartInstant = (
  date: string,
  time: string,
  timeZone: string = BUSINESS_TIME_ZONE,
): number | null => {
  const t = parseTime12h(time);
  if (!t) return null;
  return businessInstant(date, t.hour * 60 + t.minute, timeZone);
};

/** "10:12 AM" on the salon's wall clock, from an instant. */
export const formatBusinessClock = (
  instant: number | Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): string => {
  const p = clockParts(instant, timeZone);
  return `${p.hour % 12 || 12}:${pad(p.minute)} ${p.hour >= 12 ? "PM" : "AM"}`;
};
