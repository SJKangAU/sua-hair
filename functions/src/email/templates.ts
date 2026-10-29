// functions/src/email/templates.ts
// The outbound emails. The wording and the layout live in src/lib/emailRender.ts - shared
// with the Manage screen's live preview - and the owner's own wording is read from
// privateSettings/email by the sender (index.ts). This module fits a booking to that
// renderer with the salon's details, keeps the old one-call builders (which use the
// default wording), and holds the plain-text heads-up to the owner. No firebase or
// network imports, so it is unit-tested from the root vitest suite.
//
// Every customer-supplied string is HTML-escaped before interpolation.

import { SALON } from "../salon";
import {
  DEFAULT_EMAIL_TEMPLATES,
  escapeHtml,
  firstName,
  formatLongDate,
  renderEmail,
  type BuiltEmail,
  type EmailKind,
  type EmailSalon,
  type EmailTemplate,
} from "../../../src/lib/emailRender";

export { escapeHtml, firstName, formatLongDate };
export type { BuiltEmail };

export interface BookingEmailData {
  customerName: string;
  stylistId?: string;
  stylistName: string;
  serviceName: string;
  services?: { name: string; price?: number }[];
  servicePrice?: number;
  date: string; // YYYY-MM-DD
  time: string; // "10:30 AM"
  bookingRef?: string;
  // The customer's link to change or cancel (FR-028) and what the calendar file needs (FR-027)
  manageLink?: string;
  totalTime?: number;
  calendarUid?: string;
  calendarSeq?: number;
  bookingId?: string;
}

export interface OwnerNotificationData extends BookingEmailData {
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  /** A colour booking: the owner has to ring the client before confirming */
  needsConsultation?: boolean;
}

export const SALON_FOR_EMAIL: EmailSalon = {
  name: SALON.name,
  address: SALON.address,
  phoneDisplay: SALON.phoneDisplay,
  phoneHref: SALON.phoneHref,
};

/** The email for `kind` in the given wording (the default wording when none is given). */
export const buildEmail = (
  kind: EmailKind,
  b: BookingEmailData,
  template: EmailTemplate = DEFAULT_EMAIL_TEMPLATES[kind],
): BuiltEmail => renderEmail(template, b, SALON_FOR_EMAIL);

export const buildConfirmationEmail = (b: BookingEmailData): BuiltEmail => buildEmail("confirmed", b);

/** Sent when a request is received. NOT a confirmation: the salon still has to approve it. */
export const buildRequestReceivedEmail = (b: BookingEmailData): BuiltEmail => buildEmail("received", b);

/** Sent when a request was declined or lapsed without being approved. */
export const buildNotConfirmedEmail = (b: BookingEmailData): BuiltEmail => buildEmail("not_confirmed", b);

export const buildReminderEmail = (b: BookingEmailData): BuiltEmail => buildEmail("reminder", b);

// ── The owner's heads-up (plain text, no HTML part by design) ────────────────

// Subjects are single-line; strip any CR/LF a customer-supplied name carries.
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();

const formatPrice = (b: BookingEmailData): string | null => {
  if (typeof b.servicePrice !== "number") return null;
  return `${b.stylistId === "any" ? "from " : ""}$${b.servicePrice}`;
};

const serviceLines = (b: BookingEmailData): string[] =>
  b.services && b.services.length > 0 ? b.services.map((s) => s.name) : [b.serviceName];

/** Plain-text notification to the salon owner. */
export const buildOwnerNotification = (b: OwnerNotificationData): { subject: string; text: string } => {
  const price = formatPrice(b);
  const lines = [
    "A new booking REQUEST has arrived online. It holds the time until you approve or decline it (Approvals tab).",
    ...(b.needsConsultation
      ? ["This is a COLOUR booking: ring the client before you confirm it. Their answers to the colour questions are on the booking (they are not in this email)."]
      : []),
    "",
    `Customer: ${oneLine(b.customerName)}`,
    b.customerPhone ? `Phone: ${b.customerPhone}` : "",
    b.customerEmail ? `Email: ${b.customerEmail}` : "",
    `Stylist: ${b.stylistName}`,
    `Service: ${serviceLines(b).join(", ")}`,
    `Date: ${formatLongDate(b.date)}`,
    `Time: ${b.time}`,
    price ? `Price: ${price}` : "",
    b.notes ? `Notes: ${b.notes}` : "",
    b.bookingRef ? `Reference: ${b.bookingRef}` : "",
  ];
  return {
    subject: oneLine(`New booking: ${b.customerName} — ${formatLongDate(b.date)} ${b.time}`),
    text: lines.filter((l) => l !== "").join("\n"),
  };
};
