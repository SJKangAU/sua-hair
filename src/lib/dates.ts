// dates.ts
// ─────────────────────────────────────────────────────────────────────────────
// SHARED DATE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
// Centralises all date parsing and formatting so timezone-safe logic
// isn't reimplemented across TodayPage, DashboardStats, scheduling.ts,
// and calendar.ts.
//
// Core rule: never use `new Date('YYYY-MM-DD')` or `new Date('YYYY-MM-DDT00:00:00')`
// without an explicit timezone — both are ambiguous and shift by a day in
// UTC+ timezones like Melbourne (AEST/AEDT). Always use the local constructor.
// ─────────────────────────────────────────────────────────────────────────────

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string into a local Date with no timezone shifting.
 * Safe in all timezones including UTC+.
 */
export const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Parse a booking time string like "10:30 AM" into a Date on the given date.
 */
export const parseBookingDateTime = (date: string, time: string): Date => {
  const base = parseLocalDate(date);
  const [rawTime, period] = time.split(" ");
  let [hours, minutes] = rawTime.split(":").map(Number);
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  base.setHours(hours, minutes, 0, 0);
  return base;
};

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format a Date to YYYY-MM-DD using local time (not UTC).
 */
export const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Get today's date as a YYYY-MM-DD string in local time.
 * Replaces the scattered `new Date().toISOString().split('T')[0]` pattern
 * which is UTC-based and can return yesterday's date in UTC+ timezones.
 */
export const todayString = (): string => toDateString(new Date());

/**
 * Format a YYYY-MM-DD string for display, e.g. "Wednesday, 15 April 2026".
 */
export const formatDisplayDate = (
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  },
): string => parseLocalDate(dateStr).toLocaleDateString("en-AU", options);

/**
 * Format a Date as YYYYMMDDTHHmmss for Google Calendar URLs.
 */
export const formatGoogleCalendarDate = (d: Date): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes(),
  ).padStart(2, "0")}00`;

/**
 * Format a Date as a UTC timestamp string for ICS files.
 */
export const formatICSDate = (d: Date): string =>
  d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

// ── Navigation helpers ────────────────────────────────────────────────────────

/**
 * Add `days` to a YYYY-MM-DD string, returning a new YYYY-MM-DD string.
 * Positive values go forward, negative go back.
 */
export const addDays = (dateStr: string, days: number): string => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toDateString(date);
};

// ── Week range ────────────────────────────────────────────────────────────────

/**
 * Get the Monday-to-Sunday week range containing the given date (or today).
 * Returns YYYY-MM-DD strings.
 */
export const getWeekRange = (
  dateStr?: string,
): { start: string; end: string } => {
  const date = dateStr ? parseLocalDate(dateStr) : new Date();
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateString(monday), end: toDateString(sunday) };
};
