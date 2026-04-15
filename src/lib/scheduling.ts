// scheduling.ts
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULING ENGINE FOR SUA HAIR
// ─────────────────────────────────────────────────────────────────────────────
// Handles all time slot logic including:
//   - Generating available time slots for a given date
//   - Checking stylist availability accounting for rest periods
//   - Blocking slots that are too soon or outside trading hours
//   - Allowing bookings during rest periods if the service fits
// ─────────────────────────────────────────────────────────────────────────────

import { SALON_CONFIG } from "./config";
import { todayString, parseLocalDate } from "./dates";
import type { Booking, TimeBlock } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert a time string like "10:30 AM" to minutes from midnight (e.g. 630)
export const timeStringToMinutes = (time: string): number => {
  const [rawTime, period] = time.split(" ");
  let [hours, minutes] = rawTime.split(":").map(Number);
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

// Convert minutes from midnight back to a readable time string (e.g. 630 → "10:30 AM")
export const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
};

// Check if a given date string (YYYY-MM-DD) falls on a closed day
export const isSalonClosed = (dateString: string): boolean => {
  const date = parseLocalDate(dateString);
  return SALON_CONFIG.closedDays.includes(date.getDay());
};

// Check if same-day booking cutoff has passed
export const isPastSameDayCutoff = (dateString: string): boolean => {
  if (dateString !== todayString()) return false;
  return new Date().getHours() >= SALON_CONFIG.sameDayCutoffHour;
};

// Get the minimum bookable date (today, or tomorrow if past cutoff)
export const getMinBookableDate = (): string => {
  const today = todayString();
  if (isPastSameDayCutoff(today)) {
    const tomorrow = parseLocalDate(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return today;
};

// ── Time Block Builder ─────────────────────────────────────────────────────────

// Convert existing bookings into TimeBlock objects for a specific stylist and date
export const buildTimeBlocks = (
  bookings: Booking[],
  stylistId: string,
  date: string,
): TimeBlock[] => {
  return bookings
    .filter(
      (b) =>
        b.stylistId === stylistId &&
        b.date === date &&
        b.status !== "cancelled",
    )
    .map((b) => {
      const startMinutes = timeStringToMinutes(b.time);
      return {
        stylistId,
        date,
        startMinutes,
        activeEndMinutes: startMinutes + b.activeTime,
        totalEndMinutes: startMinutes + b.totalTime,
        isRestPeriod: b.restTime > 0,
      };
    });
};

// ── Core Availability Check ───────────────────────────────────────────────────

// Check if a stylist can take a new booking at a given start time
// Accounts for rest periods — stylist CAN take a new client during rest
// if the new service's totalTime fits within the remaining rest window
export const isSlotAvailable = (
  slotStartMinutes: number,
  newServiceTotalTime: number,
  newServiceActiveTime: number,
  timeBlocks: TimeBlock[],
): boolean => {
  const slotEndMinutes = slotStartMinutes + newServiceTotalTime;

  for (const block of timeBlocks) {
    const overlaps =
      slotStartMinutes < block.totalEndMinutes &&
      slotEndMinutes > block.startMinutes;

    if (!overlaps) continue;

    if (SALON_CONFIG.allowBookingsDuringRestPeriod && block.isRestPeriod) {
      const stylistFreeFrom = block.activeEndMinutes;
      const stylistFreeUntil = block.totalEndMinutes;
      const newActiveEnd = slotStartMinutes + newServiceActiveTime;

      const fitsInRestPeriod =
        slotStartMinutes >= stylistFreeFrom && newActiveEnd <= stylistFreeUntil;

      if (fitsInRestPeriod) continue;
    }

    return false;
  }

  return true;
};

// ── Main Slot Generator ───────────────────────────────────────────────────────

// Generate all time slots for a given date and stylist
// Returns each slot with availability status and reason if unavailable
export const generateSlots = (
  date: string,
  stylistId: string,
  serviceTotalTime: number,
  serviceActiveTime: number,
  existingBookings: Booking[],
): { time: string; available: boolean; reason?: string }[] => {
  const slots: { time: string; available: boolean; reason?: string }[] = [];

  const { open, close } = SALON_CONFIG.tradingHours;
  const interval = SALON_CONFIG.slotIntervalMinutes;
  const openMinutes = open * 60;
  const closeMinutes = close * 60;

  const timeBlocks = buildTimeBlocks(existingBookings, stylistId, date);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = date === todayString();
  const minimumNoticeMin = SALON_CONFIG.minimumNoticeHours * 60;

  for (
    let start = openMinutes;
    start + serviceTotalTime <= closeMinutes;
    start += interval
  ) {
    const timeString = minutesToTimeString(start);

    if (isToday && start < currentMinutes + minimumNoticeMin) {
      slots.push({ time: timeString, available: false, reason: "Too soon" });
      continue;
    }

    const available = isSlotAvailable(
      start,
      serviceTotalTime,
      serviceActiveTime,
      timeBlocks,
    );
    slots.push({
      time: timeString,
      available,
      reason: available ? undefined : "Stylist unavailable",
    });
  }

  return slots;
};
