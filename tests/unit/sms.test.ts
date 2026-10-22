// tests/unit/sms.test.ts
// The text messages (FR-024, DEC-050): the default wording, the placeholders, what
// the owner's template editor accepts and rejects, how a message is filled in for a
// booking, and how many SMS segments it costs. Pure; no Firebase.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SMS_SETTINGS,
  DEFAULT_TEMPLATES,
  MAX_TEMPLATE_LENGTH,
  PLACEHOLDERS,
  SAMPLE_BOOKING,
  SMS_KINDS,
  effectiveSettings,
  isValidSenderName,
  renderSms,
  smsDate,
  smsLength,
  smsValuesFor,
  templateProblem,
  toInternationalMobile,
  unknownPlaceholders,
} from "../../src/lib/sms";

const SALON = { name: "Sua Hair Studio", phoneDisplay: "(03) 9569 0840" };
const sample = smsValuesFor(SAMPLE_BOOKING, SALON);

describe("the default messages", () => {
  it.each(SMS_KINDS)("%s: valid, plain GSM-7, and at most two segments filled in", (kind) => {
    expect(templateProblem(DEFAULT_TEMPLATES[kind])).toBeNull();
    const text = renderSms(DEFAULT_TEMPLATES[kind], sample);
    const length = smsLength(text);
    expect(length.encoding).toBe("GSM-7");
    expect(length.segments).toBeLessThanOrEqual(2);
    expect(text).not.toMatch(/[{}]/);
  });

  it("the request-received text says it is not confirmed yet (DEC-038)", () => {
    expect(renderSms(DEFAULT_TEMPLATES.received, sample)).toMatch(/isn't confirmed yet/);
    expect(renderSms(DEFAULT_TEMPLATES.confirmed, sample)).not.toMatch(/isn't confirmed/);
  });

  it("starts switched off, every message on", () => {
    expect(DEFAULT_SMS_SETTINGS.enabled).toBe(false);
    expect(Object.values(DEFAULT_SMS_SETTINGS.kinds).every(Boolean)).toBe(true);
  });
});

describe("templates", () => {
  it("fills every placeholder", () => {
    const text = renderSms(PLACEHOLDERS.map((p) => `{${p}}`).join("|"), sample);
    expect(text).toBe(
      "Jane|Cut & Blow Dry|Steve|Friday 3 July|10:30 AM|Sua Hair Studio|(03) 9569 0840|SUA-1234|https://suahair.com.au/manage?b=sample|" +
        "https://suahair.com.au|https://suahair.com.au/unsubscribe?c=sample|Friday 12 June",
    );
  });

  it("rejects an unknown placeholder, naming it", () => {
    expect(unknownPlaceholders("Hi {name}, your {servce} at {time} {x}")).toEqual(["servce", "x"]);
    expect(templateProblem("Hi {name}, {servce}")).toBe("Unknown placeholder: {servce}");
    expect(templateProblem("{a} {b}")).toBe("Unknown placeholders: {a}, {b}");
  });

  it("rejects an empty, over-long or unbalanced template", () => {
    expect(templateProblem("   ")).toMatch(/empty/);
    expect(templateProblem("x".repeat(MAX_TEMPLATE_LENGTH + 1))).toMatch(/or fewer/);
    expect(templateProblem("x".repeat(MAX_TEMPLATE_LENGTH))).toBeNull();
    expect(templateProblem("Hi {name")).toMatch(/stray/);
    expect(templateProblem("Hi name}")).toMatch(/stray/);
  });

  it("is safe with customer-supplied values: control characters and newlines go, long names are cut", () => {
    const values = { ...sample, name: "Jane\r\nEvil\u0007 text" };
    expect(renderSms("Hi {name}!", values)).toBe("Hi Jane Evil text!");
    expect(renderSms("Hi {name}!", { ...sample, name: "x".repeat(200) })).toBe(`Hi ${"x".repeat(80)}!`);
  });

  it("keeps the owner's own line breaks and tidies doubled spaces", () => {
    expect(renderSms("Hi {name},\nsee you {date}.  Bye", sample)).toBe("Hi Jane,\nsee you Friday 3 July. Bye");
  });
});

describe("what a booking becomes", () => {
  it("uses the first name, joins several services, and says 'our team' for any stylist", () => {
    const v = smsValuesFor(
      {
        customerName: "  Mary Ann  Smith ",
        services: [{ name: "Cut" }, { name: "Colour" }],
        stylistId: "any",
        stylistName: "Any available",
        date: "2026-12-04",
        time: "2:00 PM",
        bookingRef: "R1",
      },
      SALON,
    );
    expect(v).toMatchObject({ name: "Mary", service: "Cut + Colour", stylist: "our team", date: "Friday 4 December" });
  });

  it("copes with a missing name and service", () => {
    const v = smsValuesFor({ date: "2026-12-04", time: "9:00 AM", stylistName: "Elly" }, SALON);
    expect(v).toMatchObject({ name: "there", service: "appointment", stylist: "Elly" });
  });

  it("writes dates without a time zone: 2026-07-03 is a Friday everywhere", () => {
    expect(smsDate("2026-07-03")).toBe("Friday 3 July");
    expect(smsDate("2027-01-01")).toBe("Friday 1 January");
    expect(smsDate("not a date")).toBe("not a date");
  });
});

describe("length and segments", () => {
  it("counts GSM-7: 160 in one, then 153 per segment", () => {
    expect(smsLength("a".repeat(160))).toEqual({ encoding: "GSM-7", length: 160, segments: 1 });
    expect(smsLength("a".repeat(161))).toEqual({ encoding: "GSM-7", length: 161, segments: 2 });
    expect(smsLength("a".repeat(306)).segments).toBe(2);
    expect(smsLength("a".repeat(307)).segments).toBe(3);
    expect(smsLength("")).toEqual({ encoding: "GSM-7", length: 0, segments: 0 });
  });

  it("counts the extension characters twice", () => {
    expect(smsLength("{}[]")).toMatchObject({ encoding: "GSM-7", length: 8 });
    expect(smsLength("€".repeat(80))).toMatchObject({ encoding: "GSM-7", length: 160, segments: 1 });
    expect(smsLength("€".repeat(81)).segments).toBe(2);
  });

  it("switches to UCS-2 for a curly quote, a dash or an emoji, and then 70 / 67 per segment", () => {
    expect(smsLength("it’s").encoding).toBe("UCS-2");
    expect(smsLength("a – b").encoding).toBe("UCS-2");
    expect(smsLength("see you 💇")).toMatchObject({ encoding: "UCS-2", length: 10 }); // the emoji is 2 units
    expect(smsLength("’".repeat(70)).segments).toBe(1);
    expect(smsLength("’".repeat(71)).segments).toBe(2);
    expect(smsLength("’".repeat(134)).segments).toBe(2);
    expect(smsLength("’".repeat(135)).segments).toBe(3);
  });
});

describe("the invitation to come back (FR-030)", () => {
  it("always carries the way to stop it: the wording must include {unsubscribeLink}", () => {
    expect(templateProblem(DEFAULT_TEMPLATES.winback, "winback")).toBeNull();
    expect(templateProblem("Come back, {name}! {bookingLink}", "winback")).toBe(
      "This message must include {unsubscribeLink}, so people can stop it.",
    );
    // the other messages are not marketing and need no such link
    expect(templateProblem("Come back, {name}!", "reminder")).toBeNull();
  });

  it("a stored invitation without the link falls back to the default, so it can never be sent without one", () => {
    const s = effectiveSettings({ templates: { winback: "Come back, {name}! {bookingLink}" } });
    expect(s.templates.winback).toBe(DEFAULT_TEMPLATES.winback);
    const ok = effectiveSettings({ templates: { winback: "Hi {name}, book: {bookingLink} Stop: {unsubscribeLink}" } });
    expect(ok.templates.winback).toBe("Hi {name}, book: {bookingLink} Stop: {unsubscribeLink}");
  });

  it("fills the invitation's own placeholders", () => {
    const v = smsValuesFor(
      { customerName: "Jane Citizen", lastVisit: "2026-06-12", bookingLink: "https://x.test/book", unsubscribeLink: "https://x.test/u?c=1" },
      SALON,
    );
    expect(renderSms("Hi {name}, since {lastVisit}: {bookingLink} stop {unsubscribeLink}", v)).toBe(
      "Hi Jane, since Friday 12 June: https://x.test/book stop https://x.test/u?c=1",
    );
  });
});

describe("sender name", () => {
  it.each(["SuaHair", "Sua Hair", "ABC", "Sua12345678"])("accepts %s", (s) => {
    expect(isValidSenderName(s)).toBe(true);
  });
  it.each(["", "ab", "Sua Hair Studio", "Sua-Hair", "12345", "Sua!", "café"])("rejects %j", (s) => {
    expect(isValidSenderName(s)).toBe(false);
  });
});

describe("effectiveSettings: whatever is stored becomes complete, safe settings", () => {
  it("nothing stored -> the defaults, switched off", () => {
    expect(effectiveSettings(undefined)).toEqual(DEFAULT_SMS_SETTINGS);
    expect(effectiveSettings(null)).toEqual(DEFAULT_SMS_SETTINGS);
    expect(effectiveSettings("junk")).toEqual(DEFAULT_SMS_SETTINGS);
  });

  it("keeps what the owner set and fills in what is missing", () => {
    const s = effectiveSettings({
      enabled: true,
      senderName: " Sua Hair ",
      kinds: { reminder: false },
      templates: { confirmed: "Booked, {name}! {date} {time}" },
    });
    expect(s.enabled).toBe(true);
    expect(s.senderName).toBe("Sua Hair");
    expect(s.kinds).toEqual({ received: true, confirmed: true, not_confirmed: true, reminder: false, winback: true });
    expect(s.templates.confirmed).toBe("Booked, {name}! {date} {time}");
    expect(s.templates.received).toBe(DEFAULT_TEMPLATES.received);
  });

  it("never lets a broken template or sender name reach a client", () => {
    const s = effectiveSettings({
      enabled: true,
      senderName: "no way!!",
      templates: { received: "Hi {nmae}", confirmed: "", reminder: 42 },
    });
    expect(s.senderName).toBe("SuaHair");
    expect(s.templates).toEqual(DEFAULT_TEMPLATES);
  });

  it("only a true boolean switches texts on", () => {
    expect(effectiveSettings({ enabled: "true" }).enabled).toBe(false);
    expect(effectiveSettings({ enabled: 1 }).enabled).toBe(false);
  });
});

describe("the number", () => {
  it("turns an Australian mobile into +61 form", () => {
    expect(toInternationalMobile("0412345678")).toBe("+61412345678");
    expect(toInternationalMobile("0312345678")).toBeNull();
    expect(toInternationalMobile("+61412345678")).toBeNull(); // callers pass the local form
    expect(toInternationalMobile("")).toBeNull();
  });
});
