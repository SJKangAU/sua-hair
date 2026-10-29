// emailRender.ts
// The booking emails (FR-027, DEC-053): the wording the owner (or a stylist they have
// trusted) edits in Manage, and the one place that turns it into an email. The LAYOUT is
// fixed - black on off-white, one thin rule, an outlined button, table-based with inline
// styles because that is what mail clients render - so no wording can break the look.
// The words are theirs: subject, preview line, headline, intro and closing (with
// {placeholders}), and three switches: the booking details, the reference, the call button.
//
// Pure - no Firebase, no network - so the Manage screen (live preview), the Cloud
// Functions (the real send) and the unit tests run the same code.

import { businessInstant } from "./businessTime";
import { buildIcs, type IcsEvent } from "./icsEvent";
import { timeStringToMinutes } from "./scheduling";
import {
  CONSULTATION_EMAIL_NOTE,
  PLACEHOLDERS,
  fillTemplate,
  smsDate,
  smsValuesFor,
  unknownPlaceholders,
  type SmsBookingFields,
  type SmsKind,
} from "./sms";

export type EmailKind = SmsKind;

export interface EmailTemplate {
  /** Send this email at all (off = the customer simply isn't emailed about it) */
  enabled: boolean;
  subject: string;
  /** The grey line mail apps show next to the subject */
  preheader: string;
  headline: string;
  intro: string;
  closing: string;
  /** The stylist / service / date / time / price table */
  showDetails: boolean;
  showReference: boolean;
  /** The outlined "Call (03) ..." button */
  callButton: boolean;
  /** The outlined "Change or cancel this booking" button (when the booking has a link) */
  manageButton: boolean;
  /** The outlined "Book now" button (the booking page): for an invitation to come back */
  bookButton: boolean;
  /** Attach the appointment as a calendar file */
  attachCalendar: boolean;
  /** The calendar event's title */
  calendarTitle: string;
}

export type EmailTextField = "subject" | "preheader" | "headline" | "intro" | "closing" | "calendarTitle";

export const EMAIL_TEXT_FIELDS: readonly EmailTextField[] = [
  "subject",
  "preheader",
  "headline",
  "intro",
  "closing",
  "calendarTitle",
];

export const EMAIL_FIELD_LABELS: Record<EmailTextField, string> = {
  subject: "Subject",
  preheader: "Preview line (shown beside the subject)",
  headline: "Headline",
  intro: "Opening message",
  closing: "Closing message",
  calendarTitle: "Calendar event title",
};

export const EMAIL_LIMITS: Record<EmailTextField, number> = {
  subject: 150,
  preheader: 200,
  headline: 200,
  intro: 1000,
  closing: 600,
  calendarTitle: 150,
};

const CLOSING = "Need to change your booking? Call us on {phone}.";
const CALENDAR_TITLE = "{service} with {stylist} — {salon}";

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailKind, EmailTemplate> = {
  confirmed: {
    enabled: true,
    subject: "Your booking at {salon} — {date}",
    preheader: "{date} at {time} with {stylist}.",
    headline: "We look forward to seeing you, {name}",
    intro: "Your booking is confirmed. Here are the details.",
    closing: CLOSING,
    showDetails: true,
    showReference: true,
    callButton: true,
    manageButton: true,
    attachCalendar: true,
    calendarTitle: CALENDAR_TITLE,
    bookButton: false,
  },
  received: {
    enabled: true,
    subject: "We have your booking request — {salon}",
    preheader: "{date} at {time} with {stylist} — we'll confirm it soon.",
    headline: "Thank you, {name} — we have your request",
    intro:
      "This is not a confirmation yet. We are holding this time for you and will email you as soon as the salon confirms it.",
    closing: CLOSING,
    showDetails: true,
    showReference: true,
    callButton: true,
    manageButton: true,
    attachCalendar: false,
    calendarTitle: CALENDAR_TITLE,
    bookButton: false,
  },
  not_confirmed: {
    enabled: true,
    subject: "We couldn't confirm your booking request — {salon}",
    preheader: "Your request for {date} at {time} was not confirmed.",
    headline: "Sorry, {name} — we couldn't confirm this one",
    intro:
      "We weren't able to confirm the booking request below, so the time is no longer being held for you. Please call us or choose another time on our website.",
    closing: CLOSING,
    showDetails: true,
    showReference: true,
    callButton: true,
    manageButton: false,
    attachCalendar: false,
    calendarTitle: CALENDAR_TITLE,
    bookButton: false,
  },
  reminder: {
    enabled: true,
    subject: "A reminder of your appointment tomorrow — {salon}",
    preheader: "Tomorrow, {date} at {time} with {stylist}.",
    headline: "A reminder of your appointment tomorrow",
    intro: "Hello {name} — we look forward to seeing you.",
    closing: CLOSING,
    showDetails: true,
    showReference: true,
    callButton: true,
    manageButton: true,
    attachCalendar: false,
    calendarTitle: CALENDAR_TITLE,
    bookButton: false,
  },
  winback: {
    enabled: true,
    subject: "We'd love to see you again — {salon}",
    preheader: "It's been a while since your last visit.",
    headline: "We miss you, {name}",
    intro: "It's been a while since your last visit. We'd love to welcome you back whenever suits you.",
    closing: "Book online, or call us on {phone}.",
    showDetails: false,
    showReference: false,
    callButton: true,
    manageButton: false,
    attachCalendar: false,
    calendarTitle: CALENDAR_TITLE,
    bookButton: true,
  },
};

