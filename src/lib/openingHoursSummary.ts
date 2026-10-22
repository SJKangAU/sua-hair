// openingHoursSummary.ts
// What the public page says about opening hours and closures, worked out from the salon's
// settings (the same weeklySchedule / dateOverrides the booking rules use), so the words on the
// page can never disagree with what can be booked. Pure.

import { addDaysToDate, weekdayOfDate } from "./businessTime";
import type { DayOfWeek, DateOverrides, WeeklySchedule } from "../types";

// Monday first, the way the salon talks about its week.
const WEEK: { key: DayOfWeek; short: string }[] = [
  { key: "mon", short: "Mon" },
  { key: "tue", short: "Tue" },
  { key: "wed", short: "Wed" },
  { key: "thu", short: "Thu" },
  { key: "fri", short: "Fri" },
  { key: "sat", short: "Sat" },
  { key: "sun", short: "Sun" },
];

const DAY_KEYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** 10 -> "10am", 18 -> "6pm", 12 -> "12pm", 0 -> "12am" */
export const formatHourShort = (h: number): string => {
  const suffix = h < 12 || h === 24 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
};

export interface HoursRow {
  /** "Tue – Fri", "Sat", "Mon" */
  days: string;
  /** "10am – 6pm", or "Closed" */
  hours: string;
}

/** The weekly schedule as short rows, joining neighbouring days that share the same hours. */
export const weeklyHoursRows = (weekly: WeeklySchedule): HoursRow[] => {
  const textOf = (key: DayOfWeek): string => {
    const d = weekly[key];
    return d.isOpen ? `${formatHourShort(d.open)} – ${formatHourShort(d.close)}` : "Closed";
  };
  const rows: { from: string; to: string; hours: string }[] = [];
  for (const { key, short } of WEEK) {
    const hours = textOf(key);
    const last = rows[rows.length - 1];
    if (last && last.hours === hours) last.to = short;
    else rows.push({ from: short, to: short, hours });
  }
  return rows.map((r) => ({ days: r.from === r.to ? r.from : `${r.from} – ${r.to}`, hours: r.hours }));
};

export interface Closure {
  date: string;
  /** What the owner called it ("Christmas Day"), if anything */
  label: string;
}

/**
 * Days the salon is closed that the owner set as one-off overrides, from `today` for `horizonDays`.
 * Overrides that only change the hours are not closures. A day the salon is closed every week
 * anyway (a Monday) is skipped, since it is no news.
 */
export const upcomingClosures = (
  overrides: DateOverrides,
  weekly: WeeklySchedule,
  today: string,
  horizonDays = 120,
): Closure[] => {
  const last = addDaysToDate(today, horizonDays);
  return Object.entries(overrides)
    .filter(([date, o]) => o.closed === true && date >= today && date <= last)
    .filter(([date]) => weekly[DAY_KEYS[weekdayOfDate(date)]].isOpen)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, o]) => ({ date, label: (o.label ?? "").trim() }));
};

/** Joins consecutive dates into ranges: [{from, to, label}], so Dec 25-26 reads as one line. */
export interface ClosureRange {
  from: string;
  to: string;
  label: string;
}

export const closureRanges = (closures: Closure[]): ClosureRange[] => {
  const out: ClosureRange[] = [];
  for (const c of closures) {
    const last = out[out.length - 1];
    if (last && addDaysToDate(last.to, 1) === c.date && last.label === c.label) last.to = c.date;
    else out.push({ from: c.date, to: c.date, label: c.label });
  }
  return out;
};
