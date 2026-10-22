// icsEvent.ts
// A calendar event as an .ics file (FR-027): attached to the confirmation email so the
// appointment lands in the customer's calendar, and sent again with the same UID and a
// higher SEQUENCE when it moves, so their calendar updates the same event instead of
// adding a second. Times are written as UTC instants, which every calendar app reads the
// same way. Pure - no Firebase, no network.

export interface IcsEvent {
  /** Stable for the life of one appointment, across moves */
  uid: string;
  /** 0 for the first version; one more each time it changes */
  sequence: number;
  startMs: number;
  endMs: number;
  summary: string;
  description: string;
  location: string;
  /** "TENTATIVE" for a request still waiting for the salon, "CONFIRMED" once approved */
  status: "CONFIRMED" | "TENTATIVE";
  /** A reminder this long before the start (omitted for none) */
  alarmMinutesBefore?: number;
  /** When this version was made */
  stampMs: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** 1700000000000 -> "20231114T221320Z" */
export const icsTimestamp = (ms: number): string => {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
};

/** Text values: backslash, semicolon, comma and line breaks are escaped (RFC 5545 3.3.11). */
export const icsEscape = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded; a character is never split across lines. */
export const icsFold = (line: string): string => {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = " "; // a continuation line starts with one space
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
};

export const buildIcs = (e: IcsEvent): string => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sua Hair Studio//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(e.uid)}@suahair`,
    `SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`,
    `DTSTAMP:${icsTimestamp(e.stampMs)}`,
    `DTSTART:${icsTimestamp(e.startMs)}`,
    `DTEND:${icsTimestamp(e.endMs)}`,
    `SUMMARY:${icsEscape(e.summary)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    `LOCATION:${icsEscape(e.location)}`,
    `STATUS:${e.status}`,
    "TRANSP:OPAQUE",
  ];
  if (e.alarmMinutesBefore !== undefined && e.alarmMinutesBefore > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${icsEscape(e.summary)}`,
      `TRIGGER:-PT${Math.floor(e.alarmMinutesBefore)}M`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
};
