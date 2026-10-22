// tests/unit/timeOff.test.ts
// Stylist days off and blocked times (FR-029, DEC-055): asking validly, which bookings a
// request clashes with, how breaks are laid around the bookings that stay, and the owner's
// policy for a waiting request. Pure; dates are plain calendar dates.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_OFF_POLICY,
  MAX_RANGE_DAYS,
  clashingBookings,
  datesInRange,
  effectiveTimeOffPolicy,
  isShortBlock,
  parseTimeOffInput,
  planBreaks,
  timeOffPolicyProblems,
  windowFor,
  type DayBooking,
  type TimeOffInput,
} from "../../src/lib/timeOff";

const TODAY = "2026-12-01";
const hours = { open: 10, close: 18 };
const always = () => hours;
const never = () => null;

const dayOff: TimeOffInput = { stylistId: "steve", kind: "dayoff", startDate: "2026-12-03", endDate: "2026-12-03", reason: "" };
const block: TimeOffInput = { stylistId: "steve", kind: "block", startDate: "2026-12-03", endDate: "2026-12-03", startTime: "1:00 PM", endTime: "2:00 PM", reason: "" };
const booking = (id: string, time: string, totalTime = 60, over: Partial<DayBooking> = {}): DayBooking => ({
  id,
  bookingType: "customer",
  status: "confirmed",
  date: "2026-12-03",
  time,
  totalTime,
  ...over,
});

describe("parseTimeOffInput", () => {
  const ok = (raw: unknown) => {
    const r = parseTimeOffInput(raw, TODAY);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  const bad = (raw: unknown): string => {
    const r = parseTimeOffInput(raw, TODAY);
    if (r.ok) throw new Error("expected a refusal");
    return r.message;
  };

  it("a single day off ends the day it starts; a range keeps its end", () => {
    expect(ok({ stylistId: "steve", kind: "dayoff", startDate: "2026-12-03" })).toMatchObject({ endDate: "2026-12-03" });
    expect(ok({ stylistId: "steve", kind: "dayoff", startDate: "2026-12-03", endDate: "2026-12-10", reason: " Holiday " })).toMatchObject({
      endDate: "2026-12-10",
      reason: "Holiday",
    });
  });

  it("a block is one day, with a start and end on the 15-minute grid, normalised", () => {
    expect(ok({ stylistId: "steve", kind: "block", startDate: "2026-12-03", endDate: "2026-12-09", startTime: "1:00 pm", endTime: "02:30 PM" })).toMatchObject({
      startDate: "2026-12-03",
      endDate: "2026-12-03", // a block never spans days
      startTime: "1:00 PM",
      endTime: "2:30 PM",
    });
  });

  it("names each thing wrong", () => {
    expect(bad(null)).toMatch(/Something went wrong/);
    expect(bad({ kind: "dayoff", startDate: "2026-12-03" })).toMatch(/which stylist/);
    expect(bad({ stylistId: "bad id!", kind: "dayoff", startDate: "2026-12-03" })).toMatch(/which stylist/);
    expect(bad({ stylistId: "s", kind: "holiday", startDate: "2026-12-03" })).toMatch(/day off or a block/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-02-30" })).toMatch(/valid date/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-12-03", endDate: "nope" })).toMatch(/last day/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-11-30" })).toMatch(/already passed/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-12-05", endDate: "2026-12-04" })).toMatch(/can't be before/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-12-03", endDate: "2027-12-20" })).toMatch(/too far ahead/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-12-03", endDate: "2027-02-20" })).toMatch(new RegExp(`${MAX_RANGE_DAYS} days`));
    expect(bad({ stylistId: "s", kind: "block", startDate: "2026-12-03", startTime: "1:00 PM" })).toMatch(/start and an end/);
    expect(bad({ stylistId: "s", kind: "block", startDate: "2026-12-03", startTime: "2:00 PM", endTime: "1:00 PM" })).toMatch(/after the start/);
    expect(bad({ stylistId: "s", kind: "block", startDate: "2026-12-03", startTime: "1:00 PM", endTime: "1:00 PM" })).toMatch(/after the start/);
    expect(bad({ stylistId: "s", kind: "block", startDate: "2026-12-03", startTime: "1:10 PM", endTime: "2:00 PM" })).toMatch(/15-minute/);
    expect(bad({ stylistId: "s", kind: "dayoff", startDate: "2026-12-03", reason: "x".repeat(201) })).toMatch(/200/);
  });

  it("today is allowed, and the reason loses control characters and extra spaces", () => {
    expect(ok({ stylistId: "s", kind: "dayoff", startDate: TODAY, reason: "A\r\n\u0007  B" }).reason).toBe("A B");
  });
});

