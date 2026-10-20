// phaseFields.ts
// The booking fields that follow from a booking's phases and start time, so every
// write path (customer booking, walk-in, per-booking edit, reschedule) stores the
// same, consistent set: its own phases (DEC-012 style), the phases placed on the
// day as absolute segments, the legacy totals every older view still reads, and
// the clock time the stylist first returns to the client.

import {
  phaseTotals,
  segmentsFor,
  type Phase,
  type Segment,
} from "./bookingPhases";
import { minutesToTimeString, timeStringToMinutes } from "./scheduling";

export interface PhaseWriteFields {
  phases: Phase[];
  segments: Segment[];
  activeTime: number;
  restTime: number;
  totalTime: number;
  // Only when the booking has a processing gap: when the stylist is due back
  returnTime?: string;
}

export const phaseWriteFields = (
  time: string,
  phases: readonly Phase[],
): PhaseWriteFields => {
  const segments = segmentsFor(timeStringToMinutes(time), phases);
  const firstRest = segments.find((s) => s.type === "rest");
  return {
    phases: phases.map((p) => ({ ...p })),
    segments,
    ...phaseTotals(phases),
    ...(firstRest ? { returnTime: minutesToTimeString(firstRest.end) } : {}),
  };
};
