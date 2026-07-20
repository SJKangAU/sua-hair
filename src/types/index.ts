// types/index.ts
// Shared TypeScript interfaces used across the entire app
//
// Multi-service bookings: the customer-facing flow stores an array of
// BookedService objects alongside the legacy flat fields (serviceId,
// serviceName, servicePrice) so that existing admin views continue to work
// without modification.  When reading a booking, prefer booking.services
// when present; fall back to the flat fields for admin-created entries
// (breaks, training, walkin) that don't go through the booking flow.

export interface TieredPrice {
  director: number;
  senior: number;
  junior: number;
}

// ── Opening Hours ─────────────────────────────────────────────────────────────

export type DayOfWeek = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

// Recurring schedule entry for a single day of the week
export interface DaySchedule {
  isOpen: boolean;
  open: number; // 24-hour integer, e.g. 10
  close: number; // 24-hour integer, e.g. 18
}

// Overrides the recurring schedule for a single calendar date.
// Either {closed: true} to block the day, or {open, close} for custom hours.
export interface DateOverride {
  closed?: boolean;
  open?: number;
  close?: number;
}

export type WeeklySchedule = Record<DayOfWeek, DaySchedule>;
export type DateOverrides = Record<string, DateOverride>; // key: YYYY-MM-DD

// The single salonSettings Firestore document
export interface SalonSettings {
  weeklySchedule: WeeklySchedule;
  dateOverrides: DateOverrides;
}

// Per-stylist working hours for a single day
export interface StylistDayHours {
  isWorking: boolean;
  start: number; // 24-hour integer
  end: number; // 24-hour integer
}

export type StylistWeeklyHours = Record<DayOfWeek, StylistDayHours>;

// ── Stylist ───────────────────────────────────────────────────────────────────

export interface Stylist {
  id: string;
  name: string;
  role: string;
  level: "director" | "senior" | "junior";
  status: "active" | "inactive";
  instagram?: string;
  startDate: string;
  isTrainer: boolean;
  workingHours?: StylistWeeklyHours; // undefined = uses full salon hours
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  price: TieredPrice;
}

// A single service as stored within a multi-service booking record
export interface BookedService {
  id: string;
  name: string;
  price: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
}

export interface Booking {
  id: string;
  // Human-readable reference (e.g. BK-20260702-hwang-steve-1030) stored as a
  // field, not the doc ID — doc IDs are auto-generated to prevent collisions
  bookingRef?: string;
  customerName: string;
  // Lowercased copy written at creation time — enables case-insensitive
  // prefix search in the admin Clients tab (Firestore has no ilike)
  customerNameLower?: string;
  customerPhone: string;
  stylistId: string;
  stylistName: string;
  stylistLevel: "director" | "senior" | "junior";
  // Multi-service array — undefined for admin-created breaks/training/walkin
  services?: BookedService[];
  // Legacy single-service fields kept for backward compat with admin views
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
  date: string;
  time: string;
  notes?: string;
  status: "pending" | "confirmed" | "cancelled";
  // Owner-facing review flag — marks a booking (typically a walk-in or a
  // data discrepancy) for follow-up. Independent of `status`.
  flagged?: boolean;
  flagReason?: string;
  // Exact clock time the rest/processing period ends (e.g. "2:15 PM"),
  // computed once at booking creation from that service's activeTime/restTime
  // and locked into the record. Only set when restTime > 0. Locking it in
  // means editing a service's restTime later never changes an already-made
  // booking's displayed return time.
  returnTime?: string;
  bookingType: "customer" | "walkin" | "break" | "training";
  blockReason?: string;
  traineeId?: string;
  traineeName?: string;
  trainingTopic?: string;
  createdAt: string;
}

// Minimal, PII-free projection of a Booking used to compute public
// availability. Firestore Security Rules cannot redact individual fields
// from an authorized document read (see firestore.rules), so the public
// booking calendar reads exclusively from the `slotBlocks` collection —
// which never contains customerName/customerPhone/notes — instead of the
// full `bookings` collection, which requires staff auth to read. Kept in
// sync with `bookings` on every create/status/time-edit write; see
// src/lib/slotBlocks.ts.
export type SlotBlock = Pick<
  Booking,
  | "id"
  | "stylistId"
  | "date"
  | "time"
  | "activeTime"
  | "totalTime"
  | "restTime"
  | "status"
>;

export interface TimeBlock {
  stylistId: string;
  date: string;
  startMinutes: number;
  activeEndMinutes: number;
  totalEndMinutes: number;
  isRestPeriod: boolean;
}

// ── Notifications (Phase 9) ───────────────────────────────────────────────────

export interface Notification {
  id: string;
  recipientId: string; // 'owner' | stylistId
  recipientType: "owner" | "stylist";
  bookingId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ── Auth / Role (Phase 10) ────────────────────────────────────────────────────

export interface AppUser {
  uid: string;
  role: "owner" | "stylist";
  stylistId?: string; // only set when role === 'stylist'
}

// ── Waitlist (Phase 12) ───────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  requestedDate: string; // YYYY-MM-DD
  requestedStylistId?: string; // optional — 'any' if no preference
  createdAt: string;
  status: "pending" | "contacted" | "resolved";
}
