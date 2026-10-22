// sms.ts
// Text messages about a booking (FR-024, DEC-050): the four messages, the editable
// wording the owner controls on the Manage page, and the maths of how many SMS
// segments a message costs. Pure - no Firebase, no network - so the Manage screen
// (live preview), the Cloud Functions (the real send) and the unit tests all run
// the same code.
//
//   received       we have your request; it is NOT confirmed yet     (DEC-038)
//   confirmed      the owner approved it, or a walk-in was booked
//   not_confirmed  the request was declined or lapsed
//   reminder       24 hours before a confirmed appointment
//
// Wording uses {placeholders}. An unknown placeholder is rejected when the owner
// saves, so a typo can never go out to a client as literal "{servce}".

import { SALON_CONFIG } from "./config";

export type SmsKind = "received" | "confirmed" | "not_confirmed" | "reminder";

export const SMS_KINDS: readonly SmsKind[] = ["received", "confirmed", "not_confirmed", "reminder"];

export const SMS_KIND_LABELS: Record<SmsKind, { title: string; when: string }> = {
  received: { title: "Request received", when: "Straight after a customer requests a booking online" },
  confirmed: { title: "Booking confirmed", when: "When you approve a request, or book a walk-in" },
  not_confirmed: { title: "Request not confirmed", when: "When a request is declined or runs out of time" },
  reminder: { title: "Reminder", when: "24 hours before a confirmed appointment" },
};

export const PLACEHOLDERS = ["name", "service", "stylist", "date", "time", "salon", "phone", "ref"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const PLACEHOLDER_HELP: Record<Placeholder, string> = {
  name: "Customer's first name",
  service: "Service(s) booked",
  stylist: "Stylist's name",
  date: "e.g. Friday 3 July",
  time: "e.g. 10:30 AM",
  salon: "Salon name",
  phone: "Salon phone number",
  ref: "Booking reference",
};

export interface SmsSettings {
  enabled: boolean;
  /** What the customer sees as the sender (an alphanumeric sender ID, 3-11 characters). */
  senderName: string;
  kinds: Record<SmsKind, boolean>;
  templates: Record<SmsKind, string>;
}

// Plain ASCII on purpose: curly quotes, dashes and emoji push a message out of the
// GSM-7 alphabet and shrink every segment from 160 characters to 70.
export const DEFAULT_TEMPLATES: Record<SmsKind, string> = {
  received:
    "Hi {name}, we've got your request for {service} with {stylist} on {date} at {time}. " +
    "It isn't confirmed yet - we'll text you once it is. {salon}",
  confirmed:
    "Hi {name}, you're booked in! {service} with {stylist} on {date} at {time}. " +
    "Need to change it? Call {phone}. {salon}",
  not_confirmed:
    "Hi {name}, sorry, we couldn't confirm your request for {date} at {time}. " +
    "Please call {phone} or book another time. {salon}",
  reminder:
    "Hi {name}, a reminder of your {service} with {stylist} on {date} at {time}. " +
    "Need to change it? Call {phone}. {salon}",
};

export const MAX_TEMPLATE_LENGTH = 320;
export const MAX_SENDER_LENGTH = 11;
export const MIN_SENDER_LENGTH = 3;
export const DEFAULT_SENDER_NAME = "SuaHair";

// Off until the owner has registered a sender name with the provider and switched
// it on - a fresh deploy never texts anybody by surprise.
export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  enabled: false,
  senderName: DEFAULT_SENDER_NAME,
  kinds: { received: true, confirmed: true, not_confirmed: true, reminder: true },
  templates: { ...DEFAULT_TEMPLATES },
};

// ── Settings ─────────────────────────────────────────────────────────────────

/** Sender ID rules: 3-11 letters, digits or spaces, with at least one letter. */
export const isValidSenderName = (raw: string): boolean => {
  const s = raw.trim();
  return (
    s.length >= MIN_SENDER_LENGTH &&
    s.length <= MAX_SENDER_LENGTH &&
    /^[A-Za-z0-9 ]+$/.test(s) &&
    /[A-Za-z]/.test(s)
  );
};

/**
 * Whatever is stored (possibly nothing, or a document from before a message was
 * added) -> a complete, safe SmsSettings. A missing or blank template falls back
 * to the default; a malformed one never reaches a client.
 */
