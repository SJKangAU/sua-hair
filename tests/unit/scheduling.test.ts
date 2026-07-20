// tests/unit/scheduling.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Unit tests for the scheduling engine — the logic where a bug means a
// double-booked chair. Pure functions over minutes-from-midnight integers,
// so everything here runs without Firestore or the emulator:
// `npm run test:unit`.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  timeStringToMinutes,
  minutesToTimeString,
  isSalonClosed,
  getSalonHoursForDate,
  isPastSameDayCutoff,
  getMinBookableDate,
  computeReturnTime,
  canResizeBooking,
  buildTimeBlocks,
  isSlotAvailable,
  generateSlots,
} from "../../src/lib/scheduling";
import type {
  Booking,
  SalonSettings,
  SlotBlock,
  StylistWeeklyHours,
} from "../../src/types";

// ── Fixtures ─────────────────────────────────────────────────────────────

const block = (overrides: Partial<SlotBlock> = {}): SlotBlock => ({
  id: "bk-1",
  stylistId: "stylist-1",
  date: "2026-08-05", // a Wednesday
  time: "10:00 AM",
  activeTime: 30,
  restTime: 0,
  totalTime: 30,
  status: "confirmed",
  ...overrides,
});

const openDay = { isOpen: true, open: 10, close: 18 };
const settings = (overrides: Partial<SalonSettings> = {}): SalonSettings => ({
  weeklySchedule: {
    sun: openDay,
    mon: { isOpen: false, open: 10, close: 18 },
    tue: openDay,
    wed: openDay,
    thu: openDay,
    fri: openDay,
    sat: openDay,
  },
  dateOverrides: {},
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

/** Freeze "now" at a local date+time so today-dependent rules are exact. */
const freezeAt = (isoLocal: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoLocal));
};

// ── Time conversions ─────────────────────────────────────────────────────

describe("timeStringToMinutes", () => {
  it("converts morning, afternoon, and edge times", () => {
    expect(timeStringToMinutes("10:00 AM")).toBe(600);
    expect(timeStringToMinutes("10:30 AM")).toBe(630);
    expect(timeStringToMinutes("1:00 PM")).toBe(780);
    expect(timeStringToMinutes("12:00 PM")).toBe(720); // noon
    expect(timeStringToMinutes("12:00 AM")).toBe(0); // midnight
    expect(timeStringToMinutes("12:30 AM")).toBe(30);
  });
});

describe("minutesToTimeString", () => {
  it("converts back including noon/midnight edges", () => {
    expect(minutesToTimeString(600)).toBe("10:00 AM");
    expect(minutesToTimeString(630)).toBe("10:30 AM");
    expect(minutesToTimeString(780)).toBe("1:00 PM");
    expect(minutesToTimeString(720)).toBe("12:00 PM");
    expect(minutesToTimeString(0)).toBe("12:00 AM");
  });

  it("round-trips every half-hour slot in a trading day", () => {
    for (let m = 600; m <= 1080; m += 30) {
      expect(timeStringToMinutes(minutesToTimeString(m))).toBe(m);
    }
  });
});

// ── Salon open/closed rules ──────────────────────────────────────────────

describe("isSalonClosed", () => {
  it("falls back to SALON_CONFIG closed days without settings (Monday)", () => {
    expect(isSalonClosed("2026-08-03")).toBe(true); // Monday
    expect(isSalonClosed("2026-08-05")).toBe(false); // Wednesday
  });

  it("respects the weekly schedule from settings", () => {
    expect(isSalonClosed("2026-08-03", settings())).toBe(true); // mon closed
    expect(isSalonClosed("2026-08-02", settings())).toBe(false); // sun open
  });

  it("date override closes an otherwise open day", () => {
    const s = settings({ dateOverrides: { "2026-08-05": { closed: true } } });
    expect(isSalonClosed("2026-08-05", s)).toBe(true);
  });

  it("date override with custom hours opens an otherwise closed day", () => {
    const s = settings({
      dateOverrides: { "2026-08-03": { open: 12, close: 16 } },
    });
    expect(isSalonClosed("2026-08-03", s)).toBe(false);
  });
});

describe("getSalonHoursForDate", () => {
  it("returns config trading hours without settings", () => {
    expect(getSalonHoursForDate("2026-08-05")).toEqual({ open: 10, close: 18 });
  });

  it("returns null for a closed day and custom hours for an override", () => {
    const s = settings({
      dateOverrides: { "2026-08-06": { open: 11, close: 15 } },
    });
    expect(getSalonHoursForDate("2026-08-03", s)).toBeNull(); // mon
    expect(getSalonHoursForDate("2026-08-06", s)).toEqual({
      open: 11,
      close: 15,
    });
  });
});

