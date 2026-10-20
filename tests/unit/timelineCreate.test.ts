// tests/unit/timelineCreate.test.ts
// Creating a booking by pointing at the admin timeline: snapping, the default
// 30 minutes, clamping at busy blocks, refusing the past and times outside the
// stylist's hours, and being allowed inside another booking's processing gap.
// Pure functions; `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREATE_MINUTES,
  blockAt,
  blockLabel,
  defaultBlock,
  dragBlock,
  formatLength,
  refusalFor,
  type CreateEnv,
} from "../../src/lib/timelineCreate";
import { phaseTotals, type Phase } from "../../src/lib/bookingPhases";
import type { Booking, SlotBlock } from "../../src/types";

const h = (hour: number, min = 0) => hour * 60 + min;
const A = (minutes: number): Phase => ({ type: "active", minutes });
const R = (minutes: number): Phase => ({ type: "rest", minutes });
const DATE = "2027-03-10";

const booking = (
  id: string,
  time: string,
  phases: Phase[],
  over: Partial<Booking> = {},
): SlotBlock & Booking =>
  ({
    id,
    stylistId: "steve",
    date: DATE,
    time,
    status: "confirmed",
    phases,
    ...phaseTotals(phases),
    customerName: `Client ${id}`,
    serviceName: "Service",
    bookingType: "customer",
    ...over,
  }) as SlotBlock & Booking;

const env = (bookings: SlotBlock[] = [], over: Partial<CreateEnv> = {}): CreateEnv => ({
  stylistId: "steve",
  date: DATE,
  hours: { open: 10, close: 18 },
  isPastDate: false,
  isToday: false,
  nowMinutes: h(9),
  bookings,
  ...over,
});

describe("timeline create: the hover block", () => {
  it("is 30 minutes long, snapped down to the 15-minute row under the pointer", () => {
    expect(DEFAULT_CREATE_MINUTES).toBe(30);
    expect(defaultBlock(env(), h(11, 20))).toEqual({ start: h(11, 15), end: h(11, 45), length: 30 });
    expect(defaultBlock(env(), h(11, 15))).toEqual({ start: h(11, 15), end: h(11, 45), length: 30 });
    expect(defaultBlock(env(), h(11, 29.9))).toEqual({ start: h(11, 15), end: h(11, 45), length: 30 });
    expect(defaultBlock(env(), h(11, 30))).toEqual({ start: h(11, 30), end: h(12), length: 30 });
  });

  it("is labelled with its range", () => {
    expect(blockLabel(defaultBlock(env(), h(11, 15))!, false)).toBe("11:15 – 11:45 am");
    expect(blockLabel({ start: h(11, 15), end: h(12, 15), length: 60 }, true)).toBe("11:15 am – 12:15 pm, 1h");
  });

  it("is not shown over a booking, a break, or where 30 minutes would not fit", () => {
    const day = [
      booking("a", "11:00 AM", [A(60)]),
      booking("brk", "2:00 PM", [A(30)], { bookingType: "break" }),
    ];
    expect(defaultBlock(env(day), h(11, 30))).toBeNull(); // inside the booking
    expect(defaultBlock(env(day), h(10, 45))).toBeNull(); // 10:45 - 11:15 runs into it
    expect(defaultBlock(env(day), h(10, 30))).not.toBeNull(); // ends exactly as it starts
    expect(defaultBlock(env(day), h(14, 15))).toBeNull(); // inside the break
    expect(defaultBlock(env(day), h(13, 30))).not.toBeNull();
    expect(defaultBlock(env(day), h(13, 45))).toBeNull(); // runs into the break
  });

  it("ignores cancelled and no-show bookings", () => {
    const day = [
      booking("c", "11:00 AM", [A(60)], { status: "cancelled" }),
      booking("n", "12:00 PM", [A(60)], { status: "no_show" }),
    ];
    expect(defaultBlock(env(day), h(11))).not.toBeNull();
    expect(defaultBlock(env(day), h(12))).not.toBeNull();
  });
});

describe("timeline create: refusals", () => {
  it("refuses a past date and, today, anything before the current quarter hour", () => {
    expect(refusalFor(env([], { isPastDate: true }), h(11), h(11, 30))).toBe("That time has passed");
    const today = env([], { isToday: true, nowMinutes: h(11, 20) });
    expect(refusalFor(today, h(11, 15), h(11, 45))).toBeNull(); // the quarter hour we are in (11:20)
    expect(refusalFor(today, h(11), h(11, 30))).toBe("That time has passed");
    expect(defaultBlock(today, h(10, 30))).toBeNull();
    expect(defaultBlock(today, h(11, 30))).not.toBeNull();
  });

  it("refuses times outside the stylist's hours and a day they are off", () => {
    const narrow = env([], { hours: { open: 11, close: 16 } });
    expect(refusalFor(narrow, h(10, 30), h(11))).toBe("Not working before 11:00 AM");
    expect(refusalFor(narrow, h(15, 45), h(16, 15))).toBe("Not working after 4:00 PM");
    expect(refusalFor(narrow, h(11), h(16))).toBeNull();
    expect(defaultBlock(narrow, h(10, 45))).toBeNull();
    expect(defaultBlock(env([], { hours: null }), h(12))).toBeNull();
    expect(refusalFor(env([], { hours: null }), h(12), h(12, 30))).toBe("Not working");
  });
});

