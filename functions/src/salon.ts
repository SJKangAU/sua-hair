// functions/src/salon.ts
// Salon details used in outbound emails. Mirrors SALON_CONFIG in
// src/lib/config.ts — the functions bundle can't import from the web app, so
// keep the two in step when these change.

export const SALON = {
  name: "Sua Hair Studio",
  phoneDisplay: "(03) 9569 0840",
  phoneHref: "tel:0395690840",
  address: "325 Stephensons Rd, Mount Waverley VIC 3149",
  // Customers who hit "reply" on a confirmation land here.
  replyTo: "info@suahair.com.au",
  // Bookings store date + time as plain strings in the salon's local time.
  timeZone: "Australia/Melbourne",
} as const;
