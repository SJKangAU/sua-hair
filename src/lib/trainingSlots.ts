// trainingSlots.ts
// Start times offered for an after-hours training session: any half hour from EARLIEST to LATEST
// that is outside the salon's trading hours for that date (Manage -> Opening Hours, including
// date overrides). Before opening, the session must finish by opening time; after closing, it
// may start at closing time. A day the salon is closed offers the whole range. Pure.

import { getSalonHoursForDate, minutesToTimeString } from "./scheduling";
import type { SalonSettings } from "../types";

const EARLIEST = 7 * 60;
const LATEST = 21 * 60;
const STEP = 30;

export const trainingSlots = (
  date: string,
  settings: SalonSettings,
  durationMinutes: number,
): string[] => {
  const hours = getSalonHoursForDate(date, settings);
  const out: string[] = [];
  for (let m = EARLIEST; m <= LATEST; m += STEP) {
    const free =
      hours === null ||
      m + durationMinutes <= hours.open * 60 ||
      m >= hours.close * 60;
    if (free) out.push(minutesToTimeString(m));
  }
  return out;
};
