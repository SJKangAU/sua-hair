// suggestions.ts
// Text-message helpers for the Today page rail: suggesting another time to a
// client whose requested booking can't be approved as-is, and offering a free
// slot to someone on the waitlist. The app has no messaging backend, so these
// build an sms: link that opens the owner's own messaging app with the text
// filled in — nothing is sent until they press send there.

import { findBookingConflict, minutesToTimeString, timeStringToMinutes } from "./scheduling";
import { formatWhen } from "./bookingHistory";
import { SNAP_MINUTES } from "./timelineLayout";
import type { Booking } from "../types";

export const firstNameOf = (fullName: string): string =>
  fullName.trim().split(/\s+/)[0] || "there";

// The start time (minutes from midnight) closest to the one asked for where
// the same stylist is free for the whole booking, on the same day, within the
// stylist's hours — using the same overlap rules as every other booking check.
// Null if nothing fits. Never suggests the requested time itself, and never a
// time that has already passed today.
export const suggestAlternativeStart = (
  booking: Booking,
  allBookings: Booking[],
  hours: { open: number; close: number } | null,
  nowMinutes: number | null = null,
): number | null => {
  if (!hours) return null;
  const requested = timeStringToMinutes(booking.time);
  const earliest = Math.max(
    hours.open * 60,
    nowMinutes === null
      ? 0
      : Math.ceil(nowMinutes / SNAP_MINUTES) * SNAP_MINUTES,
  );

  let best: number | null = null;
  for (
    let start = hours.open * 60;
    start + booking.totalTime <= hours.close * 60;
    start += SNAP_MINUTES
  ) {
    if (start === requested || start < earliest) continue;
    const clash = findBookingConflict(
      {
        stylistId: booking.stylistId,
        date: booking.date,
        time: minutesToTimeString(start),
        totalTime: booking.totalTime,
        activeTime: booking.activeTime,
        excludeId: booking.id,
      },
      allBookings,
    );
    if (clash) continue;
    if (
      best === null ||
      Math.abs(start - requested) < Math.abs(best - requested)
    ) {
      best = start;
    }
  }
  return best;
};

export const smsHref = (phone: string, body: string): string =>
  `sms:${phone}?body=${encodeURIComponent(body)}`;

export const buildSuggestTimeMessage = (
  booking: Pick<Booking, "customerName" | "date" | "time">,
  alternativeStart: number | null,
): string => {
  const first = firstNameOf(booking.customerName);
  const asked = formatWhen(booking.date, booking.time);
  return alternativeStart === null
    ? `Hi ${first}, thanks for booking with Sua Hair Studio. Unfortunately we can't do ${asked}. Could you let us know another day or time that suits you?`
    : `Hi ${first}, thanks for booking with Sua Hair Studio. Unfortunately we can't do ${asked}. Would ${formatWhen(
        booking.date,
        minutesToTimeString(alternativeStart),
      )} work instead? Reply to confirm.`;
};

export const buildOfferSlotMessage = (
  customerName: string,
  date: string,
  start: number,
  stylistName: string,
): string =>
  `Hi ${firstNameOf(
    customerName,
  )}, a spot has opened up at Sua Hair Studio: ${formatWhen(
    date,
    minutesToTimeString(start),
  )} with ${stylistName}. Would you like it? Reply to confirm.`;
