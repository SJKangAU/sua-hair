// functions/src/salon.ts
// Salon details used in outbound emails. Mirrors SALON_CONFIG in
// src/lib/config.ts — the functions bundle can't import from the web app, so
// keep the two in step when these change.

export const SALON = {
  name: "Sua Hair Studio",
  phoneDisplay: "(03) 9569 0840",
  phoneHref: "tel:0395690840",
  // TODO(owner): replace with the full street address before going live —
  // only the suburb is known to the codebase (see SiteFooter.tsx).
  address: "Glen Waverley, VIC",
  // Customers who hit "reply" on a confirmation land here.
  replyTo: "info@suahair.com.au",
  // Bookings store date + time as plain strings in the salon's local time.
  timeZone: "Australia/Melbourne",
} as const;