// ── Same-day cutoff ──────────────────────────────────────────────────────

describe("isPastSameDayCutoff / getMinBookableDate", () => {
  it("before the 5pm cutoff, today is bookable", () => {
    freezeAt("2026-08-05T10:00:00");
    expect(isPastSameDayCutoff("2026-08-05")).toBe(false);
    expect(getMinBookableDate()).toBe("2026-08-05");
  });

  it("after the 5pm cutoff, the minimum bookable date is tomorrow", () => {
    freezeAt("2026-08-05T17:00:00");
    expect(isPastSameDayCutoff("2026-08-05")).toBe(true);
    expect(getMinBookableDate()).toBe("2026-08-06");
  });

  it("cutoff never applies to a future date", () => {
    freezeAt("2026-08-05T17:30:00");
    expect(isPastSameDayCutoff("2026-08-06")).toBe(false);
  });
});

// ── computeReturnTime ────────────────────────────────────────────────────

describe("computeReturnTime", () => {
  it("adds total time to the start time", () => {
    expect(computeReturnTime("10:00 AM", 75)).toBe("11:15 AM");
    expect(computeReturnTime("11:30 AM", 60)).toBe("12:30 PM");
  });
});

// ── buildTimeBlocks ──────────────────────────────────────────────────────

describe("buildTimeBlocks", () => {
  it("filters to the stylist and date, excluding cancelled bookings", () => {
    const bookings = [
      block(),
      block({ id: "bk-2", stylistId: "stylist-2" }),
      block({ id: "bk-3", date: "2026-08-06" }),
      block({ id: "bk-4", status: "cancelled", time: "2:00 PM" }),
    ];
    const blocks = buildTimeBlocks(bookings, "stylist-1", "2026-08-05");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startMinutes).toBe(600);
  });

  it("computes active/total end minutes and the rest flag", () => {
    const [b] = buildTimeBlocks(
      [block({ time: "10:00 AM", activeTime: 30, restTime: 30, totalTime: 60 })],
      "stylist-1",
      "2026-08-05",
    );
    expect(b.activeEndMinutes).toBe(630);
    expect(b.totalEndMinutes).toBe(660);
    expect(b.isRestPeriod).toBe(true);
  });
});

// ── isSlotAvailable ──────────────────────────────────────────────────────

describe("isSlotAvailable", () => {
  const blocksFor = (bookings: SlotBlock[]) =>
    buildTimeBlocks(bookings, "stylist-1", "2026-08-05");

  it("is available with no existing bookings", () => {
    expect(isSlotAvailable(600, 60, 60, [])).toBe(true);
  });

  it("blocks an overlapping slot", () => {
    const blocks = blocksFor([block({ time: "10:00 AM", totalTime: 60, activeTime: 60 })]);
    expect(isSlotAvailable(630, 30, 30, blocks)).toBe(false); // starts mid-booking
    expect(isSlotAvailable(570, 60, 60, blocks)).toBe(false); // ends mid-booking
  });

  it("allows back-to-back slots (end == start)", () => {
    const blocks = blocksFor([block({ time: "10:00 AM", totalTime: 60, activeTime: 60 })]);
    expect(isSlotAvailable(660, 30, 30, blocks)).toBe(true); // starts as it ends
    expect(isSlotAvailable(570, 30, 30, blocks)).toBe(true); // ends as it starts
  });

  it("allows a booking that fits entirely inside a rest window", () => {
    // 10:00–10:30 active, 10:30–11:30 rest — stylist free 630–690
    const blocks = blocksFor([
      block({ time: "10:00 AM", activeTime: 30, restTime: 60, totalTime: 90 }),
    ]);
    // 30-min all-active service at 10:30 → active ends 660 ≤ 690 ✓
    expect(isSlotAvailable(630, 30, 30, blocks)).toBe(true);
  });

  it("blocks a booking whose active time overruns the rest window", () => {
    const blocks = blocksFor([
      block({ time: "10:00 AM", activeTime: 30, restTime: 60, totalTime: 90 }),
    ]);
    // 90-min active service at 10:30 → active ends 720 > 690 ✗
    expect(isSlotAvailable(630, 90, 90, blocks)).toBe(false);
  });

  it("blocks a booking that starts during the active period even with rest", () => {
    const blocks = blocksFor([
      block({ time: "10:00 AM", activeTime: 30, restTime: 60, totalTime: 90 }),
    ]);
    expect(isSlotAvailable(615, 30, 30, blocks)).toBe(false); // 10:15 — mid-active
  });
});

// ── generateSlots ────────────────────────────────────────────────────────

