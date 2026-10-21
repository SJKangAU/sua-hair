// functions/src/time.ts
// Timezone helpers for the functions. The implementation is the app's own
// src/lib/businessTime.ts (DEC-034) - one clock for the browser and the server,
// compiled into this package by tsconfig.json (rootDir "..") - so "is this
// booking 24 hours away?", the 2-hour notice and the same-day cutoff can never
// disagree between the page and the server. Bookings store `date` ("YYYY-MM-DD")
// and `time` ("10:30 AM") as plain strings in the salon's time; Cloud Functions
// run in UTC, so every such decision converts the wall clock to a real instant.

import {
  bookingStartInstant,
  businessDateOf,
  parseTime12h,
} from "../../src/lib/businessTime";

export { parseTime12h };

/**
 * Convert a salon-local booking date + time into an absolute instant (epoch
 * ms). Returns null when either string is malformed.
 */
export const bookingInstant = (
  date: string,
  time: string,
  timeZone: string,
): number | null => bookingStartInstant(date, time, timeZone);

/** "YYYY-MM-DD" of an instant as seen on the wall clock in `timeZone`. */
export const localDateString = (instant: number, timeZone: string): string =>
  businessDateOf(instant, timeZone);
