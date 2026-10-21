// tests/unit/businessTime.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The salon's clock (DEC-034). Every assertion is in absolute instants and
// Melbourne wall-clock strings, so the results are identical whatever TZ the
// test process runs under: CI runs this file under UTC, America/Los_Angeles and
// Australia/Melbourne (see package.json test:unit:tz) and the same numbers must
// come out.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUSINESS_TIME_ZONE,
  addDaysToDate,
  bookingStartInstant,
  businessDateOf,
  businessInstant,
  businessMinutesOf,
  businessNowMinutes,
  businessToday,
  clockParts,
  daysBetweenDates,
  formatBusinessClock,
  isValidDateString,
  weekdayOfDate,
} from "../../src/lib/businessTime";
import { todayString } from "../../src/lib/dates";
import {
  getCurrentMinutes,
  getMinBookableDate,
  isPastSameDayCutoff,
  generateSlots,
} from "../../src/lib/scheduling";

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

afterEach(() => vi.useRealTimers());

describe("the zone", () => {
  it("is Australia/Melbourne", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Australia/Melbourne");
  });
});

describe("clockParts / businessDateOf / businessMinutesOf", () => {
  it("reads Melbourne's wall clock in winter (UTC+10)", () => {
    // 2026-07-02 15:00Z = 2026-07-03 01:00 Melbourne
    expect(clockParts(utc(2026, 7, 2, 15))).toMatchObject({ year: 2026, month: 7, day: 3, hour: 1, minute: 0 });
    expect(businessDateOf(utc(2026, 7, 2, 15))).toBe("2026-07-03");
    expect(businessDateOf(utc(2026, 7, 2, 13, 59))).toBe("2026-07-02");
    expect(businessMinutesOf(utc(2026, 7, 2, 15))).toBe(60);
  });

  it("reads Melbourne's wall clock in summer (UTC+11)", () => {
    expect(businessDateOf(utc(2026, 1, 14, 13))).toBe("2026-01-15"); // 00:00 AEDT
    expect(businessMinutesOf(utc(2026, 1, 14, 13))).toBe(0);
    expect(businessMinutesOf(utc(2026, 1, 15, 6, 30))).toBe(17 * 60 + 30);
  });

  it("midnight is hour 0, never 24", () => {
    expect(clockParts(utc(2026, 7, 2, 14)).hour).toBe(0);
    expect(formatBusinessClock(utc(2026, 7, 2, 14))).toBe("12:00 AM");
    expect(formatBusinessClock(utc(2026, 7, 3, 2, 0))).toBe("12:00 PM");
  });
});

describe("businessInstant / bookingStartInstant", () => {
  it("uses +10:00 in winter and +11:00 in summer", () => {
    expect(iso(bookingStartInstant("2026-07-03", "10:30 AM"))).toBe("2026-07-03T00:30:00.000Z");
    expect(iso(bookingStartInstant("2026-01-15", "10:00 AM"))).toBe("2026-01-14T23:00:00.000Z");
  });

  it("across the October daylight-saving start (clocks go 2:00 -> 3:00 on 2026-10-04)", () => {
    expect(iso(bookingStartInstant("2026-10-04", "1:00 AM"))).toBe("2026-10-03T15:00:00.000Z"); // AEST
    expect(iso(bookingStartInstant("2026-10-04", "3:30 AM"))).toBe("2026-10-03T16:30:00.000Z"); // AEDT
    // a booking at 10:00 on the changeover day is 11 hours ahead of UTC
    expect(iso(bookingStartInstant("2026-10-04", "10:00 AM"))).toBe("2026-10-03T23:00:00.000Z");
    // the day before and the day after are 10 and 11 hours ahead
    expect(iso(bookingStartInstant("2026-10-03", "10:00 AM"))).toBe("2026-10-03T00:00:00.000Z");
  });

  it("across the April daylight-saving end (clocks go 3:00 -> 2:00 on 2026-04-05)", () => {
    expect(iso(bookingStartInstant("2026-04-04", "10:00 AM"))).toBe("2026-04-03T23:00:00.000Z"); // AEDT
    expect(iso(bookingStartInstant("2026-04-05", "10:00 AM"))).toBe("2026-04-05T00:00:00.000Z"); // AEST
  });

  it("the 24 hours on the changeover day are 23 hours long in October and 25 in April", () => {
    const len = (day: string) =>
      (businessInstant(addDaysToDate(day, 1), 0) as number) - (businessInstant(day, 0) as number);
    expect(len("2026-10-04")).toBe(23 * 3_600_000);
    expect(len("2026-04-05")).toBe(25 * 3_600_000);
    expect(len("2026-07-10")).toBe(24 * 3_600_000);
  });

  it("round-trips with the clock readings", () => {
    for (const [d, m] of [["2026-10-04", 90], ["2026-10-04", 600], ["2026-04-05", 600], ["2026-12-25", 17 * 60]] as const) {
      const at = businessInstant(d, m) as number;
      expect(businessDateOf(at)).toBe(d);
      expect(businessMinutesOf(at)).toBe(m);
    }
  });

  it("rejects malformed input", () => {
    expect(bookingStartInstant("2026-7-3", "10:30 AM")).toBeNull();
    expect(bookingStartInstant("2026-07-03", "late")).toBeNull();
    expect(businessInstant("nope", 10)).toBeNull();
  });
});