describe("generateSlots", () => {
  it("returns no slots on a closed day", () => {
    freezeAt("2026-08-01T09:00:00");
    expect(generateSlots("2026-08-03", "stylist-1", 30, 30, [], settings())).toEqual([]);
  });

  it("spans trading hours with only slots the service can finish within", () => {
    freezeAt("2026-08-01T09:00:00"); // future date → no "too soon" filtering
    const slots = generateSlots("2026-08-05", "stylist-1", 60, 60, [], settings());
    expect(slots[0].time).toBe("10:00 AM");
    // Last startable slot for a 60-min service closing at 6pm is 5:00 PM
    expect(slots[slots.length - 1].time).toBe("5:00 PM");
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it("marks slots blocked by an existing booking as unavailable", () => {
    freezeAt("2026-08-01T09:00:00");
    const existing = [
      block({ time: "11:00 AM", activeTime: 60, restTime: 0, totalTime: 60 }),
    ];
    const slots = generateSlots("2026-08-05", "stylist-1", 30, 30, existing, settings());
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s.available]));
    expect(byTime["10:30 AM"]).toBe(true);
    expect(byTime["11:00 AM"]).toBe(false);
    expect(byTime["11:30 AM"]).toBe(false);
    expect(byTime["12:00 PM"]).toBe(true);
  });

  it("ignores another stylist's bookings", () => {
    freezeAt("2026-08-01T09:00:00");
    const existing = [
      block({ stylistId: "stylist-2", time: "11:00 AM", activeTime: 60, totalTime: 60 }),
    ];
    const slots = generateSlots("2026-08-05", "stylist-1", 30, 30, existing, settings());
    expect(slots.find((s) => s.time === "11:00 AM")?.available).toBe(true);
  });

  it("marks today's slots inside the minimum-notice window as too soon", () => {
    freezeAt("2026-08-05T10:00:00"); // Wednesday 10am, 2h notice → first bookable 12:00
    const slots = generateSlots("2026-08-05", "stylist-1", 30, 30, [], settings());
    const byTime = Object.fromEntries(slots.map((s) => [s.time, s]));
    expect(byTime["11:30 AM"].available).toBe(false);
    expect(byTime["11:30 AM"].reason).toBe("Too soon");
    expect(byTime["12:00 PM"].available).toBe(true);
  });

  it("constrains to per-stylist working hours", () => {
    freezeAt("2026-08-01T09:00:00");
    const hours: StylistWeeklyHours = {
      sun: { isWorking: true, start: 10, end: 18 },
      mon: { isWorking: false, start: 10, end: 18 },
      tue: { isWorking: true, start: 10, end: 18 },
      wed: { isWorking: true, start: 12, end: 15 },
      thu: { isWorking: true, start: 10, end: 18 },
      fri: { isWorking: true, start: 10, end: 18 },
      sat: { isWorking: true, start: 10, end: 18 },
    };
    const slots = generateSlots("2026-08-05", "stylist-1", 30, 30, [], settings(), hours);
    expect(slots[0].time).toBe("12:00 PM");
    expect(slots[slots.length - 1].time).toBe("2:30 PM");
  });

  it("returns no slots when the stylist is off that day", () => {
    freezeAt("2026-08-01T09:00:00");
    const hours: StylistWeeklyHours = {
      sun: { isWorking: true, start: 10, end: 18 },
      mon: { isWorking: false, start: 10, end: 18 },
      tue: { isWorking: true, start: 10, end: 18 },
      wed: { isWorking: false, start: 10, end: 18 },
      thu: { isWorking: true, start: 10, end: 18 },
      fri: { isWorking: true, start: 10, end: 18 },
      sat: { isWorking: true, start: 10, end: 18 },
    };
    expect(
      generateSlots("2026-08-05", "stylist-1", 30, 30, [], settings(), hours),
    ).toEqual([]);
  });
});

// ── canResizeBooking ─────────────────────────────────────────────────────

describe("canResizeBooking", () => {
  const booking = {
    id: "bk-1",
    stylistId: "stylist-1",
    date: "2026-08-05",
    time: "10:00 AM",
    activeTime: 30,
    restTime: 0,
    totalTime: 30,
    status: "confirmed",
  } as Booking;

  it("excludes the booking from its own conflict check", () => {
    expect(canResizeBooking(booking, 60, 60, [block()])).toBe(true);
  });

  it("blocks a resize that would overlap the next booking", () => {
    const next = block({ id: "bk-2", time: "10:30 AM" });
    expect(canResizeBooking(booking, 60, 60, [block(), next])).toBe(false);
    expect(canResizeBooking(booking, 30, 30, [block(), next])).toBe(true);
  });
});