export interface EmailSettings {
  templates: Record<EmailKind, EmailTemplate>;
}

// ── Settings ─────────────────────────────────────────────────────────────────

const KINDS: readonly EmailKind[] = ["received", "confirmed", "not_confirmed", "reminder", "winback"];

/** What is wrong with each field of a template, in words for the owner (empty when fine). */
export const emailTemplateProblems = (t: EmailTemplate): Partial<Record<EmailTextField, string>> => {
  const out: Partial<Record<EmailTextField, string>> = {};
  for (const f of EMAIL_TEXT_FIELDS) {
    const v = t[f];
    if (v.trim() === "") {
      out[f] = "This can't be empty.";
      continue;
    }
    if (v.length > EMAIL_LIMITS[f]) {
      out[f] = `Keep this to ${EMAIL_LIMITS[f]} characters or fewer.`;
      continue;
    }
    const unknown = unknownPlaceholders(v);
    if (unknown.length > 0) {
      out[f] = `Unknown ${unknown.length === 1 ? "placeholder" : "placeholders"}: ${unknown.map((u) => `{${u}}`).join(", ")}`;
      continue;
    }
    if (v.replace(/\{[^{}]*\}/g, "").match(/[{}]/)) out[f] = "There's a stray { or } in this.";
    else if ((f === "subject" || f === "preheader" || f === "headline") && /[\r\n]/.test(v)) {
      out[f] = "Keep this on one line.";
    }
  }
  return out;
};

/**
 * Whatever is stored (possibly nothing, or a document from before a field was added) ->
 * a complete, safe EmailSettings. Missing, wrong-typed or invalid fields fall back to the
 * default one by one, so a half-edited document never sends a broken email.
 */
export const effectiveEmailSettings = (raw: unknown): EmailSettings => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const stored = (r.templates && typeof r.templates === "object" ? r.templates : {}) as Record<string, unknown>;
  const templates = {} as Record<EmailKind, EmailTemplate>;
  for (const kind of KINDS) {
    const def = DEFAULT_EMAIL_TEMPLATES[kind];
    const t = (stored[kind] && typeof stored[kind] === "object" ? stored[kind] : {}) as Record<string, unknown>;
    const merged: EmailTemplate = { ...def };
    for (const f of EMAIL_TEXT_FIELDS) {
      const v = t[f];
      if (typeof v === "string") merged[f] = v;
    }
    const problems = emailTemplateProblems(merged);
    for (const f of EMAIL_TEXT_FIELDS) if (problems[f]) merged[f] = def[f];
    for (const flag of ["enabled", "showDetails", "showReference", "callButton", "manageButton", "attachCalendar", "bookButton"] as const) {
      if (typeof t[flag] === "boolean") merged[flag] = t[flag] as boolean;
    }
    templates[kind] = merged;
  }
  return { templates };
};

// ── Rendering ────────────────────────────────────────────────────────────────

export interface EmailSalon {
  name: string;
  address: string;
  phoneDisplay: string;
  phoneHref: string;
}

export interface EmailBookingData extends SmsBookingFields {
  servicePrice?: number;
  /** Minutes, for the calendar event */
  totalTime?: number;
  /** Which calendar event this booking is (stable across moves) and its version */
  calendarUid?: string;
  calendarSeq?: number;
  bookingId?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Subjects are single-line; strip any CR/LF a customer-supplied name carries.
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();

/** "2026-07-03" -> "Friday 3 July". Falls back to the raw string if malformed. */
export const formatLongDate = smsDate;

export const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] || "there";

