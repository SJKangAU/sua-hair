// tests/unit/emailEvents.test.ts
// Which email each booking change sends (DEC-038): "pending" is REQUEST RECEIVED,
// and "confirmed" is only ever sent on approval.
import { describe, expect, it } from "vitest";
import {
  emailKindOnCreate,
  emailKindOnUpdate,
  idempotencyKey,
} from "../../functions/src/emailEvents";
import {
  buildConfirmationEmail,
  buildNotConfirmedEmail,
  buildRequestReceivedEmail,
  type BookingEmailData,
} from "../../functions/src/email/templates";

const booking: BookingEmailData = {
  customerName: "Jane Citizen",
  stylistId: "steve",
  stylistName: "Steve Hwang",
  serviceName: "Men's Cut",
  services: [{ name: "Men's Cut", price: 75 }],
  servicePrice: 75,
  date: "2026-12-03",
  time: "10:00 AM",
  bookingRef: "BK-20261203-steve-1000",
};

describe("emailKindOnCreate", () => {
  it("an online request gets 'received', never 'confirmed'", () => {
    expect(emailKindOnCreate({ bookingType: "customer", status: "pending" })).toBe("received");
  });
  it("a walk-in created confirmed gets the confirmation", () => {
    expect(emailKindOnCreate({ bookingType: "walkin", status: "confirmed" })).toBe("confirmed");
  });
  it("breaks and training blocks get nothing", () => {
    expect(emailKindOnCreate({ bookingType: "break", status: "confirmed" })).toBeNull();
    expect(emailKindOnCreate({ bookingType: "training", status: "confirmed" })).toBeNull();
  });
});

describe("emailKindOnUpdate", () => {
  const customer = (before: string, after: string) =>
    emailKindOnUpdate({ bookingType: "customer", status: before }, { bookingType: "customer", status: after });

  it("approval (pending -> confirmed) sends the confirmation", () => {
    expect(customer("pending", "confirmed")).toBe("confirmed");
  });
  it("a declined or expired request (pending -> cancelled) says it was not confirmed", () => {
    expect(customer("pending", "cancelled")).toBe("not_confirmed");
  });
  it("nothing else sends: arrival, completion, a confirmed booking cancelled, a restore, a no-change write", () => {
    expect(customer("confirmed", "arrived")).toBeNull();
    expect(customer("arrived", "completed")).toBeNull();
    expect(customer("confirmed", "cancelled")).toBeNull();
    expect(customer("cancelled", "pending")).toBeNull();
    expect(customer("cancelled", "confirmed")).toBeNull();
    expect(customer("pending", "pending")).toBeNull();
  });
  it("never for a break", () => {
    expect(emailKindOnUpdate({ bookingType: "break", status: "pending" }, { bookingType: "break", status: "confirmed" })).toBeNull();
  });
});

describe("idempotencyKey", () => {
  it("is stable per kind and booking, and different between kinds", () => {
    expect(idempotencyKey("confirmed", "abc")).toBe("confirmed-abc");
    expect(idempotencyKey("received", "abc")).not.toBe(idempotencyKey("confirmed", "abc"));
  });
});

describe("the wording", () => {
  const received = buildRequestReceivedEmail(booking);
  const confirmed = buildConfirmationEmail(booking);
  const notConfirmed = buildNotConfirmedEmail(booking);

  it("'request received' never says the booking is confirmed", () => {
    for (const part of [received.subject, received.html, received.text]) {
      expect(part).not.toMatch(/is confirmed|are confirmed|booking confirmed/i);
    }
    expect(received.subject).toMatch(/have your booking request/i);
    expect(received.text).toMatch(/not a confirmation yet/i);
    expect(received.text).toContain("Steve Hwang");
    expect(received.text).toContain("Price: $75");
  });

  it("'confirmed' is the only one that says confirmed", () => {
    expect(confirmed.text).toMatch(/Your booking is confirmed/);
  });

  it("'not confirmed' says the time is no longer held and never says confirmed", () => {
    expect(notConfirmed.subject).toMatch(/couldn't confirm/i);
    expect(notConfirmed.text).toMatch(/no longer being held/i);
    expect(notConfirmed.text).not.toMatch(/is confirmed/i);
  });
});