describe("timeline create: dragging", () => {
  it("grows down in 15-minute steps: a drag to 12:30 from 11:15 is a 90-minute block", () => {
    expect(dragBlock(env(), h(11, 15), h(12, 40))).toEqual({ start: h(11, 15), end: h(12, 45), length: 90 });
    expect(dragBlock(env(), h(11, 15), h(12, 30))).toEqual({ start: h(11, 15), end: h(12, 45), length: 90 });
    expect(dragBlock(env(), h(11, 15), h(11, 20))).toEqual({ start: h(11, 15), end: h(11, 30), length: 15 });
    expect(dragBlock(env(), h(11, 17), h(11, 17))).toEqual({ start: h(11, 15), end: h(11, 30), length: 15 });
  });

  it("grows up when dragged above where it began", () => {
    expect(dragBlock(env(), h(12), h(11))).toEqual({ start: h(11), end: h(12, 15), length: 75 });
  });

  it("stops at the next booking, whichever way it is dragged", () => {
    const day = [booking("a", "1:00 PM", [A(60)])];
    expect(dragBlock(env(day), h(12), h(15))).toEqual({ start: h(12), end: h(13), length: 60 });
    const above = [booking("b", "10:00 AM", [A(60)])];
    expect(dragBlock(env(above), h(12), h(9, 30))).toEqual({ start: h(11), end: h(12, 15), length: 75 });
  });

  it("stops at a break", () => {
    const day = [booking("brk", "12:30 PM", [A(30)], { bookingType: "break" })];
    expect(dragBlock(env(day), h(12), h(14))).toEqual({ start: h(12), end: h(12, 30), length: 30 });
  });

  it("stops at closing time and at the top of the day", () => {
    expect(dragBlock(env(), h(17), h(19))).toEqual({ start: h(17), end: h(18), length: 60 });
    expect(dragBlock(env(), h(10, 30), h(8))).toEqual({ start: h(10), end: h(10, 45), length: 45 });
  });

  it("does not start on a booking, in the past or outside hours", () => {
    const day = [booking("a", "11:00 AM", [A(60)])];
    expect(dragBlock(env(day), h(11, 30), h(13))).toBeNull();
    expect(dragBlock(env([], { isPastDate: true }), h(11), h(12))).toBeNull();
    expect(dragBlock(env([], { isToday: true, nowMinutes: h(12) }), h(11), h(13))).toBeNull();
    expect(dragBlock(env(), h(9), h(10))).toBeNull();
  });

  it("stops at the current quarter hour when dragged up into the past today", () => {
    const today = env([], { isToday: true, nowMinutes: h(11, 20) });
    expect(dragBlock(today, h(12), h(9))).toEqual({ start: h(11, 15), end: h(12, 15), length: 60 });
  });

  it("only sees this stylist's bookings", () => {
    const other = [booking("o", "12:00 PM", [A(60)], { stylistId: "yuto" })];
    expect(dragBlock(env(other), h(11), h(14))).toEqual({ start: h(11), end: h(14, 15), length: 195 });
  });
});

describe("timeline create: inside another booking's processing gap", () => {
  // Digital perm 10:00: hands-on 10:00-11:00, processing 11:00-11:30, return 11:30-12:00
  const perm = booking("perm", "10:00 AM", [A(60), R(30), A(30)]);

  it("allows a block inside the gap", () => {
    expect(defaultBlock(env([perm]), h(11))).toEqual({ start: h(11), end: h(11, 30), length: 30 });
    expect(defaultBlock(env([perm]), h(11, 15))).toBeNull(); // 11:15-11:45 reaches the return block
    expect(dragBlock(env([perm]), h(11), h(11, 15))).toEqual({ start: h(11), end: h(11, 30), length: 30 });
  });

  it("stops a drag at the return block", () => {
    expect(dragBlock(env([perm]), h(11), h(13))).toEqual({ start: h(11), end: h(11, 30), length: 30 });
  });

  it("does not allow the hands-on or the return block", () => {
    expect(defaultBlock(env([perm]), h(10, 30))).toBeNull();
    expect(defaultBlock(env([perm]), h(11, 30))).toBeNull(); // the return is reserved
    expect(dragBlock(env([perm]), h(11, 45), h(13))).toBeNull();
    expect(refusalFor(env([perm]), h(11, 30), h(12))).toBe("Already booked");
  });

  it("protects a two-phase booking's return point (DEC-027)", () => {
    // 10:00-10:30 hands-on, 10:30-11:00 processing: the stylist is due back at 11:00
    const colour = booking("col", "10:00 AM", [A(30), R(30)]);
    expect(refusalFor(env([colour]), h(10, 30), h(11))).toBeNull(); // fits the gap
    expect(refusalFor(env([colour]), h(10, 45), h(11, 15))).toBe("Already booked"); // spans the return point
    expect(refusalFor(env([colour]), h(11), h(11, 30))).toBeNull();
  });
});

describe("timeline create: keyboard block and wording", () => {
  it("builds a block of a given length from a start, or null when it is not free", () => {
    const day = [booking("a", "12:00 PM", [A(60)])];
    expect(blockAt(env(day), h(11), 60)).toEqual({ start: h(11), end: h(12), length: 60 });
    expect(blockAt(env(day), h(11), 75)).toBeNull();
  });

  it("writes lengths", () => {
    expect(formatLength(15)).toBe("15 min");
    expect(formatLength(60)).toBe("1h");
    expect(formatLength(75)).toBe("1h 15");
    expect(formatLength(120)).toBe("2h");
  });
});
