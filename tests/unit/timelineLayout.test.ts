// tests/unit/timelineLayout.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Geometry, free-time and resize maths behind the admin timeline, plus the
// stylist-hours helper that replaced SALON_CONFIG on the grid.
import { describe, expect, it } from "vitest";
import {
  PX_PER_MIN,
  clampStart,
  computeDayRange,
  findFreeIntervals,
  findGapWindow,
  formatRangeShort,
  minutesToPx,
  pxToMinutes,
  resizePhases,
  snapMinutes,
  tileFreeIntervals,
} from "../../src/lib/timelineLayout";
import { getStylistHoursForDate } from "../../src/lib/scheduling";
import type { SalonSettings, StylistWeeklyHours } from "../../src/types";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

describe("snapping and pixels", () => {
  it("snaps to the nearest 15 minutes", () => {
    expect(snapMinutes(h(10, 7))).toBe(h(10));
    expect(snapMinutes(h(10, 8))).toBe(h(10, 15));
    expect(snapMinutes(h(10, 53))).toBe(h(11));
  });

  it("round-trips minutes and pixels", () => {
    const range = { start: h(10), end: h(18) };
    expect(minutesToPx(h(11), range)).toBe(60 * PX_PER_MIN);
    expect(pxToMinutes(60 * PX_PER_MIN, range)).toBe(h(11));
  });

  it("keeps a block inside the grid", () => {
    const range = { start: h(10), end: h(18) };
    expect(clampStart(h(9), 60, range)).toBe(h(10));
    expect(clampStart(h(17, 30), 60, range)).toBe(h(17));
    expect(clampStart(h(12), 60, range)).toBe(h(12));
  });
});

describe("computeDayRange", () => {
  it("uses the salon's hours for the date", () => {
    expect(computeDayRange({ open: 10, close: 18 }, [])).toEqual({
      start: h(10),
      end: h(18),
      closed: false,
    });
  });

  it("falls back to 10-6 and flags a closed day", () => {
    expect(computeDayRange(null, [])).toEqual({
      start: h(10),
      end: h(18),
      closed: true,
    });
  });

  it("stretches in whole hours to include bookings outside opening hours", () => {
    const range = computeDayRange({ open: 10, close: 18 }, [
      { time: "9:30 AM", totalTime: 45 },
      { time: "5:30 PM", totalTime: 90 },
    ]);
    expect(range.start).toBe(h(9));
    expect(range.end).toBe(h(19));
  });
});

describe("findFreeIntervals / tileFreeIntervals", () => {
  const window = { start: h(10), end: h(14) };

  it("returns the whole window when nothing is booked", () => {
    expect(findFreeIntervals([], window, 45)).toEqual([window]);
  });

  it("removes booked time and drops pieces shorter than the minimum", () => {
    const free = findFreeIntervals(
      [
        { start: h(10, 30), end: h(11, 30) },
        { start: h(12), end: h(13, 30) },
      ],
      window,
      45,
    );
    // 10:00-10:30 (30) and 11:30-12:00 (30) are too short; 13:30-14:00 (30) too
    expect(free).toEqual([]);
    const free2 = findFreeIntervals(
      [{ start: h(11), end: h(12) }],
      window,
      45,
    );
    expect(free2).toEqual([
      { start: h(10), end: h(11) },
      { start: h(12), end: h(14) },
    ]);
  });

  it("copes with overlapping, unsorted and out-of-window bookings", () => {
    const free = findFreeIntervals(
      [
        { start: h(11), end: h(12, 30) },
        { start: h(9), end: h(10, 15) },
        { start: h(12), end: h(13) },
        { start: h(15), end: h(16) },
      ],
      window,
      15,
    );
    expect(free).toEqual([
      { start: h(10, 15), end: h(11) },
      { start: h(13), end: h(14) },
    ]);
  });

  it("tiles long stretches into hour-long buttons", () => {
    expect(tileFreeIntervals([{ start: h(10), end: h(13) }])).toEqual([
      { start: h(10), end: h(11) },
      { start: h(11), end: h(12) },
      { start: h(12), end: h(13) },
    ]);
  });

  it("keeps a 45-60 minute stretch as one button", () => {
    expect(tileFreeIntervals([{ start: h(10), end: h(10, 45) }])).toEqual([
      { start: h(10), end: h(10, 45) },
    ]);
  });

  it("gives a long-enough remainder its own button, else folds it in", () => {
    expect(tileFreeIntervals([{ start: h(10), end: h(11, 50) }])).toEqual([
      { start: h(10), end: h(11) },
      { start: h(11), end: h(11, 50) },
    ]);
    expect(tileFreeIntervals([{ start: h(10), end: h(11, 20) }])).toEqual([
      { start: h(10), end: h(11, 20) },
    ]);
  });

  it("ignores stretches under 45 minutes", () => {
    expect(tileFreeIntervals([{ start: h(10), end: h(10, 30) }])).toEqual([]);
  });
});

