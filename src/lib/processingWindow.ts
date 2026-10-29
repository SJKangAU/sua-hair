// processingWindow.ts
// The stretches of a booking where the stylist is FREE: its processing (rest) phases,
// which can hold another client's booking (a client with colour setting does not need
// the stylist). One place works out those windows and the admin wording. The customer is
// told only how long the visit takes (durationSentence), never what the salon does with the
// stylist's time.
// Pure (minutes from midnight / "10:30 AM" strings), so it is unit-tested.

import { effectivePhases, resolvePhases, segmentsFor, type Phase } from "./bookingPhases";
import { minutesToTimeString, timeStringToMinutes } from "./scheduling";

export interface FreeWindow {
  start: number; // minutes from midnight
  end: number;
  from: string; // "10:30 AM"
  to: string; // "11:00 AM"
  minutes: number;
}

// Every processing phase of a booking that starts at `time`, as a clock window
export const freeWindows = (time: string, phases: readonly Phase[]): FreeWindow[] => {
  const start = timeStringToMinutes(time);
  if (!Number.isFinite(start)) return [];
  return segmentsFor(start, phases)
    .filter((s) => s.type === "rest" && s.end > s.start)
    .map((s) => ({
      start: s.start,
      end: s.end,
      from: minutesToTimeString(s.start),
      to: minutesToTimeString(s.end),
      minutes: s.end - s.start,
    }));
};

// The same for a booking or service record (its own phases, or derived from active / rest time)
export const bookingFreeWindows = (b: {
  time: string;
  phases?: readonly Phase[] | null;
  activeTime: number;
  restTime: number;
  totalTime?: number;
}): FreeWindow[] => freeWindows(b.time, resolvePhases(b));

// Admin: "Stylist free 10:30 AM – 11:00 AM (30 min)"
export const freeWindowLabel = (w: FreeWindow): string =>
  `Stylist free ${w.from} – ${w.to} (${w.minutes} min)`;

// Admin, longer: the sentence in the booking drawer
export const freeWindowSentence = (w: FreeWindow): string =>
  `Processing ${w.from} – ${w.to}. The stylist is free to take another client in these ${w.minutes} minutes.`;

// ── What the CUSTOMER is told ────────────────────────────────────────────────
// Only how long the visit takes (and how much of it is setting time). Nothing about what the
// salon does with the stylist's time while the product sets: that is for the admin screens.

// 45 -> "45 min", 60 -> "1 hr", 90 -> "1 hr 30 min"
export const formatDuration = (minutes: number): string => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} hr` : `${h} hr ${r} min`;
};

// "Allow 1 hr 30 min in all, including 30 min of setting time. You'll be finished around 11:30 AM."
// Empty when the time is unreadable or there are no phases.
export const durationSentence = (time: string, phases: readonly Phase[]): string => {
  const start = timeStringToMinutes(time);
  const eff = effectivePhases(phases);
  const total = eff.reduce((n, p) => n + p.minutes, 0);
  if (!Number.isFinite(start) || total <= 0) return "";
  const setting = eff.filter((p) => p.type === "rest").reduce((n, p) => n + p.minutes, 0);
  return (
    `Allow ${formatDuration(total)} in all` +
    (setting > 0 ? `, including ${formatDuration(setting)} of setting time` : "") +
    `. You'll be finished around ${minutesToTimeString(start + total)}.`
  );
};
