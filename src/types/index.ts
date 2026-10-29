// types/index.ts
// Shared TypeScript interfaces used across the entire app
//
// Multi-service bookings: the customer-facing flow stores an array of
// BookedService objects alongside the legacy flat fields (serviceId,
// serviceName, servicePrice) so that existing admin views continue to work
// without modification.  When reading a booking, prefer booking.services
// when present; fall back to the flat fields for admin-created entries
// (breaks, training, walkin) that don't go through the booking flow.

import type { ClientAccess } from "../lib/clientAccess";
import type { Capability } from "../lib/permissions";

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
  /** Why, in the owner's words ("Christmas Day"); shown to customers for a closure */
  label?: string;
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

// Owner-only notification preferences. Lives in privateSettings/notifications
// (owner-read/write, see firestore.rules) rather than the world-readable
// salonSettings document, because it holds the owner's email address.
export interface OwnerNotificationSettings {
  notifyOwnerByEmail: boolean;
  ownerEmail: string;
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
  order?: number; // owner-chosen display order; missing = after the ordered ones
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
  // true = an online booking for this service is held until the owner confirms it.
  // Absent / false = confirmed on the spot (DEC-059).
  requiresApproval?: boolean;
  // Weeks until the client is due back for a retouch (e.g. colour regrowth). Optional.
  retouchWeeks?: number;
}

// ── Phases (DEC-026) ───────────────────────────────────────────────────────────
// A booking / service is an ordered list of phases. "active" = the stylist is
// hands-on (busy); "rest" = the client is processing and the stylist is free.
export type PhaseType = "active" | "rest";

export interface Phase {
  type: PhaseType;
  minutes: number;
}

// A phase placed on the day: absolute minutes from midnight
export interface PlacedSegment {
  type: PhaseType;
  start: number;
  end: number;
}

// A single service as stored within a multi-service booking record
export interface BookedService {
  id: string;
  name: string;
  price: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
  // The service's phases when it has more than hands-on + processing
  phases?: Phase[];
}

// Booking lifecycle — see src/lib/bookingStatus.ts for what each status
// means for availability (only cancelled and no_show free the slot).
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "in_service"
  | "completed"
  | "no_show"
  | "cancelled";

// One line of a booking's history log (shown in the booking drawer). Written
// whenever status, time/stylist or phase lengths change; the "Created" row is
// derived from Booking.createdAt rather than stored.
export interface BookingHistoryEntry {
  at: string; // ISO timestamp
  type: "status" | "moved" | "phases";
  label: string;
  status?: BookingStatus; // set on "status" entries, drives the icon
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
  // Optional — collected in the booking flow for confirmation/reminder emails
  // (see functions/src/index.ts). Phone remains the primary identifier.
  customerEmail?: string;
  stylistId: string;
  stylistName: string;
  stylistLevel: "director" | "senior" | "junior";
  // Multi-service array — undefined for admin-created breaks/training/walkin
  services?: BookedService[];
  // Legacy single-service fields kept for backward compat with admin views
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  // Legacy totals - always kept consistent with `phases` (sum of the active
  // phases / the rest phases / both), so every older view keeps working
  activeTime: number;
  restTime: number;
  totalTime: number;
  // This booking's own resolved phases, in order (DEC-012 style: copied from the
  // service at booking time, then customisable per booking without touching the
  // service). Absent on bookings made before phases existed: derived from
  // activeTime / restTime.
  phases?: Phase[];
  // The same phases placed on the day (absolute minutes), recomputed whenever the
  // start or a phase changes
  segments?: PlacedSegment[];
  date: string;
  time: string;
  notes?: string;
  status: BookingStatus;
  // ISO timestamp recorded when the booking was marked arrived — shown as an
  // arrival-time pill on the timeline. Cleared if the booking is moved back
  // to pending / confirmed.
  arrivedAt?: string;
  // The status a cancelled / no-show booking returns to on Restore. Written
  // when the booking is released, removed when it is brought back.
  restoreStatus?: BookingStatus;
  // Append-only log of changes made after creation, oldest first
  history?: BookingHistoryEntry[];
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
  // The client this booking belongs to: their normalised phone, "04XXXXXXXX"
  // (clients/{clientId}, DEC-044). Absent on breaks and training, on bookings with
  // no valid phone, and on bookings made before the clients collection existed
  // until the backfill (or the first write to them) sets it. After the owner
  // anonymises a client it becomes a tombstone id ("deleted-...").
  clientId?: string;
  blockReason?: string;
  traineeId?: string;
  traineeName?: string;
  trainingTopic?: string;
  // ISO timestamp recorded when a customer ticks the privacy-consent box in
  // the public booking flow (see BookingForm / DetailsStep). Optional because
  // admin-created bookings (walk-in, break, training) don't collect consent.
  consentGivenAt?: string;
  // ISO timestamp set by the scheduled reminder function once the 24-hour
  // reminder email has been sent — guards against double-sending.
  reminderSentAt?: string | null;
  createdAt: string;
  // ── Online requests (DEC-035 to DEC-038), set by the booking functions ──
  // A pending request holds its slot until this ISO time; if the owner has not
  // approved it by then the scheduled function releases it (cancelReason
  // "expired"). Removed on approval.
  holdExpiresAt?: string;
  // ISO timestamp of the owner's approval
  confirmedAt?: string;
  // Why a booking is cancelled: the owner declined the request, it expired
  // unapproved, or it was cancelled after being confirmed
  cancelReason?: "declined" | "expired" | "cancelled";
  // True when the customer chose "Any Available Stylist" and the server picked
  // the stylist; stylistId is always a real stylist
  assignedAutomatically?: boolean;
  // The secret in the customer's link to change or cancel this booking (FR-028). Only the
  // owner and this booking's stylist can read a booking, so it stays private.
  manageToken?: string;
  // This booking is a request to MOVE a confirmed one: approving it releases the original
  replacesBookingId?: string;
  replacesSummary?: string; // "2026-11-03 10:00 AM", for the approvals list
  // The calendar event this booking updates, and how many times it has changed (FR-027)
  calendarUid?: string;
  calendarSeq?: number;
  cancelledBy?: "customer";
  // Ticked the optional box to hear about coming back when this was made (FR-030)
  marketingConsent?: boolean;
  // Set on a booking brought in from another system (the Fresha import). The salon already
  // told the client about it, so the "booking confirmed" email / text is not sent when it is
  // created (the day-before reminder still goes out).
  importedFrom?: string;
}

