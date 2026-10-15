// tests/unit/time.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Tests for the salon-local → instant conversion the reminder job relies on.
// Cloud Functions run in UTC while bookings hold Melbourne wall-clock
// strings, so a wrong offset here means reminders go out at the wrong time.
import { describe, expect, it } from "vitest";
import {
  bookingInstant,
  localDateString,
  parseTime12h,
} from "../../functions/src/time";

const TZ = "Australia/Melbourne";
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

describe("parseTime12h", () => {
  it("handles AM, PM, noon and midnight", () => {
    expect(parseTime12h("10:30 AM")).toEqual({ hour: 10, minute: 30 });
    expect(parseTime12h("2:15 PM")).toEqual({ hour: 14, minute: 15 });
    expect(parseTime12h("12:00 PM")).toEqual({ hour: 12, minute: 0 });
    expect(parseTime12h("12:00 AM")).toEqual({ hour: 0, minute: 0 });
  });
  it("rejects malformed times", () => {
    expect(parseTime12h("25:00")).toBeNull();
    expect(parseTime12h("13:00 PM")).toBeNull();
    expect(parseTime12h("")).toBeNull();
  });
});

describe("bookingInstant (Australia/Melbourne)", () => {
  it("uses +10:00 in winter (AEST)", () => {
    expect(iso(bookingInstant("2026-07-03", "10:30 AM", TZ))).toBe(
      "2026-07-03T00:30:00.000Z",
    );
  });

  it("uses +11:00 in summer (AEDT)", () => {
    expect(iso(bookingInstant("2026-01-15", "10:00 AM", TZ))).toBe(
      "2026-01-14T23:00:00.000Z",
    );
  });

  it("switches offset across the October DST start (2026-10-04)", () => {
    expect(iso(bookingInstant("2026-10-04", "1:00 AM", TZ))).toBe(
      "2026-10-03T15:00:00.000Z", // still AEST
    );
    expect(iso(bookingInstant("2026-10-04", "3:30 AM", TZ))).toBe(
      "2026-10-03T16:30:00.000Z", // now AEDT
    );
  });

  it("switches offset across the April DST end (2026-04-05)", () => {
    expect(iso(bookingInstant("2026-04-05", "10:00 AM", TZ))).toBe(
      "2026-04-05T00:00:00.000Z", // AEST again
    );
    expect(iso(bookingInstant("2026-04-04", "10:00 AM", TZ))).toBe(
      "2026-04-03T23:00:00.000Z", // day before: AEDT
    );
  });

  it("returns null for malformed input", () => {
    expect(bookingInstant("2026-7-3", "10:30 AM", TZ)).toBeNull();
    expect(bookingInstant("2026-07-03", "late", TZ)).toBeNull();
  });
});

describe("localDateString", () => {
  it("returns the Melbourne calendar date, not the UTC one", () => {
    // 2026-07-02 15:00Z is 2026-07-03 01:00 in Melbourne.
    expect(localDateString(Date.UTC(2026, 6, 2, 15, 0), TZ)).toBe("2026-07-03");
    expect(localDateString(Date.UTC(2026, 6, 2, 13, 59), TZ)).toBe("2026-07-02");
  });
});