describe("findGapWindow", () => {
  const colour = {
    time: "10:00 AM",
    activeTime: 30,
    restTime: 60,
    totalTime: 90,
  };

  it("is the processing stretch when nobody else is booked in it", () => {
    expect(findGapWindow(colour, [])).toEqual({ start: h(10, 30), end: h(11, 30) });
  });

  it("starts after another booking that occupies the front of the gap", () => {
    expect(
      findGapWindow(colour, [{ time: "10:30 AM", totalTime: 30 }]),
    ).toEqual({ start: h(11), end: h(11, 30) });
  });

  it("is null for a booking with no processing time or a fully used gap", () => {
    expect(findGapWindow({ ...colour, restTime: 0, totalTime: 30 }, [])).toBeNull();
    expect(
      findGapWindow(colour, [{ time: "10:30 AM", totalTime: 60 }]),
    ).toBeNull();
  });
});

describe("resizePhases", () => {
  const colour = { time: "10:00 AM", activeTime: 30, restTime: 60 };
  const cut = { time: "10:00 AM", activeTime: 45, restTime: 0 };

  it("lengthens processing when the booking has one", () => {
    expect(resizePhases(colour, h(12))).toEqual({ activeTime: 30, restTime: 90 });
  });

  it("lengthens apply when there is no processing", () => {
    expect(resizePhases(cut, h(11))).toEqual({ activeTime: 60, restTime: 0 });
  });

  it("snaps the dragged edge to 15 minutes", () => {
    expect(resizePhases(cut, h(10, 58))).toEqual({ activeTime: 60, restTime: 0 });
  });

  it("shortens processing first when shrinking", () => {
    expect(resizePhases(colour, h(10, 45))).toEqual({ activeTime: 30, restTime: 15 });
  });

  it("shrinking past the processing time eats into apply", () => {
    expect(resizePhases(colour, h(10, 15))).toEqual({ activeTime: 15, restTime: 0 });
  });

  it("rejects a booking shorter than the minimum apply time", () => {
    expect(resizePhases(cut, h(10))).toBeNull();
    expect(resizePhases(colour, h(10))).toBeNull();
  });
});

describe("formatRangeShort", () => {
  it("shares the meridiem when both ends match", () => {
    expect(formatRangeShort(h(14, 30), h(16))).toBe("2:30 – 4:00 pm");
    expect(formatRangeShort(h(10), h(11, 15))).toBe("10:00 – 11:15 am");
  });

  it("shows both when the range crosses noon", () => {
    expect(formatRangeShort(h(11, 30), h(12, 30))).toBe("11:30 am – 12:30 pm");
  });
});

describe("getStylistHoursForDate", () => {
  const open = { isOpen: true, open: 10, close: 18 };
  const settings: SalonSettings = {
    weeklySchedule: {
      sun: open,
      mon: { isOpen: false, open: 10, close: 18 },
      tue: open,
      wed: open,
      thu: open,
      fri: open,
      sat: open,
    },
    dateOverrides: { "2026-08-07": { open: 11, close: 15 } },
  };
  const working = (start: number, end: number): StylistWeeklyHours => {
    const day = { isWorking: true, start, end };
    return { sun: day, mon: day, tue: day, wed: day, thu: day, fri: day, sat: day };
  };

  it("is the salon's hours when the stylist has no custom hours", () => {
    expect(getStylistHoursForDate("2026-08-05", settings)).toEqual({ open: 10, close: 18 });
  });

  it("is null on a day the salon is closed", () => {
    expect(getStylistHoursForDate("2026-08-03", settings)).toBeNull(); // Monday
  });

  it("narrows to the stylist's working hours", () => {
    expect(getStylistHoursForDate("2026-08-05", settings, working(11, 16))).toEqual({
      open: 11,
      close: 16,
    });
  });

  it("is null when the stylist is off, or their hours miss the salon's", () => {
    const off = { ...working(10, 18), wed: { isWorking: false, start: 10, end: 18 } };
    expect(getStylistHoursForDate("2026-08-05", settings, off)).toBeNull();
    expect(getStylistHoursForDate("2026-08-05", settings, working(19, 21))).toBeNull();
  });

  it("respects date overrides when narrowing", () => {
    expect(getStylistHoursForDate("2026-08-07", settings, working(10, 18))).toEqual({
      open: 11,
      close: 15,
    });
  });
});