// Minimal, PII-free projection of a Booking used to compute public
// availability. Firestore Security Rules cannot redact individual fields
// from an authorized document read (see firestore.rules), so the public
// booking calendar reads exclusively from the `slotBlocks` collection —
// which never contains customerName/customerPhone/notes — instead of the
// full `bookings` collection, which requires staff auth to read. Kept in
// sync with `bookings` on every create/status/time-edit write; see
// src/lib/slotBlockData.ts.
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
> & {
  // The booking's phases, when the record carries them (full Booking objects do)
  phases?: Phase[];
  // PII-free phase footprint (absent on projections written before phases):
  // the BUSY blocks only (absolute minutes) and the minute the stylist is due
  // back if the booking ends in processing
  busy?: { start: number; end: number }[];
  returnAt?: number | null;
};

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
  // Whose clients the stylist may open beyond their own (FR-025); from the sign-in token
  clientAccess?: ClientAccess;
  // What else the owner lets this person do (FR-026); an owner can do everything
  capabilities?: Capability[];
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

// ── Clients (DEC-044) ─────────────────────────────────────────────────────────
// clients/{clientId} - one document per client, keyed by normalised phone. OWNER
// ONLY (it holds spend, the blocked reason and the email). clientCards/{clientId}
// is the slim staff-readable copy a stylist may open for their own clients.

export type ClientSource = "online" | "walk-in" | "fresha-import";
export type PreferredContact = "text" | "call" | "email";

// Figures worked out from the client's bookings (src/lib/clients.ts). Always
// recomputable from the bookings; kept up to date by the booking functions and a
// trigger, and repaired by the owner's "recompute".
export interface ClientSummary {
  totalVisits: number;
  totalSpend: number; // dollars, from visits only; never breaks or training
  firstVisit: string; // YYYY-MM-DD, "" when none
  lastVisit: string; // YYYY-MM-DD, "" when none
  hasUpcoming: boolean;
  nextBookingDate: string; // "" when none
  nextBookingTime: string;
  nextBookingId: string;
  cancelCount: number;
  noShowCount: number;
  hasNoShows: boolean; // noShowCount > 0, for indexed filtering
  favouriteStylistId: string; // "" when none
  favouriteServiceIds: string[];
  stylistIds: string[]; // every stylist who has a booking with them
  avgDaysBetweenVisits: number | null;
  bookingCount: number; // service bookings, any status
}

export interface Client extends ClientSummary {
  id: string; // == the document id: the phone, or "deleted-..." once anonymised
  phone: string;
  name: string;
  nameLower: string; // lower-cased, accents removed: prefix search
  searchTokens: string[]; // name words: "lee" finds "Jade Lee"
  aliases: string[]; // earlier spellings of the name
  nameOverride?: boolean; // the owner set the name; bookings no longer rename them
  email?: string;
  tags: string[];
  blocked: boolean;
  blockReason?: string;
  smsOptOut?: boolean; // asked not to be texted: no booking texts are sent (FR-024)
  // Agreed to hear about coming back (FR-030): the latest consent, unless they unsubscribed since
  marketingOptIn?: boolean;
  marketingConsentAt?: string;
  marketingSource?: "booking-form" | "walk-in" | "owner-recorded";
  marketingOptOutAt?: string;
  // The secret in the unsubscribe link in a win-back message, and when they were last invited back
  marketingToken?: string;
  winBackSentAt?: string;
  // Profile details the owner records by hand (bookings never overwrite them)
  birthday?: string; // "MM-DD", or "YYYY-MM-DD" when the year is known
  pronouns?: string;
  preferredContact?: PreferredContact;
  allergies?: string; // allergies / sensitivities; also on the card, so stylists see it
  source: ClientSource;
  createdAt: string;
  updatedAt: string;
  anonymised?: boolean;
}

// What a stylist may read about a client of theirs: no spend, no blocked reason
export interface ClientCard {
  id: string;
  phone: string;
  name: string;
  nameLower: string;
  searchTokens: string[];
  stylistIds: string[];
  blocked: boolean;
  tags: string[];
  allergies?: string; // safety information: a stylist must see it
  pronouns?: string;
}

// clients/{id}/notes/{noteId}: append-only, so staff can see who wrote what
export interface ClientNote {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
  pinned: boolean;
}

export type ClientAuditAction =
  | "edit"
  | "block"
  | "unblock"
  | "merge"
  | "anonymise"
  | "export"
  | "backfill";

// clients/{id}/audit/{entryId}: owner-only, who did what and when
export interface ClientAudit {
  id: string;
  action: ClientAuditAction;
  byUid: string;
  byName: string;
  at: string;
  detail?: string;
}
