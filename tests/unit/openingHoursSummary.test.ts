// openingHoursSummary.test.ts
// What the public page says about hours and closures comes from the salon's settings.

import { describe, expect, it } from "vitest";
import {
  closureRanges,
  formatHourShort,
  upcomingClosures,
  weeklyHoursRows,
} from "../../src/lib/openingHoursSummary";
import type { DayOfWeek, WeeklySchedule } from "../../src/types";

const day = (open: number, close: number) => ({ isOpen: true, open, close });
const week = (over: Partial<WeeklySchedule> = {}): WeeklySchedule => ({
  mon: { isOpen: false, open: 10, close: 18 },
  tue: day(10, 18),
  wed: day(10, 18),
  thu: day(10, 18),
  fri: day(10, 18),
  sat: day(10, 18),
  sun: day(10, 18),
  ...over,
});

describe("formatHourShort", () => {
  it("writes hours the way the salon would", () => {
    expect([0, 9, 10, 12, 13, 18].map(formatHourShort)).toEqual(["12am", "9am", "10am", "12pm", "1pm", "6pm"]);
  });
});

describe("weeklyHoursRows", () => {
  it("joins neighbouring days that share hours", () => {
    expect(weeklyHoursRows(week())).toEqual([
      { days: "Mon", hours: "Closed" },
      { days: "Tue – Sun", hours: "10am – 6pm" },
    ]);
  });
  it("splits when a day differs", () => {
    const rows = weeklyHoursRows(week({ sat: day(9, 17), sun: day(9, 17) } as Partial<Record<DayOfWeek, ReturnType<typeof day>>>));
    expect(rows).toEqual([
      { days: "Mon", hours: "Closed" },
      { days: "Tue – Fri", hours: "10am – 6pm" },
      { days: "Sat – Sun", hours: "9am – 5pm" },
    ]);
  });
});

describe("upcomingClosures", () => {
  // 2026-12-25 is a Friday, 2026-12-28 a Monday (closed every week anyway)
  const overrides = {
    "2026-12-25": { closed: true, label: "Christmas Day" },
    "2026-12-26": { closed: true, label: "Boxing Day" },
    "2026-12-28": { closed: true },
    "2026-11-10": { open: 12, close: 16 },
    "2026-10-01": { closed: true, label: "Past" },
    "2027-06-01": { closed: true, label: "Too far" },
  };
  it("lists future full closures on days that would have been open", () => {
    expect(upcomingClosures(overrides, week(), "2026-10-23")).toEqual([
      { date: "2026-12-25", label: "Christmas Day" },
      { date: "2026-12-26", label: "Boxing Day" },
    ]);
  });
  it("skips changed-hours days and the past", () => {
    const dates = upcomingClosures(overrides, week(), "2026-10-23").map((c) => c.date);
    expect(dates).not.toContain("2026-11-10");
    expect(dates).not.toContain("2026-10-01");
  });
  it("includes today", () => {
    expect(upcomingClosures({ "2026-12-25": { closed: true } }, week(), "2026-12-25")).toHaveLength(1);
  });
});

describe("closureRanges", () => {
  it("joins consecutive days with the same reason", () => {
    expect(closureRanges([
      { date: "2026-12-25", label: "Christmas" },
      { date: "2026-12-26", label: "Christmas" },
      { date: "2027-01-01", label: "New Year" },
    ])).toEqual([
      { from: "2026-12-25", to: "2026-12-26", label: "Christmas" },
      { from: "2027-01-01", to: "2027-01-01", label: "New Year" },
    ]);
  });
  it("keeps different reasons apart", () => {
    expect(closureRanges([{ date: "2026-12-25", label: "Christmas Day" }, { date: "2026-12-26", label: "Boxing Day" }])).toHaveLength(2);
  });
});
