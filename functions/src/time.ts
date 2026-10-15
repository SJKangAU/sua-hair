// functions/src/time.ts
// Timezone helpers for the reminder job. Bookings store `date` ("YYYY-MM-DD")
// and `time` ("10:30 AM") as plain strings in the salon's local time, while
// Cloud Functions run in UTC — so every "is this booking 24h away?" check
// has to convert the salon-local wall-clock time to a real instant first.
// Uses Intl only (no date library), and handles DST via a two-pass offset.

/** Offset (ms) of `timeZone` from UTC at the given instant: local - UTC. */
const tzOffsetMs = (instant: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return localAsUtc - Math.floor(instant / 1000) * 1000;
};

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

/**
 * Convert a salon-local booking date + time into an absolute instant (epoch
 * ms). Returns null when either string is malformed.
 */
export const bookingInstant = (
  date: string,
  time: string,
  timeZone: string,
): number | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = parseTime12h(time);
  if (!d || !t) return null;
  const guess = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    t.hour,
    t.minute,
  );
  // First pass uses the offset at the naive guess; a second pass corrects the
  // case where that guess straddled a DST change.
  const first = guess - tzOffsetMs(guess, timeZone);
  return guess - tzOffsetMs(first, timeZone);
};

/** "YYYY-MM-DD" of an instant as seen on the wall clock in `timeZone`. */
export const localDateString = (instant: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
