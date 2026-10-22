// tests/unit/emailRender.test.ts
// The editable booking emails (FR-027, DEC-053): the default wording is the wording the
// emails always had, the owner's edits go through placeholders safely, a broken stored
// document never sends a broken email, and the switches do what they say. Pure.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_LIMITS,
  effectiveEmailSettings,
  emailTemplateProblems,
  renderEmail,
  type EmailBookingData,
  type EmailSalon,
  type EmailTemplate,
} from "../../src/lib/emailRender";
import { SMS_KINDS } from "../../src/lib/sms";

const SALON: EmailSalon = {
  name: "Sua Hair Studio",
  address: "Glen Waverley, VIC",
  phoneDisplay: "(03) 9569 0840",
  phoneHref: "tel:0395690840",
};

const booking: EmailBookingData = {
  customerName: "Jane Citizen",
  stylistId: "stylist-1",
  stylistName: "Alex Kim",
  serviceName: "Cut + Colour",
  services: [{ name: "Cut" }, { name: "Colour" }],
  servicePrice: 180,
  date: "2026-07-03",
  time: "10:30 AM",
  bookingRef: "BK-1",
};

const confirmed = DEFAULT_EMAIL_TEMPLATES.confirmed;
const render = (over: Partial<EmailTemplate> = {}, b: EmailBookingData = booking) =>
  renderEmail({ ...confirmed, ...over }, b, SALON);

describe("the default wording is what the emails always said", () => {
  it.each(SMS_KINDS)("%s: valid, on, with every part showing", (kind) => {
    const t = DEFAULT_EMAIL_TEMPLATES[kind];
    expect(emailTemplateProblems(t)).toEqual({});
    expect(t).toMatchObject({ enabled: true, showDetails: true, showReference: true, callButton: true });
  });

  it("confirmed", () => {
    const e = render();
    expect(e.subject).toBe("Your booking at Sua Hair Studio — Friday 3 July");
    expect(e.html).toContain("We look forward to seeing you, Jane");
    expect(e.html).toContain("Your booking is confirmed. Here are the details.");
    expect(e.html).toContain("Need to change your booking? Call us on (03) 9569 0840.");
    expect(e.html).toContain("Friday 3 July at 10:30 AM with Alex Kim.");
    expect(e.text).toContain("Price: $180");
    expect(e.text).toContain("Reference BK-1");
  });

  it("the request-received email still says it is not a confirmation yet (DEC-038)", () => {
    const e = renderEmail(DEFAULT_EMAIL_TEMPLATES.received, booking, SALON);
    expect(e.subject).toBe("We have your booking request — Sua Hair Studio");
    expect(e.html).toContain("This is not a confirmation yet.");
    expect(e.html).toContain("Thank you, Jane — we have your request");
  });

  it("not confirmed and reminder", () => {
    expect(renderEmail(DEFAULT_EMAIL_TEMPLATES.not_confirmed, booking, SALON).subject).toBe(
      "We couldn't confirm your booking request — Sua Hair Studio",
    );
    const r = renderEmail(DEFAULT_EMAIL_TEMPLATES.reminder, booking, SALON);
    expect(r.subject).toBe("A reminder of your appointment tomorrow — Sua Hair Studio");
    expect(r.html).toContain("Hello Jane — we look forward to seeing you.");
  });
});

describe("the owner's own wording", () => {
  it("fills every placeholder in every field", () => {
    const e = render({
      subject: "{name}: {service} on {date}",
      preheader: "{time} with {stylist} at {salon}",
      headline: "See you, {name}!",
      intro: "Booked: {service} with {stylist}, {date} at {time}. Ref {ref}.",
      closing: "Call {phone} to change it.",
    });
    expect(e.subject).toBe("Jane: Cut + Colour on Friday 3 July");
    expect(e.html).toContain("10:30 AM with Alex Kim at Sua Hair Studio");
    expect(e.html).toContain("See you, Jane!");
    expect(e.html).toContain("Booked: Cut + Colour with Alex Kim, Friday 3 July at 10:30 AM. Ref BK-1.");
    expect(e.html).toContain("Call (03) 9569 0840 to change it.");
    expect(e.text).toContain("Call (03) 9569 0840 to change it.");
  });

  it("keeps the paragraph breaks the owner typed, in HTML and plain text", () => {
    const e = render({ intro: "First line.\nSecond line." });
    expect(e.html).toContain("First line.<br>Second line.");
    expect(e.text).toContain("First line.\nSecond line.");
  });

  it("escapes a hostile customer name everywhere, and a header cannot be injected through the subject", () => {
    const hostile: EmailBookingData = { ...booking, customerName: '<script>alert("x")</script>\r\nBcc: a@b.test' };
    const e = render({ subject: "Hi {name}" }, hostile);
    expect(e.html).not.toContain("<script>");
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.html).not.toMatch(/<script/i);
  });

  it("escapes HTML the owner typed too: wording is text, never markup", () => {
    const e = render({ intro: "<b>Bold</b> & <img src=x onerror=alert(1)>" });
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp;");
  });
});

