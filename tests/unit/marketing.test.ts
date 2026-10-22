// tests/unit/marketing.test.ts
// Who has agreed to hear from the salon about coming back (FR-030, DEC-056): the latest
// explicit agreement wins unless they have unsubscribed since, a booking made with the box
// ticked is a consent, an import is not, and two records of one person merge to the latest
// word. Pure.
import { describe, expect, it } from "vitest";
import { hasMarketingConsent, marketingStatus, mergeMarketing, WIN_BACK_COOLDOWN_DAYS } from "../../src/lib/marketing";

const T1 = "2026-06-01T10:00:00.000Z";
const T2 = "2026-07-01T10:00:00.000Z";
const T3 = "2026-08-01T10:00:00.000Z";

describe("marketingStatus", () => {
  it("nobody has agreed unless a booking was made with the box ticked, or the owner recorded it", () => {
    expect(marketingStatus({}, [])).toEqual({});
    expect(marketingStatus({}, [{ createdAt: T1, bookingType: "customer" }, { marketingConsent: false, createdAt: T2 }])).toEqual({});
    // a record from an import carries no consent
    expect(marketingStatus({ marketingOptIn: false }, [])).toEqual({});
  });

  it("a booking made with the box ticked is a consent, remembered with its date and where it was given", () => {
    expect(marketingStatus({}, [{ marketingConsent: true, createdAt: T1, bookingType: "customer" }])).toEqual({
      marketingOptIn: true,
      marketingConsentAt: T1,
      marketingSource: "booking-form",
    });
    expect(marketingStatus({}, [{ marketingConsent: true, createdAt: T1, bookingType: "walkin" }])).toMatchObject({ marketingSource: "walk-in" });
  });

  it("the latest agreement is the one kept", () => {
    const s = marketingStatus({}, [
      { marketingConsent: true, createdAt: T1, bookingType: "customer" },
      { marketingConsent: true, createdAt: T3, bookingType: "walkin" },
      { marketingConsent: true, createdAt: T2, bookingType: "customer" },
    ]);
    expect(s).toMatchObject({ marketingConsentAt: T3, marketingSource: "walk-in" });
  });

  it("the owner's record counts, and a later booking with the box ticked replaces it", () => {
    const owner = { marketingOptIn: true, marketingConsentAt: T1, marketingSource: "owner-recorded" as const };
    expect(marketingStatus(owner, [])).toEqual(owner);
    expect(marketingStatus(owner, [{ marketingConsent: true, createdAt: T2, bookingType: "customer" }])).toMatchObject({
      marketingConsentAt: T2,
      marketingSource: "booking-form",
    });
  });

  it("an unsubscribe after the agreement ends it, and it stays ended until they agree again", () => {
    const booking = { marketingConsent: true, createdAt: T1, bookingType: "customer" };
    expect(marketingStatus({ marketingOptOutAt: T2 }, [booking])).toEqual({ marketingOptOutAt: T2 });
    // booking again without the box ticked does not bring it back
    expect(marketingStatus({ marketingOptOutAt: T2 }, [booking, { createdAt: T3 }])).toEqual({ marketingOptOutAt: T2 });
    // ticking it again does
    expect(marketingStatus({ marketingOptOutAt: T2 }, [booking, { marketingConsent: true, createdAt: T3, bookingType: "customer" }])).toEqual({
      marketingOptIn: true,
      marketingConsentAt: T3,
      marketingSource: "booking-form",
      marketingOptOutAt: T2,
    });
  });

  it("an unsubscribe also ends a consent the owner recorded earlier", () => {
    expect(marketingStatus({ marketingOptIn: true, marketingConsentAt: T1, marketingSource: "owner-recorded", marketingOptOutAt: T2 }, [])).toEqual({ marketingOptOutAt: T2 });
  });
});

describe("hasMarketingConsent", () => {
  it("is true only for an agreement that has not been withdrawn", () => {
    expect(hasMarketingConsent({})).toBe(false);
    expect(hasMarketingConsent({ marketingOptIn: true })).toBe(false); // no date: not a recorded consent
    expect(hasMarketingConsent({ marketingOptIn: true, marketingConsentAt: T1 })).toBe(true);
    expect(hasMarketingConsent({ marketingOptIn: true, marketingConsentAt: T1, marketingOptOutAt: T2 })).toBe(false);
    expect(hasMarketingConsent({ marketingOptIn: true, marketingConsentAt: T3, marketingOptOutAt: T2 })).toBe(true);
    expect(hasMarketingConsent({ marketingOptOutAt: T2 })).toBe(false);
  });
});

describe("mergeMarketing: two records of one person", () => {
  it("keeps the latest agreement, and its source", () => {
    expect(
      mergeMarketing(
        { marketingOptIn: true, marketingConsentAt: T1, marketingSource: "booking-form" },
        { marketingOptIn: true, marketingConsentAt: T2, marketingSource: "owner-recorded" },
      ),
    ).toEqual({ marketingOptIn: true, marketingConsentAt: T2, marketingSource: "owner-recorded" });
  });

  it("an unsubscribe on either record outranks an older agreement on the other", () => {
    expect(mergeMarketing({ marketingOptIn: true, marketingConsentAt: T1, marketingSource: "booking-form" }, { marketingOptOutAt: T2 })).toEqual({ marketingOptOutAt: T2 });
  });

  it("a later agreement on either record outranks an earlier unsubscribe", () => {
    expect(mergeMarketing({ marketingOptOutAt: T1 }, { marketingOptIn: true, marketingConsentAt: T2, marketingSource: "booking-form" })).toEqual({
      marketingOptIn: true,
      marketingConsentAt: T2,
      marketingSource: "booking-form",
      marketingOptOutAt: T1,
    });
  });

  it("nothing on either is nothing", () => {
    expect(mergeMarketing({}, {})).toEqual({});
  });
});

describe("the cool-down", () => {
  it("a client is asked back at most once in a couple of months", () => {
    expect(WIN_BACK_COOLDOWN_DAYS).toBe(60);
  });
});