describe("calendar dates (zone-independent)", () => {
  it("weekday of a date is the same everywhere", () => {
    expect(weekdayOfDate("2026-10-19")).toBe(1); // Monday
    expect(weekdayOfDate("2026-10-18")).toBe(0); // Sunday
    expect(weekdayOfDate("2026-10-24")).toBe(6);
    expect(Number.isNaN(weekdayOfDate("x"))).toBe(true);
  });

  it("adds days across month, year and daylight-saving changes", () => {
    expect(addDaysToDate("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDaysToDate("2026-10-04", 1)).toBe("2026-10-05");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetweenDates("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysBetweenDates("2026-04-04", "2026-04-06")).toBe(2);
  });

  it("validates real calendar dates", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-2-3")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
  });
});

describe("today, now and the same-day cutoff run on Melbourne's clock", () => {
  // 2026-08-05 is a Wednesday; AEST (UTC+10)
  const at = (date: string, minutes: number) => {
    vi.useFakeTimers();
    vi.setSystemTime(businessInstant(date, minutes) as number);
  };

  it("todayString / businessToday follow Melbourne, not the machine", () => {
    at("2026-08-05", 0); // 00:00 Melbourne = 14:00Z the day before
    expect(todayString()).toBe("2026-08-05");
    expect(businessToday()).toBe("2026-08-05");
    at("2026-08-05", 23 * 60 + 59);
    expect(todayString()).toBe("2026-08-05");
    at("2026-08-06", 0);
    expect(todayString()).toBe("2026-08-06");
  });

  it("getCurrentMinutes is Melbourne minutes from midnight", () => {
    at("2026-08-05", 10 * 60 + 15);
    expect(getCurrentMinutes()).toBe(615);
    expect(businessNowMinutes()).toBe(615);
  });

  it("the 5 pm cutoff: 16:59 is open, 17:00 is past", () => {
    at("2026-08-05", 16 * 60 + 59);
    expect(isPastSameDayCutoff("2026-08-05")).toBe(false);
    expect(getMinBookableDate()).toBe("2026-08-05");
    at("2026-08-05", 17 * 60);
    expect(isPastSameDayCutoff("2026-08-05")).toBe(true);
    expect(getMinBookableDate()).toBe("2026-08-06");
  });

  it("the cutoff holds across the daylight-saving start (2026-10-04 is a Sunday)", () => {
    at("2026-10-04", 16 * 60 + 59); // AEDT
    expect(isPastSameDayCutoff("2026-10-04")).toBe(false);
    at("2026-10-04", 17 * 60);
    expect(isPastSameDayCutoff("2026-10-04")).toBe(true);
    expect(getMinBookableDate()).toBe("2026-10-05");
  });

  it("the 2-hour notice follows Melbourne: at 10:00 the first 60-minute slot is 12:00", () => {
    at("2026-08-05", 10 * 60);
    const slots = generateSlots("2026-08-05", "s1", 60, 60, []);
    expect(slots.find((s) => s.time === "11:45 AM")?.available).toBe(false);
    expect(slots.find((s) => s.time === "12:00 PM")?.available).toBe(true);
  });

  it("a visitor in another zone sees the same slots: the notice is not shifted by the machine's offset", () => {
    // 00:30 Melbourne is 14:30Z the previous UTC day, 07:30 in Los Angeles. The
    // day is still Melbourne's 5 Aug whichever zone this runs in.
    at("2026-08-05", 30);
    expect(todayString()).toBe("2026-08-05");
    const slots = generateSlots("2026-08-05", "s1", 60, 60, []);
    expect(slots.find((s) => s.time === "10:00 AM")?.available).toBe(true); // 9.5 h away
  });
});
