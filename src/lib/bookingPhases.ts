// bookingPhases.ts
// The phase model behind every booking and every availability check.
//
// A booking is an ordered list of PHASES:
//   active  the stylist is hands-on with this client            -> BUSY
//   rest    the client is processing / setting; the stylist is   -> a GAP other
//           free                                                    bookings may use
// e.g. Digital perm = active 60, rest 30, active 30: after the processing gap
// the stylist returns to the same client, and that return block stays blocked.
//
// Only busy (active) segments can conflict. A booking that ENDS in a rest phase
// (every legacy "active + rest" booking, e.g. a colour) also carries a RETURN
// POINT - the moment the stylist is due back to finish the client. No other
// booking's busy block may straddle that moment (DEC-026), which is exactly how
// today's rule protected it.
//
// Everything is in minutes from midnight (DEC-006). Pure: no Firebase, no React.

import type { Phase, PhaseType } from "../types";

export type { Phase, PhaseType };

export interface Segment {
  type: PhaseType;
  start: number;
  end: number;
}

export interface BusyBlock {
  start: number;
  end: number;
}

// What a booking occupies on the day: its busy blocks and, if it ends in a rest
// phase, the minute its stylist is due back. `end` is when the booking is over.
export interface Footprint {
  busy: BusyBlock[];
  returnAt: number | null;
  start: number;
  end: number;
}

export const PHASE_STEP_MINUTES = 15;
export const MIN_ACTIVE_PHASE_MINUTES = 15;
export const MAX_PHASE_MINUTES = 480;

// ── Building phases ──────────────────────────────────────────────────────────

// A legacy booking / service: hands-on time then (optional) processing time.
// `totalTime`, when given, is the authority for how long the booking lasts - the
// engine has always blocked the whole total for a booking with no processing
// time (a break, say), and measured the processing gap as total - active.
export const phasesFromLegacy = (
  activeTime: number,
  restTime: number,
  totalTime: number = activeTime + restTime,
): Phase[] => {
  if (restTime > 0) {
    const rest = Math.max(0, totalTime - activeTime);
    return [
      ...(activeTime > 0 ? [{ type: "active" as const, minutes: activeTime }] : []),
      ...(rest > 0 ? [{ type: "rest" as const, minutes: rest }] : []),
    ];
  }
  return totalTime > 0 ? [{ type: "active", minutes: totalTime }] : [];
};

interface PhaseSource {
  phases?: readonly Phase[] | null;
  activeTime: number;
  restTime: number;
  totalTime?: number;
}

// The phases of a booking or service: its own, or derived from the legacy
// activeTime / restTime so existing data behaves exactly as before.
export const resolvePhases = (src: PhaseSource): Phase[] =>
  src.phases && src.phases.length > 0
    ? src.phases.map((p) => ({ ...p }))
    : phasesFromLegacy(src.activeTime, src.restTime, src.totalTime);

// What the engine sees: zero-length phases dropped, neighbours of the same type
// merged. (Stored phases may keep a zero-minute rest so the owner can set
// processing back later; the engine ignores it.)
export const effectivePhases = (phases: readonly Phase[]): Phase[] => {
  const out: Phase[] = [];
  for (const p of phases) {
    if (!(p.minutes > 0)) continue;
    const last = out[out.length - 1];
    if (last && last.type === p.type) last.minutes += p.minutes;
    else out.push({ ...p });
  }
  return out;
};

export const phaseTotals = (phases: readonly Phase[]) => {
  let activeTime = 0;
  let restTime = 0;
  for (const p of phases) {
    if (p.type === "active") activeTime += p.minutes;
    else restTime += p.minutes;
  }
  return { activeTime, restTime, totalTime: activeTime + restTime };
};

// Several services in one booking. Services shaped like today's (hands-on, then
// optional processing) combine exactly as before: all hands-on time first, then
// all processing. If any service has a phase after its processing (a return),
// the services are laid end to end in the order chosen.
export const combinePhases = (list: readonly PhaseSource[]): Phase[] => {
  const resolved = list.map((s) => effectivePhases(resolvePhases(s)));
  const legacyShaped = resolved.every(
    (ph) =>
      ph.length <= 2 &&
      ph.every((p, i) => (i === 0 ? true : p.type === "rest")) &&
      !(ph.length === 2 && ph[0].type === "rest"),
  );
  if (legacyShaped) {
    const t = phaseTotals(resolved.flat());
    return phasesFromLegacy(t.activeTime, t.restTime);
  }
  return effectivePhases(resolved.flat());
};

// ── Placing phases on the day ────────────────────────────────────────────────

export const segmentsFor = (
  startMinutes: number,
  phases: readonly Phase[],
): Segment[] => {
  const out: Segment[] = [];
  let at = startMinutes;
  for (const p of effectivePhases(phases)) {
    out.push({ type: p.type, start: at, end: at + p.minutes });
    at += p.minutes;
  }
  return out;
};

