// tests/unit/icsEvent.test.ts
// The calendar file attached to the confirmation (FR-027): a valid iCalendar event whose
// UID stays the same across moves while its SEQUENCE goes up, escaped and folded as the
// standard requires, with times as UTC instants. Pure.
import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold, icsTimestamp, type IcsEvent } from "../../src/lib/icsEvent";

const event: IcsEvent = {
  uid: "abc123",
  sequence: 0,
  startMs: Date.UTC(2026, 11, 2, 23, 0, 0), // 3 Dec 10:00 Melbourne = 2 Dec 23:00 UTC
  endMs: Date.UTC(2026, 11, 3, 0, 0, 0),
  summary: "Cut with Steve — Sua Hair Studio",
  description: "Stylist: Steve\nPhone: (03) 9569 0840",
  location: "Glen Waverley, VIC",
  status: "CONFIRMED",
  alarmMinutesBefore: 1440,
  stampMs: Date.UTC(2026, 11, 1, 0, 0, 0),
};

describe("icsTimestamp", () => {
  it("writes a UTC instant as YYYYMMDDTHHMMSSZ", () => {
    expect(icsTimestamp(Date.UTC(2026, 11, 2, 23, 5, 9))).toBe("20261202T230509Z");
    expect(icsTimestamp(Date.UTC(2027, 0, 1, 0, 0, 0))).toBe("20270101T000000Z");
  });
});

describe("icsEscape", () => {
  it("escapes backslash, semicolon, comma and line breaks", () => {
    expect(icsEscape("a;b,c\\d\ne\r\nf")).toBe("a\\;b\\,c\\\\d\\ne\\nf");
  });
});

describe("icsFold", () => {
  it("leaves a short line alone and folds a long one at 75 octets with a leading space", () => {
    expect(icsFold("short")).toBe("short");
    const folded = icsFold("X".repeat(200)).split("\r\n");
    expect(folded[0]).toHaveLength(75);
    expect(folded.slice(1).every((l) => l.startsWith(" ") && l.length <= 75)).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe("X".repeat(200));
  });

  it("never splits a multi-byte character", () => {
    const line = "SUMMARY:" + "—".repeat(60); // an em dash is 3 octets
    const parts = icsFold(line).split("\r\n");
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(line);
  });
});

describe("buildIcs", () => {
  const ics = buildIcs(event);
  const lines = ics.replace(/\r\n /g, "").split("\r\n");

  it("is a complete calendar with CRLF line ends and a closing line break", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("END:VEVENT");
    expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("carries the times as UTC, the status and the escaped text", () => {
    expect(lines).toContain("DTSTART:20261202T230000Z");
    expect(lines).toContain("DTEND:20261203T000000Z");
    expect(lines).toContain("DTSTAMP:20261201T000000Z");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines).toContain("SUMMARY:Cut with Steve — Sua Hair Studio");
    expect(lines).toContain("DESCRIPTION:Stylist: Steve\\nPhone: (03) 9569 0840");
    expect(lines).toContain("LOCATION:Glen Waverley\\, VIC");
  });

  it("keeps the UID stable and raises the SEQUENCE when the appointment moves", () => {
    const moved = buildIcs({ ...event, sequence: 1, startMs: event.startMs + 86_400_000, endMs: event.endMs + 86_400_000 });
    expect(lines).toContain("UID:abc123@suahair");
    expect(lines).toContain("SEQUENCE:0");
    const m = moved.replace(/\r\n /g, "").split("\r\n");
    expect(m).toContain("UID:abc123@suahair");
    expect(m).toContain("SEQUENCE:1");
    expect(m).toContain("DTSTART:20261203T230000Z");
  });

  it("a request still waiting for the salon is TENTATIVE", () => {
    expect(buildIcs({ ...event, status: "TENTATIVE" })).toContain("STATUS:TENTATIVE");
  });

  it("adds a reminder before the start, or none", () => {
    expect(lines).toContain("TRIGGER:-PT1440M");
    expect(buildIcs({ ...event, alarmMinutesBefore: undefined })).not.toContain("VALARM");
  });

  it("a hostile title cannot inject a property", () => {
    const hostile = buildIcs({ ...event, summary: "x\r\nBEGIN:VALARM\r\nACTION:EMAIL" }).replace(/\r\n /g, "").split("\r\n");
    expect(hostile.filter((l) => l === "BEGIN:VALARM")).toHaveLength(1); // only ours
    expect(hostile.some((l) => l === "ACTION:EMAIL")).toBe(false);
  });
});
