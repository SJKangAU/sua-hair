// phases.ts
// Rules for a booking's service phases.
//
//   Apply       — activeTime: the stylist is hands-on with the client
//   Processing  — restTime: the client sits while the product sets and the
//                 stylist is free for someone else
//   Finish      — the stylist returns (Booking.returnTime) to finish the
//                 client. The booking model stores no separate finishing
//                 duration — totalTime is apply + processing — so Finish is
//                 shown as the marker where the booking ends, not a length.

export const STEP_MINUTES = 15;
export const MIN_ACTIVE_MINUTES = 5;
export const MAX_PHASE_MINUTES = 480; // 8 hours — sane upper bound

export interface Phases {
  activeTime: number;
  restTime: number;
}

// Which phase the −15 / +15 buttons adjust: processing when the booking has
// one (that's the part that varies most), otherwise apply.
export const steppedPhase = (phases: Phases): "restTime" | "activeTime" =>
  phases.restTime > 0 ? "restTime" : "activeTime";

// Returns null when the step would leave the allowed range.
export const stepPhases = (phases: Phases, delta: number): Phases | null => {
  const key = steppedPhase(phases);
  const next = { ...phases, [key]: phases[key] + delta };
  return validatePhases(next) === null ? next : null;
};

export const validatePhases = ({ activeTime, restTime }: Phases): string | null => {
  if (
    !Number.isFinite(activeTime) ||
    activeTime < MIN_ACTIVE_MINUTES ||
    activeTime > MAX_PHASE_MINUTES
  ) {
    return `Apply time must be between ${MIN_ACTIVE_MINUTES} and ${MAX_PHASE_MINUTES} minutes.`;
  }
  if (
    !Number.isFinite(restTime) ||
    restTime < 0 ||
    restTime > MAX_PHASE_MINUTES
  ) {
    return `Processing time must be between 0 and ${MAX_PHASE_MINUTES} minutes.`;
  }
  return null;
};
