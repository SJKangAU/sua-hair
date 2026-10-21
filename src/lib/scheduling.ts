// scheduling.ts
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULING ENGINE FOR SUA HAIR
// ─────────────────────────────────────────────────────────────────────────────
// Handles all time slot logic including:
//   - Generating available time slots for a given date
//   - Checking stylist availability from each booking's BUSY blocks (DEC-026):
//     only hands-on (active) phases block the stylist; processing (rest) phases
//     are gaps other bookings may use, and a booking that ends in processing
//     keeps its return moment free (see bookingPhases.ts)
//   - Blocking slots that are too soon or outside trading hours
// ─────────────────────────────────────────────────────────────────────────────

import { SALON_CONFIG } from "./config";
import { todayString, parseLocalDate } from "./dates";
import { businessNowMinutes } from "./businessTime";
import { blocksSlot } from "./bookingStatus";
import {
  footprintFor,
  footprintsConflict,
  phasesFromLegacy,
  resolvePhases,
  type Footprint,
} from "./bookingPhases";
import type {
  Booking,
  Phase,
  SlotBlock,
  TimeBlock,
  SalonSettings,
  StylistWeeklyHours,
} from "../types";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Get the current time at the salon in minutes from midnight (consistent across
// all functions). Melbourne's clock, not the browser's (businessTime.ts, DEC-034).
export const getCurrentMinutes = (): number => businessNowMinutes();

// With allowBookingsDuringRestPeriod off, processing time blocks the stylist
// like hands-on time does
const applyRestPolicy = (fp: Footprint): Footprint =>
  SALON_CONFIG.allowBookingsDuringRestPeriod
    ? fp
    : { ...fp, busy: [{ start: fp.start, end: fp.end }], returnAt: null };

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

// The hours a stylist can be booked on a date: the salon's hours for that
// date (override-aware) narrowed to the stylist's own working hours. Returns
// null when the salon is closed, the stylist is off that day, or their hours
// don't overlap the salon's. Without `workingHours` a stylist keeps the full
// salon hours.
export const getStylistHoursForDate = (
  dateString: string,
  settings?: SalonSettings,
  workingHours?: StylistWeeklyHours,
): { open: number; close: number } | null => {
  const salonHours = getSalonHoursForDate(dateString, settings);
  if (!salonHours) return null;
  if (!workingHours) return salonHours;

  const day = workingHours[DAY_KEYS[parseLocalDate(dateString).getDay()]];
  if (!day?.isWorking) return null;
  const open = Math.max(salonHours.open, day.start);
  const close = Math.min(salonHours.close, day.end);
  return open < close ? { open, close } : null;
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

// What an existing booking (or its public slotBlocks projection) occupies:
// the projection's own busy blocks if it has them, else the booking's phases,
// else its legacy active / rest time - so records made before phases existed
// behave exactly as they always did.
export const slotFootprint = (
  b: Pick<SlotBlock, "time" | "activeTime" | "restTime" | "totalTime"> & {
    phases?: Phase[];
    busy?: { start: number; end: number }[];
    returnAt?: number | null;
  },
): Footprint => {
  const start = timeStringToMinutes(b.time);
  if (b.busy) {
    return applyRestPolicy({
      busy: b.busy,
      returnAt: b.returnAt ?? null,
      start,
      end: start + b.totalTime,
    });
  }
  return applyRestPolicy(footprintFor(start, resolvePhases(b)));
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
        blocksSlot(b.status),
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

// ── Conflict detection for admin-created bookings ─────────────────────────────

// The proposed booking being checked. `excludeId` lets a booking being moved
// or resized ignore its own existing record.
export interface ConflictProbe {
  stylistId: string;
  date: string;
  time: string;
  totalTime: number;
  activeTime: number;
  // The booking's phases when it has more than hands-on + processing; else they
  // are derived from activeTime / totalTime
  phases?: Phase[];
  excludeId?: string;
}

// Returns the first existing booking that blocks the probe, or null if the
// slot is free. Uses exactly the customer flow's rules (busy blocks only, plus
// the return point - see bookingPhases.ts): cancelled and no-show bookings never
// block, and a probe whose hands-on blocks all miss the other booking's hands-on
// blocks may use its processing gaps. Breaks and training blocks are ordinary
// bookings with no rest time, so they block like any other.
export const findBookingConflict = <T extends SlotBlock>(
  probe: ConflictProbe,
  existing: T[],
): T | null => {
  const candidate = applyRestPolicy(
    footprintFor(
      timeStringToMinutes(probe.time),
      resolvePhases({
        phases: probe.phases,
        activeTime: probe.activeTime,
        restTime: probe.totalTime - probe.activeTime,
        totalTime: probe.totalTime,
      }),
    ),
  );
  for (const b of existing) {
    if (b.id === probe.excludeId) continue;
    if (b.stylistId !== probe.stylistId || b.date !== probe.date) continue;
    if (!blocksSlot(b.status)) continue;
    if (footprintsConflict(candidate, slotFootprint(b))) return b;
  }
  return null;
};

// Plain-language description of a blocking booking for an inline message,
// e.g. "Jane Smith (Cut + Colour), 10:00 AM – 11:30 AM".
export const describeConflict = (b: Booking): string => {
  const what =
    b.bookingType === "break"
      ? `a break${b.blockReason ? ` (${b.blockReason})` : ""}`
      : b.bookingType === "training"
      ? `a training session${b.trainingTopic ? ` (${b.trainingTopic})` : ""}`
      : `${b.customerName || "a client"}${
          b.serviceName ? ` (${b.serviceName})` : ""
        }`;
  const end = minutesToTimeString(timeStringToMinutes(b.time) + b.totalTime);
  return `${what}, ${b.time} – ${end}`;
};

// Human-readable booking reference stored in Booking.bookingRef, e.g.
// WI-20260805-stylist-1-1030. It is a label only — document IDs are always
// auto-generated so two bookings can never overwrite each other.
export const buildBookingRef = (
  prefix: string,
  date: string,
  stylistId: string,
  time: string,
): string => {
  const minutes = timeStringToMinutes(time);
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}${String(
    minutes % 60,
  ).padStart(2, "0")}`;
  return `${prefix}-${date.replace(/-/g, "")}-${stylistId}-${hhmm}`;
};

// ── Core Availability Check ───────────────────────────────────────────────────

// Check if a stylist can take a new booking at a given start time.
// Only hands-on time blocks the stylist: a new client may use another booking's
// processing gap as long as none of the new hands-on time touches the other's
// hands-on time or straddles the moment the stylist is due back.
export const isSlotAvailable = (
  slotStartMinutes: number,
  newServiceTotalTime: number,
  newServiceActiveTime: number,
  timeBlocks: TimeBlock[],
): boolean => {
  const candidate = applyRestPolicy(
    footprintFor(
      slotStartMinutes,
      phasesFromLegacy(
        newServiceActiveTime,
        newServiceTotalTime - newServiceActiveTime,
        newServiceTotalTime,
      ),
    ),
  );
  return !timeBlocks.some((block) =>
    footprintsConflict(
      candidate,
      applyRestPolicy({
        busy: [{ start: block.startMinutes, end: block.activeEndMinutes }],
        returnAt: block.isRestPeriod ? block.totalEndMinutes : null,
        start: block.startMinutes,
        end: block.totalEndMinutes,
      }),
    ),
  );
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
  // The booking's phases when it has more than hands-on + processing
  // (DEC-026); otherwise derived from the two totals above
  phases?: Phase[],
): { time: string; available: boolean; reason?: string }[] => {
  const slots: { time: string; available: boolean; reason?: string }[] = [];

  // Effective hours: date override → weekly schedule → SALON_CONFIG, then
  // narrowed to the stylist's own working hours if provided
  const hours = getStylistHoursForDate(date, settings, stylistHours);
  if (!hours) return []; // salon closed, or the stylist is off, this day
  const { open, close } = hours;

  const interval = SALON_CONFIG.slotIntervalMinutes;
  const openMinutes = open * 60;
  const closeMinutes = close * 60;

  const existing = existingBookings
    .filter(
      (b) => b.stylistId === stylistId && b.date === date && blocksSlot(b.status),
    )
    .map((b) => slotFootprint(b));
  const candidatePhases = resolvePhases({
    phases,
    activeTime: serviceActiveTime,
    restTime: serviceTotalTime - serviceActiveTime,
    totalTime: serviceTotalTime,
  });

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

    const candidate = applyRestPolicy(footprintFor(start, candidatePhases));
    const available = !existing.some((e) => footprintsConflict(candidate, e));
    slots.push({
      time: timeString,
      available,
      reason: available ? undefined : "Stylist unavailable",
    });
  }

  return slots;
};
