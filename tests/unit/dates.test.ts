// tests/unit/dates.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Unit tests for the shared date utilities. The core rule under test:
// YYYY-MM-DD strings always parse/format in LOCAL time — never UTC — so
// dates don't shift by a day in UTC+ timezones like Melbourne.
import { describe, expect, it } from "vitest";
import {
  parseLocalDate,
  parseBookingDateTime,
  toDateString,
  addDays,
  getDaysInMonth,
  getWeekRange,
} from "../../src/lib/dates";

describe("parseLocalDate / toDateString", () => {
  it("round-trips without any timezone shift", () => {
    const d = parseLocalDate("2026-08-05");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0); // local midnight, not UTC
    expect(toDateString(d)).toBe("2026-08-05");
  });
});

describe("parseBookingDateTime", () => {
  it("combines a date and 12-hour time in local time", () => {
    const d = parseBookingDateTime("2026-08-05", "1:30 PM");
    expect(toDateString(d)).toBe("2026-08-05");
    expect(d.getHours()).toBe(13);
    expect(d.getMinutes()).toBe(30);
  });

  it("handles the 12 AM / 12 PM edges", () => {
    expect(parseBookingDateTime("2026-08-05", "12:00 PM").getHours()).toBe(12);
    expect(parseBookingDateTime("2026-08-05", "12:00 AM").getHours()).toBe(0);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28"); // 2026 not a leap year
    expect(addDays("2026-07-20", 14)).toBe("2026-08-03");
  });
});

describe("getDaysInMonth", () => {
  it("returns every day of the month (0-indexed month)", () => {
    const feb = getDaysInMonth(2026, 1);
    expect(feb).toHaveLength(28);
    expect(feb[0]).toBe("2026-02-01");
    expect(feb[27]).toBe("2026-02-28");
    expect(getDaysInMonth(2028, 1)).toHaveLength(29); // leap year
  });
});

describe("getWeekRange", () => {
  it("returns Monday-to-Sunday for a mid-week date", () => {
    expect(getWeekRange("2026-08-05")).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
  });

  it("keeps a Sunday in the week that started the previous Monday", () => {
    expect(getWeekRange("2026-08-09")).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
  });

  it("starts the week on a Monday date itself", () => {
    expect(getWeekRange("2026-08-03")).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
  });
});