describe("datesInRange", () => {
  it("is inclusive and walks month ends", () => {
    expect(datesInRange("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesInRange("2026-12-03", "2026-12-03")).toEqual(["2026-12-03"]);
  });
});

describe("windowFor", () => {
  it("a day off is the working day; a block is clamped to it; no hours means nothing to block", () => {
    expect(windowFor(dayOff, hours)).toEqual({ start: 600, end: 1080 });
    expect(windowFor(block, hours)).toEqual({ start: 780, end: 840 });
    expect(windowFor({ ...block, startTime: "8:00 AM", endTime: "11:00 AM" }, hours)).toEqual({ start: 600, end: 660 });
    expect(windowFor({ ...block, startTime: "7:00 PM", endTime: "8:00 PM" }, hours)).toBeNull();
    expect(windowFor(dayOff, null)).toBeNull();
  });
});

describe("clashingBookings", () => {
  it("a block clashes only with a client's open booking that overlaps it", () => {
    const list = [
      booking("before", "11:00 AM"),
      booking("edge-before", "12:00 PM"), // ends 1:00, touching the block: no clash
      booking("inside", "1:15 PM", 30),
      booking("overlap-start", "12:30 PM", 60),
      booking("overlap-end", "1:45 PM", 60),
      booking("edge-after", "2:00 PM"), //      starts 2:00, touching: no clash
      booking("cancelled", "1:00 PM", 60, { status: "cancelled" }),
      booking("no-show", "1:00 PM", 60, { status: "no_show" }),
      booking("break", "1:00 PM", 60, { bookingType: "break" }),
      booking("training", "1:00 PM", 60, { bookingType: "training" }),
      booking("other-day", "1:00 PM", 60, { date: "2026-12-04" }),
    ];
    expect(clashingBookings(block, list, always).map((b) => b.id)).toEqual(["overlap-start", "inside", "overlap-end"]);
  });

  it("a day off clashes with every open booking that day, in order, across a range", () => {
    const range = { ...dayOff, endDate: "2026-12-04" };
    const list = [booking("b", "3:00 PM", 60, { date: "2026-12-04" }), booking("a", "11:00 AM"), booking("c", "1:00 PM")];
    expect(clashingBookings(range, list, always).map((b) => b.id)).toEqual(["a", "c", "b"]);
  });

  it("a day the stylist doesn't work has nothing to clash with", () => {
    expect(clashingBookings(dayOff, [booking("a", "11:00 AM")], never)).toEqual([]);
  });
});

describe("planBreaks", () => {
  it("a day off with nothing booked is one break across the working day", () => {
    expect(planBreaks(dayOff, always, {})).toEqual([{ date: "2026-12-03", time: "10:00 AM", duration: 480 }]);
  });

  it("lays breaks around the bookings that stay", () => {
    const staying = { "2026-12-03": [booking("a", "12:00 PM", 60), booking("b", "3:00 PM", 45)] };
    expect(planBreaks(dayOff, always, staying)).toEqual([
      { date: "2026-12-03", time: "10:00 AM", duration: 120 },
      { date: "2026-12-03", time: "1:00 PM", duration: 120 },
      { date: "2026-12-03", time: "3:45 PM", duration: 135 },
    ]);
  });

  it("a block that is entirely taken by a booking needs no break, and one that is partly taken keeps the free part", () => {
    expect(planBreaks(block, always, { "2026-12-03": [booking("a", "12:30 PM", 120)] })).toEqual([]);
    expect(planBreaks(block, always, { "2026-12-03": [booking("a", "1:30 PM", 60)] })).toEqual([{ date: "2026-12-03", time: "1:00 PM", duration: 30 }]);
  });

  it("cancelled and no-show bookings and other time off count: only the first two free their time", () => {
    const staying = {
      "2026-12-03": [
        booking("x", "11:00 AM", 60, { status: "cancelled" }),
        booking("y", "1:00 PM", 60, { status: "no_show" }),
        booking("other-break", "4:00 PM", 60, { bookingType: "break", timeOffId: "other" }),
      ],
    };
    expect(planBreaks(dayOff, always, staying)).toEqual([
      { date: "2026-12-03", time: "10:00 AM", duration: 360 },
      { date: "2026-12-03", time: "5:00 PM", duration: 60 },
    ]);
  });

  it("a range makes breaks for each working day and none for a day they are not working", () => {
    const range = { ...dayOff, endDate: "2026-12-05" };
    const hoursFor = (d: string) => (d === "2026-12-04" ? null : hours);
    expect(planBreaks(range, hoursFor, {}).map((b) => b.date)).toEqual(["2026-12-03", "2026-12-05"]);
  });

  it("never makes a break shorter than one step", () => {
    expect(planBreaks(dayOff, always, { "2026-12-03": [booking("a", "10:10 AM", 470)] })).toEqual([]); // 10 min gaps at either end
  });
});

describe("the owner's policy for a waiting request", () => {
  it("nothing stored -> hold, and short means 3 hours", () => {
    expect(effectiveTimeOffPolicy(undefined)).toEqual(DEFAULT_TIME_OFF_POLICY);
    expect(DEFAULT_TIME_OFF_POLICY).toEqual({ pending: "hold", autoMaxHours: 3 });
  });

  it("keeps a valid choice and falls back from a bad one", () => {
    expect(effectiveTimeOffPolicy({ pending: "wait", autoMaxHours: 2 })).toEqual({ pending: "wait", autoMaxHours: 2 });
    expect(effectiveTimeOffPolicy({ pending: "auto", autoMaxHours: 5 })).toEqual({ pending: "auto", autoMaxHours: 5 });
    expect(effectiveTimeOffPolicy({ pending: "never", autoMaxHours: 99 })).toEqual({ pending: "hold", autoMaxHours: 3 });
    expect(effectiveTimeOffPolicy({ pending: "auto", autoMaxHours: 1.5 }).autoMaxHours).toBe(3);
    expect(timeOffPolicyProblems({ pending: "auto", autoMaxHours: 0 })).toHaveLength(1);
    expect(timeOffPolicyProblems({ pending: "auto", autoMaxHours: 12 })).toEqual([]);
  });

  it("a short block is a single-day block of at most that many hours", () => {
    const p = { pending: "auto" as const, autoMaxHours: 3 };
    expect(isShortBlock(block, p)).toBe(true);
    expect(isShortBlock({ ...block, startTime: "1:00 PM", endTime: "4:00 PM" }, p)).toBe(true);
    expect(isShortBlock({ ...block, startTime: "1:00 PM", endTime: "4:15 PM" }, p)).toBe(false);
    expect(isShortBlock(dayOff, p)).toBe(false);
  });
});