interface Row {
  label: string;
  lines: string[];
}

const formatPrice = (b: EmailBookingData): string | null => {
  if (typeof b.servicePrice !== "number") return null;
  // "Any available stylist" bookings store the lowest tier price as an estimate:
  // the final price depends on who takes the booking.
  return `${b.stylistId === "any" ? "from " : ""}$${b.servicePrice}`;
};

const serviceLines = (b: EmailBookingData): string[] =>
  b.services && b.services.length > 0 ? b.services.map((s) => s.name) : [b.serviceName ?? ""];

const detailRows = (b: EmailBookingData): Row[] => {
  const rows: Row[] = [
    { label: "Stylist", lines: [b.stylistName ?? ""] },
    { label: "Service", lines: serviceLines(b) },
    { label: "Date", lines: [formatLongDate(b.date ?? "")] },
    { label: "Time", lines: [b.time ?? ""] },
  ];
  const price = formatPrice(b);
  if (price) rows.push({ label: "Price", lines: [price] });
  return rows;
};

const SERIF = "'Bodoni Moda','Bodoni 72',Didot,'Playfair Display',Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
const RULE =
  '<tr><td style="border-top:1px solid #111111;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>';

interface Layout {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  closing: string;
  rows: Row[];
  callButton: boolean;
  manageLink?: string;
  bookingLink?: string;
  unsubscribeLink?: string;
  bookingRef?: string;
}

// Paragraph breaks the owner typed are kept
const paragraphs = (s: string): string => escapeHtml(s).replace(/\r?\n/g, "<br>");

