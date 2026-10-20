// phaseEdit.ts
// Changing the phase lengths of ONE booking (the owner's "make the processing
// 15 minutes longer" in the booking panel, or the sizes chosen at creation).
// Pure: decides whether an edit is allowed and what it would produce; the write
// itself runs in a transaction with the conflict check (adminBookingWrites.ts).
//
// The service's own defaults are never touched: an edit produces a new list of
// phases for this booking only. A change moves everything after it, because
// phases are sequential: longer processing pushes the return later, shorter
// pulls it earlier, longer hands-on pushes later phases back.

import {
  PHASE_STEP_MINUTES,
  footprintFor,
  phaseTotals,
  segmentsFor,
  validateBookingPhases,
  type Phase,
  type Segment,
} from "./bookingPhases";
import { findBookingConflict, minutesToTimeString, timeStringToMinutes } from "./scheduling";
import type { SlotBlock } from "../types";

export interface EditTarget {
  id: string;
  stylistId: string;
  date: string;
  time: string; // start, "10:00 AM"
}

export type PhaseEditResult<T extends SlotBlock = SlotBlock> =
  | {
      ok: true;
      phases: Phase[];
      segments: Segment[];
      activeTime: number;
      restTime: number;
      totalTime: number;
      endsAt: number; // minutes from midnight - show it live
      endsAtLabel: string; // "12:15 PM"
    }
  | { ok: false; reason: "invalid"; message: string }
  | {
      ok: false;
      reason: "conflict";
      message: string;
      conflict: T;
      // The smallest change that would make it fit: the same edit with one
      // processing phase made longer so the return moves to the next free time
      suggestion: Phase[] | null;
    };

// The smallest extension of a processing phase (15 minutes at a time) that makes
// `phases` free of conflicts, or null if none fits before closing.
export const nextFreeReturn = <T extends SlotBlock>(
  target: EditTarget,
  phases: readonly Phase[],
  existing: T[],
  closeMinutes: number | null,
): Phase[] | null => {
  const start = timeStringToMinutes(target.time);
  let best: Phase[] | null = null;
  let bestExtra = Infinity;
  phases.forEach((p, i) => {
    if (p.type !== "rest") return;
    for (let extra = PHASE_STEP_MINUTES; extra <= 480; extra += PHASE_STEP_MINUTES) {
      if (extra >= bestExtra) return;
      const next = phases.map((q, j) => (j === i ? { ...q, minutes: q.minutes + extra } : { ...q }));
      if (validateBookingPhases(next, start, closeMinutes) !== null) return; // closing: longer only gets worse
      const t = phaseTotals(next);
      const clash = findBookingConflict(
        {
          stylistId: target.stylistId,
          date: target.date,
          time: target.time,
          totalTime: t.totalTime,
          activeTime: t.activeTime,
          phases: next,
          excludeId: target.id,
        },
        existing,
      );
      if (!clash) {
        best = next;
        bestExtra = extra;
        return;
      }
    }
  });
  return best;
};

export const planPhaseEdit = <T extends SlotBlock>(
  target: EditTarget,
  newPhases: readonly Phase[],
  existing: T[],
  closeMinutes: number | null,
  describe: (b: T) => string,
): PhaseEditResult<T> => {
  const start = timeStringToMinutes(target.time);
  const invalid = validateBookingPhases(newPhases, start, closeMinutes);
  if (invalid) return { ok: false, reason: "invalid", message: invalid };

  const t = phaseTotals(newPhases);
  const clash = findBookingConflict(
    {
      stylistId: target.stylistId,
      date: target.date,
      time: target.time,
      totalTime: t.totalTime,
      activeTime: t.activeTime,
      phases: [...newPhases],
      excludeId: target.id,
    },
    existing,
  );
  if (clash) {
    return {
      ok: false,
      reason: "conflict",
      message: `That would collide with ${describe(clash)}.`,
      conflict: clash,
      suggestion: nextFreeReturn(target, newPhases, existing, closeMinutes),
    };
  }

  const segments = segmentsFor(start, newPhases);
  const endsAt = footprintFor(start, newPhases).end;
  return {
    ok: true,
    phases: newPhases.map((p) => ({ ...p })),
    segments,
    ...t,
    endsAt,
    endsAtLabel: minutesToTimeString(endsAt),
  };
};
