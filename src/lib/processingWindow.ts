// processingWindow.ts
// The stretches of a booking where the stylist is FREE: its processing (rest) phases,
// which can hold another client's booking (a client with colour setting does not need
// the stylist). One place works out those windows and their wording, so the admin
// screens and the customer's booking flow say the same thing.
// Pure (minutes from midnight / "10:30 AM" strings), so it is unit-tested.

import { resolvePhases, segmentsFor, type Phase } from "./bookingPhases";
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

// Customer, before a time is chosen: what the processing time means
export const customerHint = (minutes: number): string =>
  `Includes ${minutes} min of setting time. Your stylist looks after another client while it sets, which is how we keep your visit short.`;

// Customer, with a time: when it happens and when they are back with the stylist
export const customerWindowSentence = (w: FreeWindow): string =>
  `Setting time ${w.from} – ${w.to} (${w.minutes} min). Your stylist looks after another client while it sets, and is back with you at ${w.to}.`;
