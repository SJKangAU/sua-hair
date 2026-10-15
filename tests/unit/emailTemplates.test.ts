// tests/unit/emailTemplates.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Unit tests for the pure email builders in functions/src/email/templates.ts.
// The functions package has no test runner of its own; these modules have no
// firebase imports on purpose so the root vitest suite can exercise them.
import { describe, expect, it } from "vitest";
import {
  buildConfirmationEmail,
  buildOwnerNotification,
  buildReminderEmail,
  escapeHtml,
  firstName,
  formatLongDate,
  type BookingEmailData,
} from "../../functions/src/email/templates";

const booking: BookingEmailData = {
  customerName: "Jane Citizen",
  stylistId: "stylist-1",
  stylistName: "Alex Kim",
  serviceName: "Cut + Colour",
  services: [{ name: "Cut" }, { name: "Colour" }],
  servicePrice: 180,
  date: "2026-07-03",
  time: "10:30 AM",
  bookingRef: "BK-20260703-stylist-1-1030",
};

describe("formatLongDate", () => {
  it("formats as 'Friday 3 July' regardless of server timezone", () => {
    expect(formatLongDate("2026-07-03")).toBe("Friday 3 July");
    expect(formatLongDate("2026-12-31")).toBe("Thursday 31 December");
    expect(formatLongDate("2026-01-01")).toBe("Thursday 1 January");
  });

  it("returns malformed input unchanged", () => {
    expect(formatLongDate("tomorrow")).toBe("tomorrow");
  });
});

describe("firstName", () => {
  it("takes the first whitespace-separated token", () => {
    expect(firstName("  Jane   Citizen ")).toBe("Jane");
  });
  it("falls back to a neutral greeting for an empty name", () => {
    expect(firstName("   ")).toBe("there");
  });
});

describe("buildConfirmationEmail", () => {
  const email = buildConfirmationEmail(booking);

  it("personalises the headline and includes every booking detail", () => {
    expect(email.html).toContain("We look forward to seeing you, Jane");
    for (const fragment of [
      "Alex Kim",
      "Cut",
      "Colour",
      "Friday 3 July",
      "10:30 AM",
      "$180",
      "(03) 9569 0840",
      "Need to change your booking?",
    ]) {
      expect(email.html).toContain(fragment);
      expect(email.text).toContain(fragment);
    }
  });

  it("uses the monochrome palette with an outlined (not filled) button", () => {
    expect(email.html).toContain("#faf9f7");
    expect(email.html).toContain("border:1px solid #111111");
    expect(email.html).not.toMatch(/background(-color)?:\s*#111/i);
  });

  it("prefixes the price with 'from' for any-available-stylist bookings", () => {
    const anyStylist = buildConfirmationEmail({
      ...booking,
      stylistId: "any",
      stylistName: "Any available stylist",
    });
    expect(anyStylist.text).toContain("Price: from $180");
  });

  it("escapes customer-supplied HTML", () => {
    const hostile = buildConfirmationEmail({
      ...booking,
      customerName: '<script>alert("x")</script> Mallory',
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
  });
});

describe("buildReminderEmail", () => {
  it("uses the reminder copy", () => {
    const email = buildReminderEmail(booking);
    expect(email.html).toContain("A reminder of your appointment tomorrow");
    expect(email.subject).toContain("reminder");
    expect(email.text).toContain("Friday 3 July");
  });
});

describe("buildOwnerNotification", () => {
  it("is plain text carrying the customer's contact details", () => {
    const n = buildOwnerNotification({
      ...booking,
      customerPhone: "0412345678",
      customerEmail: "jane@example.com",
      notes: "Bringing a reference photo",
    });
    expect(n.subject).toBe(
      "New booking: Jane Citizen — Friday 3 July 10:30 AM",
    );
    expect(n.text).toContain("Phone: 0412345678");
    expect(n.text).toContain("Email: jane@example.com");
    expect(n.text).toContain("Notes: Bringing a reference photo");
    expect(n.text).not.toContain("<");
  });

  it("omits absent optional fields and keeps the subject on one line", () => {
    const n = buildOwnerNotification({
      ...booking,
      customerName: "Jane\r\nBcc: attacker@example.com",
    });
    expect(n.subject).not.toMatch(/[\r\n]/);
    expect(n.text).not.toContain("Email:");
    expect(n.text).not.toContain("Notes:");
  });
});

describe("escapeHtml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});
