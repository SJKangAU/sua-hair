// slotPreview.ts
// The pure logic behind the booking page's hover preview: given where the
// pointer (or keyboard cursor) is on the day grid, what block would a booking
// occupy, and can it actually be booked there?
//
// Two grids:
//   - the DISPLAY grid snaps to 15 minutes, so the preview moves smoothly;
//   - valid START times are the engine's slots (SALON_CONFIG.slotIntervalMinutes,
//     produced by generateSlots) - currently also every 15 minutes (DEC-024).
//   This file never decides availability itself - it only looks a position up
//   in the slots the engine already produced, so every rule (rest windows,
//   closing time, 2h notice, same-day cutoff, stylist hours) stays in
//   scheduling.ts.
//   If the interval is ever set wider than the display grid (say 30), a display
//   position that is not an engine slot is reported as "off-grid": shown as not
//   available, never as a highlighted block.

import { SALON_CONFIG } from "./config";
import { formatRangeShort } from "./timelineLayout";
import { minutesToTimeString, timeStringToMinutes } from "./scheduling";

// Display snap only - not a booking rule.
export const PREVIEW_SNAP_MINUTES = 15;

export interface PreviewSlot {
  time: string; // "10:30 AM"
  available: boolean;
  reason?: string;
}

export type SlotPreview =
  // The booking fits: it would occupy [start, end), hands-on until activeEnd
  | {
      kind: "ok";
      start: number;
      end: number;
      activeEnd: number;
      time: string;
      label: string;
    }
  // On the grid, but the engine says no (clash, too soon, ...)
  | { kind: "unavailable"; start: number; reason: string }
  // A display position that is not a bookable start (only when the engine's
  // interval is wider than the 15-minute display grid)
  | { kind: "off-grid"; start: number }
  // On the grid but the engine produced no slot (before opening, or the
  // service would finish after closing)
  | { kind: "outside"; start: number };

// The 15-minute row containing a position (rows are [start, start + 15))
export const snapToPreviewGrid = (minutes: number): number =>
  Math.floor(minutes / PREVIEW_SNAP_MINUTES) * PREVIEW_SNAP_MINUTES;

export const isBookableStartPosition = (
  minutes: number,
  interval: number = SALON_CONFIG.slotIntervalMinutes,
): boolean => minutes % interval === 0;

// The latest bookable start at or before a position - what a finger tap on a
// row that is not a start resolves to, since a touch screen has no hover to
// tell the rows apart. (With a 15-minute interval every row is a start.)
export const bookableStartAtOrBefore = (
  minutes: number,
  interval: number = SALON_CONFIG.slotIntervalMinutes,
): number => Math.floor(minutes / interval) * interval;

export const previewAt = (
  position: number,
  slots: PreviewSlot[],
  totalTime: number,
  activeTime: number,
  interval: number = SALON_CONFIG.slotIntervalMinutes,
): SlotPreview => {
  const start = snapToPreviewGrid(position);
  if (!isBookableStartPosition(start, interval)) {
    return { kind: "off-grid", start };
  }

  const slot = slots.find((s) => timeStringToMinutes(s.time) === start);
  if (!slot) return { kind: "outside", start };
  if (!slot.available) {
    return {
      kind: "unavailable",
      start,
      reason: slot.reason ?? "Not available",
    };
  }

  const end = start + totalTime;
  return {
    kind: "ok",
    start,
    end,
    activeEnd: start + Math.min(activeTime, totalTime),
    time: minutesToTimeString(start),
    label: formatRangeShort(start, end),
  };
};

// Keyboard: move the cursor by `delta` minutes, staying on the display grid
// and inside [min, max) (the day's rows)
export const stepCursor = (
  current: number,
  delta: number,
  min: number,
  max: number,
): number => {
  const next = snapToPreviewGrid(current) + delta;
  const last = snapToPreviewGrid(max - PREVIEW_SNAP_MINUTES);
  return Math.max(min, Math.min(next, last));
};

// "Bookings start every 15 minutes" - shown when a position is not a start
export const startRule = (
  interval: number = SALON_CONFIG.slotIntervalMinutes,
): string => `Bookings start every ${interval} minutes`;

// What a screen reader hears for the position under the cursor
export const describePreview = (
  p: SlotPreview,
  interval: number = SALON_CONFIG.slotIntervalMinutes,
): string => {
  const at = minutesToTimeString(p.start);
  switch (p.kind) {
    case "ok":
      return `${p.label}, available. Press Enter to choose ${p.time}.`;
    case "unavailable":
      return `${at}, not available. ${p.reason}.`;
    case "off-grid":
      return `${at}, not available. ${startRule(interval)}.`;
    case "outside":
      return `${at}, not available. Outside the times this service can be booked.`;
  }
};
