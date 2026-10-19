// timelineLayout.ts
// Pure geometry and gap-finding for the admin timeline. Everything here works
// in minutes-from-midnight; the components turn minutes into pixels with
// PX_PER_MIN. Kept free of React / Firebase so it can be unit-tested.

import { timeStringToMinutes } from "./scheduling";
import { validatePhases, MIN_ACTIVE_MINUTES, type Phases } from "./phases";
import type { Booking } from "../types";

export const PX_PER_MIN = 2;
export const SNAP_MINUTES = 15;
// Free stretches at least this long get an "open slot" button
export const MIN_OPEN_SLOT_MINUTES = 45;
// ...tiled into buttons of about this length so a quiet day isn't one huge box
export const OPEN_SLOT_TILE_MINUTES = 60;
// Used for the grid when the salon is closed that day
const FALLBACK_HOURS = { open: 10, close: 18 };

export interface Interval {
  start: number;
  end: number;
}

export interface DayRange extends Interval {
  // True when the salon is closed that day (the grid then uses fallback hours)
  closed: boolean;
}

export const snapMinutes = (minutes: number): number =>
  Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;

export const minutesToPx = (minutes: number, range: Interval): number =>
  (minutes - range.start) * PX_PER_MIN;

export const pxToMinutes = (px: number, range: Interval): number =>
  range.start + px / PX_PER_MIN;

export const rangeHeightPx = (range: Interval): number =>
  (range.end - range.start) * PX_PER_MIN;

// Keep a block of `length` minutes inside the grid
export const clampStart = (
  start: number,
  length: number,
  range: Interval,
): number => Math.max(range.start, Math.min(start, range.end - length));

// The vertical extent of the day's grid: the salon's opening hours for that
// date (override-aware — pass getSalonHoursForDate's result), stretched in
// whole hours to include any booking that falls outside them so nothing is
// ever hidden off-grid.
export const computeDayRange = (
  salonHours: { open: number; close: number } | null,
  bookings: Pick<Booking, "time" | "totalTime">[],
): DayRange => {
  const base = salonHours ?? FALLBACK_HOURS;
  let start = base.open * 60;
  let end = base.close * 60;
  for (const b of bookings) {
    const s = timeStringToMinutes(b.time);
    start = Math.min(start, Math.floor(s / 60) * 60);
    end = Math.max(end, Math.ceil((s + b.totalTime) / 60) * 60);
  }
  return { start, end, closed: salonHours === null };
};

// ── Free time ────────────────────────────────────────────────────────────────

