// functions/src/email/templates.ts
// Pure builders for the outbound emails — no firebase or network imports, so
// they can be unit-tested from the root vitest suite.
//
// Design: monochrome luxury, matching the app. Black on off-white (#faf9f7),
// one thin rule, an outlined (never filled) button. Email clients don't load
// webfonts reliably, so the headline asks for Bodoni Moda and falls back to
// Didot/Georgia; body is the system sans stack. Layout is table-based with
// inline styles because that is what mail clients actually render.
//
// Every customer-supplied string is HTML-escaped before interpolation.

import { SALON } from "../salon";

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
}

export interface OwnerNotificationData extends BookingEmailData {
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Subjects are single-line; strip any CR/LF a customer-supplied name carries.
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();

/** "2026-07-03" → "Friday 3 July". Falls back to the raw string if malformed. */
export const formatLongDate = (date: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // UTC arithmetic only — the calendar date must not shift with the server TZ.
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${d} ${MONTHS[mo - 1]}`;
};

export const firstName = (fullName: string): string =>
  fullName.trim().split(/\s+/)[0] || "there";

const formatPrice = (b: BookingEmailData): string | null => {
  if (typeof b.servicePrice !== "number") return null;
  // "Any available stylist" bookings store the lowest tier price as an
  // estimate — the final price depends on who takes the booking.
  const prefix = b.stylistId === "any" ? "from " : "";
  return `${prefix}$${b.servicePrice}`;
};

const serviceLines = (b: BookingEmailData): string[] =>
  b.services && b.services.length > 0
    ? b.services.map((s) => s.name)
    : [b.serviceName];

interface Row {
  label: string;
  lines: string[];
}

const detailRows = (b: BookingEmailData): Row[] => {
  const rows: Row[] = [
    { label: "Stylist", lines: [b.stylistName] },
    { label: "Service", lines: serviceLines(b) },
    { label: "Date", lines: [formatLongDate(b.date)] },
    { label: "Time", lines: [b.time] },
  ];
  const price = formatPrice(b);
  if (price) rows.push({ label: "Price", lines: [price] });
  return rows;
};

const SERIF =
  "'Bodoni Moda','Bodoni 72',Didot,'Playfair Display',Georgia,'Times New Roman',serif";
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";

interface Layout {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  rows: Row[];
  closing: string;
  bookingRef?: string;
}

const RULE =
  '<tr><td style="border-top:1px solid #111111;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>';

const renderHtml = (l: Layout): string => {
  const rowsHtml = l.rows
    .map(
      (r) =>
        `<tr>` +
        `<td valign="top" style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;padding:12px 16px 12px 0;width:96px;">${escapeHtml(r.label)}</td>` +
        `<td valign="top" style="font-family:${SANS};font-size:15px;line-height:1.5;color:#111111;padding:12px 0;">${r.lines.map(escapeHtml).join("<br>")}</td>` +
        `</tr>`,
    )
    .join("");

  const footer =
    `${escapeHtml(SALON.name)} &middot; ${escapeHtml(SALON.address)}` +
    (l.bookingRef ? `<br>Reference ${escapeHtml(l.bookingRef)}` : "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(l.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#faf9f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#faf9f7;">${escapeHtml(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#faf9f7" style="background:#faf9f7;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#111111;padding-bottom:32px;">${escapeHtml(SALON.name)}</td></tr>
<tr><td style="font-family:${SERIF};font-size:32px;line-height:1.2;font-weight:400;color:#111111;padding-bottom:16px;">${escapeHtml(l.headline)}</td></tr>
<tr><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:#111111;padding-bottom:28px;">${escapeHtml(l.intro)}</td></tr>
${RULE}
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table></td></tr>
${RULE}
<tr><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:#111111;padding:28px 0 20px;">${escapeHtml(l.closing)}</td></tr>
<tr><td style="padding-bottom:36px;"><a href="${SALON.phoneHref}" style="display:inline-block;font-family:${SANS};font-size:13px;letter-spacing:0.08em;color:#111111;text-decoration:none;border:1px solid #111111;padding:12px 24px;">Call ${escapeHtml(SALON.phoneDisplay)}</a></td></tr>
<tr><td style="font-family:${SANS};font-size:12px;line-height:1.6;color:#6b6b6b;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const renderText = (l: Layout): string => {
  const rows = l.rows.map((r) => `${r.label}: ${r.lines.join(", ")}`);
  return [
    SALON.name.toUpperCase(),
    "",
    l.headline,
    "",
    l.intro,
    "",
    ...rows,
    "",
    l.closing,
    "",
    `${SALON.name} - ${SALON.address}`,
    ...(l.bookingRef ? [`Reference ${l.bookingRef}`] : []),
  ].join("\n");
};

const CLOSING_LINE = `Need to change your booking? Call us on ${SALON.phoneDisplay}.`;

const build = (layout: Layout): BuiltEmail => ({
  subject: layout.subject,
  html: renderHtml(layout),
  text: renderText(layout),
});

export const buildConfirmationEmail = (b: BookingEmailData): BuiltEmail =>
  build({
    subject: `Your booking at ${SALON.name} — ${formatLongDate(b.date)}`,
    preheader: `${formatLongDate(b.date)} at ${b.time} with ${b.stylistName}.`,
    headline: `We look forward to seeing you, ${firstName(b.customerName)}`,
    intro: "Your booking is confirmed. Here are the details.",
    rows: detailRows(b),
    closing: CLOSING_LINE,
    bookingRef: b.bookingRef,
  });

export const buildReminderEmail = (b: BookingEmailData): BuiltEmail =>
  build({
    subject: `A reminder of your appointment tomorrow — ${SALON.name}`,
    preheader: `Tomorrow, ${formatLongDate(b.date)} at ${b.time} with ${b.stylistName}.`,
    headline: "A reminder of your appointment tomorrow",
    intro: `Hello ${firstName(b.customerName)} — we look forward to seeing you.`,
    rows: detailRows(b),
    closing: CLOSING_LINE,
    bookingRef: b.bookingRef,
  });

/** Plain-text notification to the salon owner. No HTML part by design. */
export const buildOwnerNotification = (
  b: OwnerNotificationData,
): { subject: string; text: string } => {
  const price = formatPrice(b);
  const lines = [
    "A new booking has been made online.",
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
    subject: oneLine(
      `New booking: ${b.customerName} — ${formatLongDate(b.date)} ${b.time}`,
    ),
    text: lines.filter((l) => l !== "").join("\n"),
  };
};
