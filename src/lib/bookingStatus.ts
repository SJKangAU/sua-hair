// bookingStatus.ts
import { formatBusinessClock } from "./businessTime";

// Single source of truth for the booking lifecycle:
//
//   pending -> confirmed -> arrived -> in_service -> completed
//                       \-> no_show
//   any open status -> cancelled          (cancelled / no_show can be restored)
//
// What each status means for availability (see scheduling.buildTimeBlocks):
//   cancelled, no_show — the client is not coming, so the slot is FREE again
//   everything else    — pending, confirmed, arrived, in_service AND completed
//                        keep occupying the chair for their booked time
//
// Pure module (no React, no Firebase) so it can be unit-tested and imported
// from the scheduling engine.

import type { BookingStatus } from "../types";

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "arrived",
  "in_service",
  "completed",
  "no_show",
  "cancelled",
];

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_service: "In service",
  completed: "Completed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

// How long the "Undo" toast stays up after a cancel / no-show.
export const UNDO_TOAST_MS = 8000;

// ── Availability ──────────────────────────────────────────────────────────────

// Only these two statuses release the slot back to the calendar.
export const isSlotFreeing = (status: BookingStatus): boolean =>
  status === "cancelled" || status === "no_show";

export const blocksSlot = (status: BookingStatus): boolean =>
  !isSlotFreeing(status);

// Still to be served (or being served) — used for live countdowns.
export const isOpenStatus = (status: BookingStatus): boolean =>
  status === "pending" ||
  status === "confirmed" ||
  status === "arrived" ||
  status === "in_service";

// Statuses that count as real, billable bookings. Revenue was previously
// "confirmed only"; a confirmed booking now moves on to arrived / in_service /
// completed, and must not vanish from the totals as it does.
export const REVENUE_STATUSES: readonly BookingStatus[] = [
  "confirmed",
  "arrived",
  "in_service",
  "completed",
];

export const countsAsRevenue = (status: BookingStatus): boolean =>
  REVENUE_STATUSES.includes(status);

// ── Actions ───────────────────────────────────────────────────────────────────

export interface StatusAction {
  status: BookingStatus;
  label: string;
}

const ACTION_LABELS: Record<BookingStatus, string> = {
  pending: "Set to pending",
  confirmed: "Confirm",
  arrived: "Arrived",
  in_service: "Start service",
  completed: "Complete",
  no_show: "No-show",
  cancelled: "Cancel booking",
};

const NEXT_STATUSES: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  // in_service is allowed straight from confirmed: walk-ins are created
  // confirmed and the stylist usually starts them immediately.
  confirmed: ["arrived", "in_service", "no_show", "cancelled"],
  arrived: ["in_service", "cancelled"],
  in_service: ["completed"],
  completed: [],
  // Cancelled and no-show bookings are brought back with Restore, not here.
  no_show: [],
  cancelled: [],
};

export const getStatusActions = (status: BookingStatus): StatusAction[] =>
  NEXT_STATUSES[status].map((next) => ({
    status: next,
    label: ACTION_LABELS[next],
  }));

// The status a cancelled / no-show booking returns to on Restore: whatever it
// was before it was released (recorded by useBookings.updateStatus), falling
// back to pending for older records that predate the lifecycle.
export const getRestoreStatus = (booking: {
  restoreStatus?: BookingStatus;
}): BookingStatus =>
  booking.restoreStatus && !isSlotFreeing(booking.restoreStatus)
    ? booking.restoreStatus
    : "pending";

// ── Wording ───────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : many.replace("{n}", String(n));

// Toast copy for a status change affecting `count` bookings. `restored` is
// true when the bookings were released (cancelled / no-show) and are now back.
export const describeStatusChange = (
  status: BookingStatus,
  count: number,
  restored = false,
): string => {
  if (restored) return plural(count, "Booking restored", "{n} bookings restored");
  switch (status) {
    case "cancelled":
      return plural(count, "Booking cancelled", "{n} bookings cancelled");
    case "no_show":
      return plural(count, "Marked as no-show", "{n} bookings marked as no-show");
    case "confirmed":
      return plural(count, "Booking confirmed", "{n} bookings confirmed");
    case "arrived":
      return plural(count, "Marked as arrived", "{n} bookings marked as arrived");
    case "in_service":
      return plural(count, "Service started", "{n} services started");
    case "completed":
      return plural(count, "Service completed", "{n} services completed");
    case "pending":
      return plural(count, "Booking set to pending", "{n} bookings set to pending");
  }
};

// "10:12 AM" on the salon's clock (Australia/Melbourne), from an ISO timestamp
// (arrivedAt).
export const formatClockTime = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatBusinessClock(d);
};
