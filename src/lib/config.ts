// config.ts
// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS RULES CONFIGURATION FOR SUA HAIR
// ─────────────────────────────────────────────────────────────────────────────
// This is the single source of truth for all scheduling and business rules.
// All values here are easily adjustable without touching any logic code.
// Consult with the salon owner before making changes.
// ─────────────────────────────────────────────────────────────────────────────

export const SALON_CONFIG = {
  // ── Trading Hours ──────────────────────────────────────────────────────────
  // 24-hour format. Sua Hair: Tuesday-Sunday, 10:00 AM - 6:00 PM
  tradingHours: {
    open: 10, // 10:00 AM
    close: 18, // 6:00 PM
  },

  // ── Closed Days ────────────────────────────────────────────────────────────
  // 0 = Sunday, 1 = Monday, 2 = Tuesday ... 6 = Saturday
  // Sua Hair is closed on Mondays
  closedDays: [1],

  // ── Slot Interval ──────────────────────────────────────────────────────────
  // How often time slots appear in minutes (e.g. 15 = slots at :00 :15 :30 :45,
  // 30 = slots at :00 and :30). Was 30; changed to 15 with the booking-page
  // hover preview (DEC-024).
  slotIntervalMinutes: 15,

  // ── Minimum Booking Notice ─────────────────────────────────────────────────
  // How many hours in advance a customer must book
  // e.g. 2 = cannot book a slot within 2 hours of now
  minimumNoticeHours: 2,

  // ── Rest Period Rules ──────────────────────────────────────────────────────
  // During a service's rest/set period, the stylist CAN take another client
  // but ONLY if the new service fits entirely within the remaining rest time.
  // Set to false to block the stylist completely during rest periods.
  allowBookingsDuringRestPeriod: true,

  // ── Same Day Cutoff ────────────────────────────────────────────────────────
  // If it is past this hour, same-day bookings are not allowed at all
  // e.g. 17 = no same-day bookings after 5:00 PM
  sameDayCutoffHour: 17,

  // ── Online booking requests (DEC-035 / DEC-036) ───────────────────────────
  // A request holds its slot straight away. If the owner has not approved it
  // after this many hours the hold is released (scheduled function), the slot
  // opens up again and the customer is told it was not confirmed. The owner can
  // approve or decline at any time before then.
  pendingHoldHours: 24,
  // Open (pending) requests one phone number may have at a time
  maxPendingPerPhone: 2,
  // Services in one request, how far ahead a date may be, and text limits - all
  // enforced again on the server (createBookingRequest)
  maxServicesPerBooking: 6,
  maxAdvanceDays: 365,
  notesMaxLength: 500,
  nameMaxLength: 100,

  // ── Phone Validation ───────────────────────────────────────────────────────
  // Australian mobile numbers: 10 digits, starting with 04
  phoneRegex: /^04\d{8}$/,
  phoneError:
    "Please enter a valid Australian mobile number starting with 04 (e.g. 0412 345 678)",

  // ── Name Validation ────────────────────────────────────────────────────────
  // Min 2 characters, letters and spaces only
  nameRegex: /^[a-zA-Z\s]{2,}$/,
  nameError: "Please enter a valid name (letters only, at least 2 characters)",

  // ── Calendar Settings ──────────────────────────────────────────────────────
  // Used when generating Add to Calendar links
  salonName: "Sua Hair Studio",
  salonAddress: "Melbourne, VIC",
  salonPhone: "(03) 9569 0840",
  salonEmail: "info@suahair.com.au",
};