describe("the switches", () => {
  it("details off removes the table (and its rules) but keeps the words", () => {
    const e = render({ showDetails: false });
    expect(e.html).not.toContain("Stylist</td>");
    expect(e.html).not.toContain("$180");
    expect(e.text).not.toContain("Price:");
    expect(e.html).toContain("Your booking is confirmed.");
  });

  it("reference off removes the reference", () => {
    const e = render({ showReference: false });
    expect(e.html).not.toContain("BK-1");
    expect(e.text).not.toContain("BK-1");
  });

  it("call button off removes the button but not the phone number in the wording", () => {
    const e = render({ callButton: false });
    expect(e.html).not.toContain("tel:0395690840");
    expect(e.html).toContain("Call us on (03) 9569 0840");
  });

  it("an any-available-stylist booking says 'from' before the price and 'our team' in the wording", () => {
    const any = render({ preheader: "With {stylist}" }, { ...booking, stylistId: "any", stylistName: "Any available stylist" });
    expect(any.text).toContain("Price: from $180");
    expect(any.html).toContain("With our team");
  });
});

describe("problems with wording", () => {
  it("names an unknown placeholder, an empty field, a long one, a stray brace and a line break in a one-line field", () => {
    const p = emailTemplateProblems({
      ...confirmed,
      subject: "Hi {nmae}",
      preheader: "   ",
      headline: "x".repeat(EMAIL_LIMITS.headline + 1),
      intro: "oops {name",
      closing: "ok",
    });
    expect(p.subject).toBe("Unknown placeholder: {nmae}");
    expect(p.preheader).toMatch(/empty/);
    expect(p.headline).toMatch(/or fewer/);
    expect(p.intro).toMatch(/stray/);
    expect(p.closing).toBeUndefined();
    expect(emailTemplateProblems({ ...confirmed, subject: "a\nb" }).subject).toMatch(/one line/);
    expect(emailTemplateProblems({ ...confirmed, intro: "a\nb" }).intro).toBeUndefined(); // an opening message may have paragraphs
  });
});

describe("effectiveEmailSettings: whatever is stored becomes complete, safe settings", () => {
  it("nothing stored -> the defaults for all four", () => {
    for (const raw of [undefined, null, "junk", 5, {}, { templates: "x" }]) {
      expect(effectiveEmailSettings(raw).templates).toEqual(DEFAULT_EMAIL_TEMPLATES);
    }
  });

  it("keeps what the owner set and fills in the rest, field by field", () => {
    const s = effectiveEmailSettings({
      templates: { confirmed: { headline: "Welcome, {name}", showReference: false, enabled: false } },
    });
    expect(s.templates.confirmed).toMatchObject({
      headline: "Welcome, {name}",
      showReference: false,
      enabled: false,
      subject: confirmed.subject,
      showDetails: true,
    });
    expect(s.templates.reminder).toEqual(DEFAULT_EMAIL_TEMPLATES.reminder);
  });

  it("a broken field falls back to its default and never reaches a customer; the good fields stay", () => {
    const s = effectiveEmailSettings({
      templates: { confirmed: { subject: "Hi {nmae}", intro: "", headline: "Hello {name}", closing: 7, enabled: "yes" } },
    });
    expect(s.templates.confirmed.subject).toBe(confirmed.subject);
    expect(s.templates.confirmed.intro).toBe(confirmed.intro);
    expect(s.templates.confirmed.closing).toBe(confirmed.closing);
    expect(s.templates.confirmed.headline).toBe("Hello {name}");
    expect(s.templates.confirmed.enabled).toBe(true); // only a real boolean changes it
  });
});
