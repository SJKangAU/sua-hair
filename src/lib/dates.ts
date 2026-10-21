// dates.ts
// ─────────────────────────────────────────────────────────────────────────────
// SHARED DATE UTILITIES
// "Today" is the SALON's today (Australia/Melbourne, businessTime.ts, DEC-034),
// not the browser's.
// ─────────────────────────────────────────────────────────────────────────────
// Centralises all date parsing and formatting so timezone-safe logic
// isn't reimplemented across TodayPage, DashboardStats, scheduling.ts,
// and calendar.ts.
//
// Core rule: never use `new Date('YYYY-MM-DD')` or `new Date('YYYY-MM-DDT00:00:00')`
// without an explicit timezone — both are ambiguous and shift by a day in
// UTC+ timezones like Melbourne (AEST/AEDT). Always use the local constructor.
// ─────────────────────────────────────────────────────────────────────────────

import { businessToday, clockParts } from "./businessTime";

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
  const [rawHours, minutes] = rawTime.split(":").map(Number);
  let hours = rawHours;
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
 * Get today's date at the salon as a YYYY-MM-DD string (Australia/Melbourne,
 * whatever zone the browser is in). Replaces the scattered
 * `new Date().toISOString().split('T')[0]` pattern, which is UTC-based and returns
 * yesterday's date for the first 10-11 hours of a Melbourne day.
 */
export const todayString = (): string => businessToday();

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
 * Format an instant as the salon's wall clock, YYYYMMDDTHHmmss, for Google
 * Calendar URLs (sent with ctz=Australia/Melbourne).
 */
export const formatGoogleCalendarDate = (instant: number | Date): string => {
  const p = clockParts(instant);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}${two(p.month)}${two(p.day)}T${two(p.hour)}${two(p.minute)}00`;
};

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

// ── Calendar helpers ──────────────────────────────────────────────────────────

/**
 * Return all YYYY-MM-DD strings in a given year/month (0-indexed month).
 */
export const getDaysInMonth = (year: number, month: number): string[] => {
  const days: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
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
