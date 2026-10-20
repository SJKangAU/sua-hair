// timelineCreate.ts
// Creating a booking by pointing at the admin timeline: which block the
// pointer is over, how a drag grows it, and where it must stop. Pure (minutes
// from midnight in, minutes out) so it can be unit-tested; the pointer, touch
// and keyboard plumbing lives in useTimelineCreate.
//
// The conflict check is NOT re-implemented here: every candidate block is put
// through findBookingConflict, the same function the customer page, the create
// form and the save use. A block may therefore sit inside another booking's
// processing gap, and stops at its hands-on blocks, its return point and breaks.

import { findBookingConflict, minutesToTimeString } from "./scheduling";
import {
  SNAP_MINUTES,
  formatClockShort,
  formatRangeShort,
} from "./timelineLayout";
import type { SlotBlock } from "../types";

// Length of the block a hover shows and a plain click creates
export const DEFAULT_CREATE_MINUTES = 30;

export interface CreateEnv {
  stylistId: string;
  date: string;
  // The stylist's bookable hours that day (hours as numbers, e.g. 10 and 18);
  // null = off, or the salon is closed
  hours: { open: number; close: number } | null;
  // The date is before today
  isPastDate: boolean;
  isToday: boolean;
  nowMinutes: number;
  // Everything booked that day; the conflict check picks this stylist's
  bookings: SlotBlock[];
}

export interface CreateBlock {
  start: number;
  end: number;
  length: number;
}

export const floorToStep = (minutes: number): number =>
  Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES;

// Why [start, end) cannot be a new block, in a few words, or null if it can.
// Order: the calendar (past, hours), then other bookings.
export const refusalFor = (
  env: CreateEnv,
  start: number,
  end: number,
): string | null => {
  if (env.isPastDate) return "That time has passed";
  // The current quarter hour is still open, so a client who has just walked in
  // can start at the time on the clock
  if (env.isToday && start < floorToStep(env.nowMinutes)) {
    return "That time has passed";
  }
  if (!env.hours) return "Not working";
  if (start < env.hours.open * 60) {
    return `Not working before ${minutesToTimeString(env.hours.open * 60)}`;
  }
  if (end > env.hours.close * 60) {
    return `Not working after ${minutesToTimeString(env.hours.close * 60)}`;
  }
  const clash = findBookingConflict(
    {
      stylistId: env.stylistId,
      date: env.date,
      time: minutesToTimeString(start),
      totalTime: end - start,
      activeTime: end - start,
    },
    env.bookings,
  );
  return clash ? "Already booked" : null;
};

const block = (start: number, end: number): CreateBlock => ({
  start,
  end,
  length: end - start,
});

// The block a hover shows, and a plain click creates: the 15-minute row under
// the pointer plus the default length. Null when it would not fit (a booking,
// a break, a return, the past or the stylist's hours is in the way) - a drag
// can still make a shorter one.
export const defaultBlock = (
  env: CreateEnv,
  pointerMinutes: number,
): CreateBlock | null => {
  const start = floorToStep(pointerMinutes);
  const end = start + DEFAULT_CREATE_MINUTES;
  return refusalFor(env, start, end) === null ? block(start, end) : null;
};

// The block while dragging from `anchorMinutes` (where the pointer went down) to
// `pointerMinutes`. Dragging down grows the end; dragging up pulls the start
// earlier. Snaps to 15 minutes, never shorter than one step, and stops at the
// last length that is still free. Null if even the first step is not free.
export const dragBlock = (
  env: CreateEnv,
  anchorMinutes: number,
  pointerMinutes: number,
): CreateBlock | null => {
  const anchor = floorToStep(anchorMinutes);
  const pointer = floorToStep(pointerMinutes);
  if (refusalFor(env, anchor, anchor + SNAP_MINUTES) !== null) return null;

  if (pointer >= anchor) {
    let end = anchor + SNAP_MINUTES;
    while (
      end < pointer + SNAP_MINUTES &&
      refusalFor(env, anchor, end + SNAP_MINUTES) === null
    ) {
      end += SNAP_MINUTES;
    }
    return block(anchor, end);
  }
  const end = anchor + SNAP_MINUTES;
  let start = anchor;
  while (
    start - SNAP_MINUTES >= pointer &&
    refusalFor(env, start - SNAP_MINUTES, end) === null
  ) {
    start -= SNAP_MINUTES;
  }
  return block(start, end);
};

// The block a keyboard cursor stands for: `length` minutes from `start`
export const blockAt = (
  env: CreateEnv,
  start: number,
  length: number,
): CreateBlock | null =>
  refusalFor(env, start, start + length) === null
    ? block(start, start + length)
    : null;

// "30 min", "1h", "1h 15", "1h 30"
export const formatLength = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}`;
};

// While hovering: "11:15 – 11:45 am". While dragging: "11:15 am – 12:15 pm, 1h"
export const blockLabel = (b: CreateBlock, withLength: boolean): string =>
  withLength
    ? `${formatRangeShort(b.start, b.end)}, ${formatLength(b.length)}`
    : formatRangeShort(b.start, b.end);

// Spoken version for the keyboard cursor
export const blockAnnouncement = (b: CreateBlock): string =>
  `${formatClockShort(b.start)} to ${formatClockShort(b.end)}, ${formatLength(
    b.length,
  )}`;