const renderHtml = (l: Layout, salon: EmailSalon): string => {
  const rowsHtml = l.rows
    .map(
      (r) =>
        `<tr>` +
        `<td valign="top" style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b6b;padding:12px 16px 12px 0;width:96px;">${escapeHtml(r.label)}</td>` +
        `<td valign="top" style="font-family:${SANS};font-size:15px;line-height:1.5;color:#111111;padding:12px 0;">${r.lines.map(escapeHtml).join("<br>")}</td>` +
        `</tr>`,
    )
    .join("");
  const details = l.rows.length
    ? `${RULE}\n<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}</table></td></tr>\n${RULE}`
    : "";
  const button = l.callButton
    ? `<tr><td style="padding-bottom:36px;"><a href="${escapeHtml(salon.phoneHref)}" style="display:inline-block;font-family:${SANS};font-size:13px;letter-spacing:0.08em;color:#111111;text-decoration:none;border:1px solid #111111;padding:12px 24px;">Call ${escapeHtml(salon.phoneDisplay)}</a></td></tr>`
    : `<tr><td style="padding-bottom:20px;">&nbsp;</td></tr>`;
  const manage = l.manageLink
    ? `<tr><td style="padding-bottom:36px;"><a href="${escapeHtml(l.manageLink)}" style="display:inline-block;font-family:${SANS};font-size:13px;letter-spacing:0.08em;color:#111111;text-decoration:none;border:1px solid #111111;padding:12px 24px;">Change or cancel this booking</a></td></tr>`
    : "";
  const book = l.bookingLink
    ? `<tr><td style="padding-bottom:36px;"><a href="${escapeHtml(l.bookingLink)}" style="display:inline-block;font-family:${SANS};font-size:13px;letter-spacing:0.08em;color:#111111;text-decoration:none;border:1px solid #111111;padding:12px 24px;">Book now</a></td></tr>`
    : "";
  const footer =
    `${escapeHtml(salon.name)} &middot; ${escapeHtml(salon.address)}` +
    (l.bookingRef ? `<br>Reference ${escapeHtml(l.bookingRef)}` : "") +
    // an invitation to come back is marketing: the way to stop it is always there
    (l.unsubscribeLink ? `<br>You're getting this because you agreed to hear from us. <a href="${escapeHtml(l.unsubscribeLink)}" style="color:#6b6b6b;">Unsubscribe</a>` : "");

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
<tr><td style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#111111;padding-bottom:32px;">${escapeHtml(salon.name)}</td></tr>
<tr><td style="font-family:${SERIF};font-size:32px;line-height:1.2;font-weight:400;color:#111111;padding-bottom:16px;">${escapeHtml(l.headline)}</td></tr>
<tr><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:#111111;padding-bottom:28px;">${paragraphs(l.intro)}</td></tr>
${details}
<tr><td style="font-family:${SANS};font-size:15px;line-height:1.6;color:#111111;padding:28px 0 20px;">${paragraphs(l.closing)}</td></tr>
${button}
${manage}
${book}
<tr><td style="font-family:${SANS};font-size:12px;line-height:1.6;color:#6b6b6b;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const renderText = (l: Layout, salon: EmailSalon): string =>
  [
    salon.name.toUpperCase(),
    "",
    l.headline,
    "",
    l.intro,
    "",
    ...(l.rows.length ? [...l.rows.map((r) => `${r.label}: ${r.lines.join(", ")}`), ""] : []),
    l.closing,
    ...(l.manageLink ? ["", `Change or cancel this booking: ${l.manageLink}`] : []),
    ...(l.bookingLink ? ["", `Book now: ${l.bookingLink}`] : []),
    "",
    `${salon.name} - ${salon.address}`,
    ...(l.bookingRef ? [`Reference ${l.bookingRef}`] : []),
    ...(l.unsubscribeLink ? ["", `You're getting this because you agreed to hear from us. Unsubscribe: ${l.unsubscribeLink}`] : []),
  ].join("\n");

/** One booking + one template -> the email: subject, HTML and plain text. */
export const renderEmail = (template: EmailTemplate, booking: EmailBookingData, salon: EmailSalon): BuiltEmail => {
  const values = smsValuesFor(booking, { name: salon.name, phoneDisplay: salon.phoneDisplay });
  // the customer's first name, with the same fallback the greeting always had
  values.name = firstName(booking.customerName ?? "");
  const layout: Layout = {
    subject: oneLine(fillTemplate(template.subject, values)),
    preheader: oneLine(fillTemplate(template.preheader, values)),
    headline: oneLine(fillTemplate(template.headline, values)),
    intro: [fillTemplate(template.intro, values).trim(), booking.consultationCall ? CONSULTATION_EMAIL_NOTE : ""]
      .filter(Boolean)
      .join("\n\n"),
    closing: fillTemplate(template.closing, values).trim(),
    rows: template.showDetails ? detailRows(booking) : [],
    callButton: template.callButton,
    ...(template.manageButton && booking.manageLink ? { manageLink: booking.manageLink } : {}),
    ...(template.bookButton && booking.bookingLink ? { bookingLink: booking.bookingLink } : {}),
    // always shown when there is one: it is the way to stop an invitation
    ...(booking.unsubscribeLink ? { unsubscribeLink: booking.unsubscribeLink } : {}),
    ...(template.showReference && booking.bookingRef ? { bookingRef: booking.bookingRef } : {}),
  };
  return { subject: layout.subject, html: renderHtml(layout, salon), text: renderText(layout, salon) };
};

/**
 * The calendar event to attach for this booking, or null when the wording says not to (or the
 * booking has no usable time). The same UID is kept when a booking is moved and the version
 * goes up, so the customer's calendar updates the one event.
 */
export const buildCalendarEvent = (
  template: EmailTemplate,
  booking: EmailBookingData,
  salon: EmailSalon,
  kind: EmailKind,
  nowMs: number,
): string | null => {
  if (!template.attachCalendar) return null;
  const startMs = businessInstant(booking.date ?? "", timeStringToMinutes(booking.time ?? ""));
  if (startMs === null || !(booking.totalTime && booking.totalTime > 0)) return null;
  const values = smsValuesFor(booking, { name: salon.name, phoneDisplay: salon.phoneDisplay });
  const detail = [
    `Stylist: ${booking.stylistName ?? ""}`,
    `Service: ${serviceLines(booking).join(", ")}`,
    formatPrice(booking) ? `Price: ${formatPrice(booking)}` : "",
    `Phone: ${salon.phoneDisplay}`,
    booking.bookingRef ? `Reference: ${booking.bookingRef}` : "",
    booking.manageLink ? `Change or cancel: ${booking.manageLink}` : "",
  ].filter(Boolean);
  const event: IcsEvent = {
    uid: booking.calendarUid ?? booking.bookingId ?? booking.bookingRef ?? `${booking.date}-${booking.time}`,
    sequence: booking.calendarSeq ?? 0,
    startMs,
    endMs: startMs + booking.totalTime * 60_000,
    summary: oneLine(fillTemplate(template.calendarTitle, values)),
    description: detail.join("\n"),
    location: salon.address,
    status: kind === "confirmed" ? "CONFIRMED" : "TENTATIVE",
    alarmMinutesBefore: 24 * 60,
    stampMs: nowMs,
  };
  return buildIcs(event);
};

/** Every placeholder an email may use (the same ones as a text). */
export const EMAIL_PLACEHOLDERS = PLACEHOLDERS;
