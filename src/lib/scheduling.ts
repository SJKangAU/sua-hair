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
import type {
  Booking,
  SlotBlock,
  TimeBlock,
  SalonSettings,
  StylistWeeklyHours,
} from "../types";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Get current time in minutes from midnight (consistent across all functions)
export const getCurrentMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert a time string like "10:30 AM" to minutes from midnight (e.g. 630)
export const timeStringToMinutes = (time: string): number => {
  const [rawTime, period] = time.split(" ");
  const [rawHours, minutes] = rawTime.split(":").map(Number);
  let hours = rawHours;
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

// Check if a given date string (YYYY-MM-DD) falls on a closed day.
// When salonSettings are provided, checks dateOverrides then weeklySchedule.
// Falls back to SALON_CONFIG when settings are absent (initial load, seed data).
export const isSalonClosed = (
  dateString: string,
  settings?: SalonSettings,
): boolean => {
  const date = parseLocalDate(dateString);

  if (settings) {
    // Date override takes priority
    const override = settings.dateOverrides[dateString];
    if (override?.closed) return true;
    if (
      override &&
      (override.open !== undefined || override.close !== undefined)
    ) {
      return false; // explicit open override
    }
    // Fall through to weekly schedule
    const dayKey = DAY_KEYS[date.getDay()];
    return !settings.weeklySchedule[dayKey].isOpen;
  }

  return SALON_CONFIG.closedDays.includes(date.getDay());
};

// Return the open/close hours for a date, respecting overrides.
// Returns null if the salon is closed that day.
export const getSalonHoursForDate = (
  dateString: string,
  settings?: SalonSettings,
): { open: number; close: number } | null => {
  if (!settings) {
    return SALON_CONFIG.tradingHours;
  }

  const override = settings.dateOverrides[dateString];
  if (override?.closed) return null;
  if (override?.open !== undefined && override?.close !== undefined) {
    return { open: override.open, close: override.close };
  }

  const date = parseLocalDate(dateString);
  const dayKey = DAY_KEYS[date.getDay()];
  const day = settings.weeklySchedule[dayKey];
  if (!day.isOpen) return null;
  return { open: day.open, close: day.close };
};

// Check if same-day booking cutoff has passed
// Uses minutes-based comparison for precision and consistency
export const isPastSameDayCutoff = (dateString: string): boolean => {
  if (dateString !== todayString()) return false;
  const currentMinutes = getCurrentMinutes();
  const cutoffMinutes = SALON_CONFIG.sameDayCutoffHour * 60;
  return currentMinutes >= cutoffMinutes;
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

// Compute the exact clock time a booking's rest/processing period ends —
// i.e. when the stylist returns to finish that client. Called once at
// booking creation and stored on the record (Booking.returnTime) so a later
// edit to a service's restTime never retroactively changes an existing
// booking's displayed return time.
export const computeReturnTime = (
  startTime: string,
  totalTimeMinutes: number,
): string =>
  minutesToTimeString(timeStringToMinutes(startTime) + totalTimeMinutes);

// Check whether overriding a single existing booking's active/rest time
// (a per-session quick-edit, distinct from editing the Service template in
// Manage → Services) would overlap another booking for the same stylist on
// the same date. The booking being resized is excluded from its own
// conflict check.
export const canResizeBooking = (
  booking: Booking,
  newActiveTime: number,
  newTotalTime: number,
  allBookings: SlotBlock[],
): boolean => {
  const startMinutes = timeStringToMinutes(booking.time);
  const otherBookings = allBookings.filter((b) => b.id !== booking.id);
  const timeBlocks = buildTimeBlocks(
    otherBookings,
    booking.stylistId,
    booking.date,
  );
  return isSlotAvailable(startMinutes, newTotalTime, newActiveTime, timeBlocks);
};

// ── Time Block Builder ─────────────────────────────────────────────────────────

// Convert existing bookings into TimeBlock objects for a specific stylist and date
export const buildTimeBlocks = (
  bookings: SlotBlock[],
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

// Generate all time slots for a given date and stylist.
// When salonSettings are provided, respects dynamic hours and date overrides.
// When stylistHours are provided, further constrains to per-stylist working hours.
export const generateSlots = (
  date: string,
  stylistId: string,
  serviceTotalTime: number,
  serviceActiveTime: number,
  existingBookings: SlotBlock[],
  settings?: SalonSettings,
  stylistHours?: StylistWeeklyHours,
): { time: string; available: boolean; reason?: string }[] => {
  const slots: { time: string; available: boolean; reason?: string }[] = [];

  // Resolve effective hours: date override → weekly schedule → SALON_CONFIG
  const salonHours = getSalonHoursForDate(date, settings);
  if (!salonHours) return []; // salon is closed this day

  // Constrain to stylist's working hours if provided
  let { open, close } = salonHours;
  if (stylistHours) {
    const dayKey = DAY_KEYS[parseLocalDate(date).getDay()];
    const stylistDay = stylistHours[dayKey];
    if (!stylistDay.isWorking) return [];
    open = Math.max(open, stylistDay.start);
    close = Math.min(close, stylistDay.end);
    if (open >= close) return [];
  }

  const interval = SALON_CONFIG.slotIntervalMinutes;
  const openMinutes = open * 60;
  const closeMinutes = close * 60;

  const timeBlocks = buildTimeBlocks(existingBookings, stylistId, date);

  const currentMinutes = getCurrentMinutes();
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