export const busyOf = (segments: readonly Segment[]): BusyBlock[] =>
  segments
    .filter((s) => s.type === "active")
    .map((s) => ({ start: s.start, end: s.end }));

export const returnAtOf = (segments: readonly Segment[]): number | null => {
  const last = segments[segments.length - 1];
  return last && last.type === "rest" ? last.end : null;
};

export const footprintFor = (
  startMinutes: number,
  phases: readonly Phase[],
): Footprint => {
  const segs = segmentsFor(startMinutes, phases);
  return {
    busy: busyOf(segs),
    returnAt: returnAtOf(segs),
    start: startMinutes,
    end: segs.length > 0 ? segs[segs.length - 1].end : startMinutes,
  };
};

// ── Conflicts ────────────────────────────────────────────────────────────────

const overlaps = (a: BusyBlock, b: BusyBlock): boolean =>
  a.start < b.end && b.start < a.end;

const strictlyInside = (point: number, b: BusyBlock): boolean =>
  b.start < point && point < b.end;

// Two bookings for the same stylist conflict if any of their busy blocks
// overlap, or if one's return point falls inside the other's busy block (the
// stylist would be mid-service when due back). Rest gaps never conflict.
export const footprintsConflict = (a: Footprint, b: Footprint): boolean => {
  for (const x of a.busy) {
    for (const y of b.busy) if (overlaps(x, y)) return true;
  }
  if (a.returnAt !== null && b.busy.some((y) => strictlyInside(a.returnAt as number, y))) {
    return true;
  }
  if (b.returnAt !== null && a.busy.some((x) => strictlyInside(b.returnAt as number, x))) {
    return true;
  }
  return false;
};

// ── Validating an owner's per-booking edit ───────────────────────────────────

// `current` is what the booking has now: a phase left exactly as it is is never
// re-judged, so older bookings whose lengths are not multiples of 15 (a 20-minute
// beard trim) can still have one other phase edited.
export const validateBookingPhases = (
  phases: readonly Phase[],
  startMinutes: number,
  closeMinutes: number | null,
  current: readonly Phase[] = [],
): string | null => {
  if (!phases.some((p) => p.type === "active")) {
    return "A booking needs at least one hands-on phase.";
  }
  for (const [i, p] of phases.entries()) {
    const untouched = current[i]?.type === p.type && current[i]?.minutes === p.minutes;
    if (untouched) continue;
    if (!Number.isFinite(p.minutes) || p.minutes % PHASE_STEP_MINUTES !== 0) {
      return `Phases change in ${PHASE_STEP_MINUTES}-minute steps.`;
    }
    if (p.minutes > MAX_PHASE_MINUTES) {
      return `A phase can be at most ${MAX_PHASE_MINUTES} minutes.`;
    }
    if (p.type === "active" && p.minutes < MIN_ACTIVE_PHASE_MINUTES) {
      return `A hands-on phase must be at least ${MIN_ACTIVE_PHASE_MINUTES} minutes.`;
    }
    if (p.type === "rest" && p.minutes < 0) {
      return "Processing time cannot be negative.";
    }
  }
  const end = footprintFor(startMinutes, phases).end;
  if (closeMinutes !== null && end > closeMinutes) {
    return "That would run past closing time.";
  }
  return null;
};

// Change one phase's length; later phases move with it (they are sequential).
export const withPhaseMinutes = (
  phases: readonly Phase[],
  index: number,
  minutes: number,
): Phase[] => phases.map((p, i) => (i === index ? { ...p, minutes } : { ...p }));

// What to call each phase in the UI: hands-on before any processing, then
// "processing", then "return" (hands-on after a processing gap).
export const phaseLabels = (phases: readonly Phase[]): string[] => {
  let seenRest = false;
  let handsOn = 0;
  return phases.map((p) => {
    if (p.type === "rest") {
      seenRest = true;
      return "Processing";
    }
    if (seenRest) return "Return";
    handsOn += 1;
    return handsOn > 1 ? `Hands-on ${handsOn}` : "Hands-on";
  });
};

// "30 active + 30 setting" for today's two-phase services (wording unchanged);
// "60 hands-on + 30 processing + 30 return" once a service has more phases.
// Empty when there is nothing past the hands-on time to describe.
export const describePhases = (phases: readonly Phase[]): string => {
  const eff = effectivePhases(phases);
  if (eff.length <= 1) return "";
  if (eff.length === 2 && eff[0].type === "active" && eff[1].type === "rest") {
    return `${eff[0].minutes} active + ${eff[1].minutes} setting`;
  }
  const names = phaseLabels(eff);
  return eff.map((p, i) => `${p.minutes} ${names[i].toLowerCase()}`).join(" + ");
};