// Free stretches inside `window`, once `occupied` is taken out, each at least
// `minLength` long. `occupied` may overlap and need not be sorted.
export const findFreeIntervals = (
  occupied: Interval[],
  window: Interval,
  minLength: number,
): Interval[] => {
  const sorted = [...occupied].sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = window.start;
  for (const block of sorted) {
    if (block.end <= cursor) continue;
    if (block.start >= window.end) break;
    if (block.start > cursor) free.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free.filter((i) => i.end - i.start >= minLength);
};

// Splits free stretches into open-slot buttons of about `tile` minutes. A
// stretch shorter than the tile is one button; a remainder too short to stand
// on its own (< minLength) is folded into the previous button.
export const tileFreeIntervals = (
  free: Interval[],
  tile = OPEN_SLOT_TILE_MINUTES,
  minLength = MIN_OPEN_SLOT_MINUTES,
): Interval[] => {
  const tiles: Interval[] = [];
  for (const gap of free) {
    const length = gap.end - gap.start;
    if (length < minLength) continue;
    const count = Math.floor(length / tile);
    if (count === 0) {
      tiles.push(gap);
      continue;
    }
    const remainder = length - count * tile;
    for (let i = 0; i < count; i++) {
      const start = gap.start + i * tile;
      const isLast = i === count - 1;
      const end = isLast
        ? remainder >= minLength
          ? start + tile
          : gap.end
        : start + tile;
      tiles.push({ start, end });
    }
    if (remainder >= minLength) {
      tiles.push({ start: gap.start + count * tile, end: gap.end });
    }
  }
  return tiles;
};

// The "Open slot" buttons for one stylist on one day: free stretches of 45+
// minutes inside their working hours, tiled. Nothing on a closed day, an off
// day or a past date; today nothing before now (rounded up a step). `occupied`
// is whatever should count as taken — the timeline passes the visible ghosts
// too so a button never sits on top of one. Shared by the timeline columns and
// the Today page's "next opening".
export const computeOpenSlots = ({
  hours,
  range,
  isPast,
  isToday,
  nowMinutes,
  occupied,
}: {
  hours: { open: number; close: number } | null;
  range: DayRange;
  isPast: boolean;
  isToday: boolean;
  nowMinutes: number;
  occupied: Interval[];
}): Interval[] => {
  if (!hours || range.closed || isPast) return [];
  let start = Math.max(range.start, hours.open * 60);
  const end = Math.min(range.end, hours.close * 60);
  if (isToday) {
    start = Math.max(start, Math.ceil(nowMinutes / SNAP_MINUTES) * SNAP_MINUTES);
  }
  if (end - start < MIN_OPEN_SLOT_MINUTES) return [];
  return tileFreeIntervals(
    findFreeIntervals(occupied, { start, end }, MIN_OPEN_SLOT_MINUTES),
  );
};

// The part of a booking's processing window another client could use: the
// stretch between the end of its apply phase and the stylist's return, minus
// anything else booked in that stretch. Returns the first free piece of at
// least one step, or null. Another booking's own processing time is treated
// as occupied here — the create-booking modal's conflict check has the final
// say on exactly what fits.
export const findGapWindow = (
  booking: Pick<Booking, "time" | "activeTime" | "totalTime" | "restTime">,
  others: Pick<Booking, "time" | "totalTime">[],
): Interval | null => {
  if (booking.restTime <= 0) return null;
  const start = timeStringToMinutes(booking.time);
  const window = { start: start + booking.activeTime, end: start + booking.totalTime };
  const occupied = others.map((o) => {
    const s = timeStringToMinutes(o.time);
    return { start: s, end: s + o.totalTime };
  });
  return findFreeIntervals(occupied, window, SNAP_MINUTES)[0] ?? null;
};

// ── Resize ───────────────────────────────────────────────────────────────────

// New phase lengths when the bottom edge of a booking is dragged to
// `endMinutes`. The change lands on processing when the booking has any
// (spilling into apply if it shrinks past zero), otherwise on apply.
// Returns null if the result isn't a valid booking length.
export const resizePhases = (
  booking: Pick<Booking, "time" | "activeTime" | "restTime">,
  endMinutes: number,
): Phases | null => {
  const start = timeStringToMinutes(booking.time);
  const total = snapMinutes(endMinutes) - start;
  const delta = total - (booking.activeTime + booking.restTime);

  let activeTime = booking.activeTime;
  let restTime = booking.restTime;
  if (booking.restTime > 0) {
    restTime += delta;
    if (restTime < 0) {
      activeTime += restTime;
      restTime = 0;
    }
  } else {
    activeTime += delta;
  }
  const next = { activeTime, restTime };
  return validatePhases(next) === null && activeTime >= MIN_ACTIVE_MINUTES
    ? next
    : null;
};

// ── Wording ──────────────────────────────────────────────────────────────────

const clock = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
};
const meridiem = (minutes: number): string =>
  Math.floor(minutes / 60) % 24 >= 12 ? "pm" : "am";

// "4:00 pm"
export const formatClockShort = (minutes: number): string =>
  `${clock(minutes)} ${meridiem(minutes)}`;

// "2:30 – 4:00 pm", or "11:30 am – 12:30 pm" when it crosses noon
export const formatRangeShort = (start: number, end: number): string =>
  meridiem(start) === meridiem(end)
    ? `${clock(start)} – ${clock(end)} ${meridiem(end)}`
    : `${clock(start)} ${meridiem(start)} – ${clock(end)} ${meridiem(end)}`;
