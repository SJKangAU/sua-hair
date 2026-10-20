// phaseResize.ts
// Dragging the bottom edge of one phase on the admin timeline. Pure: turns a
// pointer position into the booking's new phase list. Whether that list is
// allowed (closing time, other clients, the 15-minute steps) is decided by
// planPhaseEdit - the same check, and the same messages, as the booking panel.
//
// Phases run one after another, so changing one moves everything after it:
// lengthen the processing and the return starts later; shorten the first
// hands-on phase and the rest start earlier.

import {
  MAX_PHASE_MINUTES,
  MIN_ACTIVE_PHASE_MINUTES,
  PHASE_STEP_MINUTES,
  effectivePhases,
  resolvePhases,
} from "./bookingPhases";
import { timeStringToMinutes } from "./scheduling";
import type { Booking, Phase } from "../types";

export interface EdgeDrag {
  // The booking's phases as drawn (zero-length ones dropped, same-type
  // neighbours merged), so an index here is an index of what is on screen
  phases: Phase[];
  // Where each phase starts, minutes from midnight
  starts: number[];
}

export const drawnPhases = (
  booking: Pick<Booking, "time" | "phases" | "activeTime" | "restTime" | "totalTime">,
): EdgeDrag => {
  const phases = effectivePhases(resolvePhases(booking));
  let cursor = timeStringToMinutes(booking.time);
  const starts = phases.map((p) => {
    const s = cursor;
    cursor += p.minutes;
    return s;
  });
  return { phases, starts };
};

// The booking's phases once the bottom edge of phase `index` is dragged to
// `pointerMinutes`. Snapped to 15 minutes; a hands-on phase never goes below
// 15, a processing phase can go to 0 (the clients then meet no gap at all).
export const phasesAfterEdgeDrag = (
  drawn: EdgeDrag,
  index: number,
  pointerMinutes: number,
): Phase[] | null => {
  const phase = drawn.phases[index];
  if (!phase) return null;
  const snapped = Math.round(pointerMinutes / PHASE_STEP_MINUTES) * PHASE_STEP_MINUTES;
  const min = phase.type === "active" ? MIN_ACTIVE_PHASE_MINUTES : 0;
  const minutes = Math.max(min, Math.min(MAX_PHASE_MINUTES, snapped - drawn.starts[index]));
  return drawn.phases.map((p, i) => (i === index ? { ...p, minutes } : { ...p }));
};

// Where the drawn edge of phase `index` sits for a phase list
export const edgeOf = (drawn: EdgeDrag, index: number, phases: Phase[]): number =>
  drawn.starts[index] + (phases[index]?.minutes ?? 0);
