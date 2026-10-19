// dayGlance.ts
// The numbers behind the Today page's "Day at a glance" strip and the
// waitlist's "Offer slot": a summary of the day's service bookings and the
// next free opening across all stylists. Pure — no React or Firebase.

import { blocksSlot } from "./bookingStatus";
import {
  getSalonHoursForDate,
  getStylistHoursForDate,
  timeStringToMinutes,
} from "./scheduling";
import { computeDayRange, computeOpenSlots } from "./timelineLayout";
import type { Booking, SalonSettings, StylistWeeklyHours } from "../types";

export interface DaySummary {
  // Service bookings (customer + walk-in) still on the book
  total: number;
  done: number;
  inProgress: number;
  // Arrived and waiting in the salon, not yet started
  waiting: number;
}

// Breaks and training blocks aren't clients, and cancelled / no-show
// bookings no longer hold a chair — none of them count.
export const summariseDay = (dayBookings: Booking[]): DaySummary => {
  const service = dayBookings.filter(
    (b) =>
      (b.bookingType === "customer" || b.bookingType === "walkin") &&
      blocksSlot(b.status),
  );
  return {
    total: service.length,
    done: service.filter((b) => b.status === "completed").length,
    inProgress: service.filter((b) => b.status === "in_service").length,
    waiting: service.filter((b) => b.status === "arrived").length,
  };
};

export interface NextOpening {
  stylistId: string;
  stylistName: string;
  // Minutes from midnight
  start: number;
}

interface OpeningArgs {
  date: string;
  today: string;
  nowMinutes: number;
  stylists: {
    id: string;
    name: string;
    workingHours?: StylistWeeklyHours;
  }[];
  settings: SalonSettings;
  // Every booking loaded — filtered to `date` here
  bookings: Booking[];
  // Only look at this stylist (a waitlist request for a specific person)
  onlyStylistId?: string;
}

// The earliest free stretch (45+ minutes, the same rule as the timeline's
// "Open slot" buttons) on `date` across the stylists: the earliest wins, and
// on a tie the one listed first. Today it never returns a time already past.
export const findNextOpening = ({
  date,
  today,
  nowMinutes,
  stylists,
  settings,
  bookings,
  onlyStylistId,
}: OpeningArgs): NextOpening | null => {
  const dayBookings = bookings.filter((b) => b.date === date);
  const range = computeDayRange(
    getSalonHoursForDate(date, settings),
    dayBookings,
  );

  let best: NextOpening | null = null;
  for (const stylist of stylists) {
    if (onlyStylistId && onlyStylistId !== "any" && stylist.id !== onlyStylistId) {
      continue;
    }
    const occupied = dayBookings
      .filter((b) => b.stylistId === stylist.id && blocksSlot(b.status))
      .map((b) => {
        const start = timeStringToMinutes(b.time);
        return { start, end: start + b.totalTime };
      });
    const slots = computeOpenSlots({
      hours: getStylistHoursForDate(date, settings, stylist.workingHours),
      range,
      isPast: date < today,
      isToday: date === today,
      nowMinutes,
      occupied,
    });
    if (slots[0] && (!best || slots[0].start < best.start)) {
      best = {
        stylistId: stylist.id,
        stylistName: stylist.name,
        start: slots[0].start,
      };
    }
  }
  return best;
};