export const effectiveSettings = (raw: unknown): SmsSettings => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kindsRaw = (r.kinds && typeof r.kinds === "object" ? r.kinds : {}) as Record<string, unknown>;
  const templatesRaw = (r.templates && typeof r.templates === "object" ? r.templates : {}) as Record<
    string,
    unknown
  >;
  const kinds = { ...DEFAULT_SMS_SETTINGS.kinds };
  const templates = { ...DEFAULT_TEMPLATES };
  for (const k of SMS_KINDS) {
    if (typeof kindsRaw[k] === "boolean") kinds[k] = kindsRaw[k] as boolean;
    const t = templatesRaw[k];
    if (typeof t === "string" && t.trim() !== "" && unknownPlaceholders(t).length === 0) templates[k] = t;
  }
  const sender = typeof r.senderName === "string" ? r.senderName.trim() : "";
  return {
    enabled: r.enabled === true,
    senderName: isValidSenderName(sender) ? sender : DEFAULT_SENDER_NAME,
    kinds,
    templates,
  };
};

// ── Templates ────────────────────────────────────────────────────────────────

const TOKEN = /\{([^{}]*)\}/g;

/** Every {word} in a template that is not one of the known placeholders. */
export const unknownPlaceholders = (template: string): string[] => {
  const unknown = new Set<string>();
  for (const m of template.matchAll(TOKEN)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(m[1])) unknown.add(m[1]);
  }
  return [...unknown];
};

/** What is wrong with a template, in words for the owner; null when it is fine. */
export const templateProblem = (template: string): string | null => {
  if (template.trim() === "") return "The message can't be empty.";
  if (template.length > MAX_TEMPLATE_LENGTH) {
    return `Keep the wording to ${MAX_TEMPLATE_LENGTH} characters or fewer.`;
  }
  const unknown = unknownPlaceholders(template);
  if (unknown.length > 0) {
    return `Unknown ${unknown.length === 1 ? "placeholder" : "placeholders"}: ${unknown
      .map((u) => `{${u}}`)
      .join(", ")}`;
  }
  // A stray brace would be sent as-is
  if (template.replace(TOKEN, "").match(/[{}]/)) return "There's a stray { or } in the message.";
  return null;
};

export type SmsValues = Record<Placeholder, string>;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** A customer-supplied value, made safe to drop into a text. */
const tidyValue = (v: string, max: number): string => v.replace(CONTROL, " ").replace(/ +/g, " ").trim().slice(0, max);

/** Put the booking's values into a template's {placeholders}; a value is made safe first. */
export const fillTemplate = (template: string, values: SmsValues): string =>
  template.replace(TOKEN, (_m, key: string) => {
    const v = (values as Record<string, string | undefined>)[key];
    return v === undefined ? "" : tidyValue(v, 80);
  });

export const renderSms = (template: string, values: SmsValues): string =>
  fillTemplate(template, values).replace(/[ \t]{2,}/g, " ").trim();

/** The values for a booking. */
export interface SmsBookingFields {
  customerName?: string;
  serviceName?: string;
  services?: { name: string }[];
  stylistId?: string;
  stylistName?: string;
  date?: string;
  time?: string;
  bookingRef?: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

/** "2026-07-03" -> "Friday 3 July" (calendar arithmetic only: no time zone involved). */
export const smsDate = (date: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return `${WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]} ${d} ${MONTHS[mo - 1]}`;
};

export const smsValuesFor = (
  b: SmsBookingFields,
  salon: { name: string; phoneDisplay: string },
): SmsValues => {
  const services =
    b.services && b.services.length > 0 ? b.services.map((s) => s.name) : b.serviceName ? [b.serviceName] : [];
  const first = (b.customerName ?? "").trim().split(/\s+/)[0] ?? "";
  return {
    name: first || "there",
    service: services.join(" + ") || "appointment",
    stylist: b.stylistId === "any" || !b.stylistName ? "our team" : b.stylistName,
    date: smsDate(b.date ?? ""),
    time: b.time ?? "",
    salon: salon.name,
    phone: salon.phoneDisplay,
    ref: b.bookingRef ?? "",
  };
};

/** A sample booking for the owner's live preview and the test text. */
export const SAMPLE_BOOKING: SmsBookingFields = {
  customerName: "Jane Citizen",
  serviceName: "Cut & Blow Dry",
  stylistId: "sample",
  stylistName: "Steve",
  date: "2026-07-03",
  time: "10:30 AM",
  bookingRef: "SUA-1234",
};

// ── Length ───────────────────────────────────────────────────────────────────

// GSM 03.38 basic set; the extension set costs two characters each
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ " +
  "!\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

export interface SmsLength {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the network counts them */
  length: number;
  segments: number;
}

export const smsLength = (text: string): SmsLength => {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXTENDED.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: "GSM-7", length: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const length = text.length; // UTF-16 code units, which is how UCS-2 counts an emoji
  return { encoding: "UCS-2", length, segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67) };
};

// ── Phone ────────────────────────────────────────────────────────────────────

/** "0412345678" -> "+61412345678" (the form the provider wants); null if not an AU mobile. */
export const toInternationalMobile = (local: string): string | null =>
  SALON_CONFIG.phoneRegex.test(local) ? `+61${local.slice(1)}` : null;
