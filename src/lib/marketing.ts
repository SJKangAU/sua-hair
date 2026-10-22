// marketing.ts
// Whether a client has agreed to hear from the salon about coming back (FR-030, DEC-056). A
// booking confirmation is a service message the client needs; an invitation to return is
// marketing, so it is sent only to someone who has ticked the box (the booking form, the
// owner's walk-in form, or the owner recording it on their page), and every one carries an
// unsubscribe link that works. Consent is kept with its date and where it was given; the
// latest word wins, so someone who unsubscribes stays unsubscribed until they tick the box
// again. Clients imported from another system have no consent on record and are never sent
// a win-back until one is recorded. Pure - shared by the functions and the screens.

export type MarketingSource = "booking-form" | "walk-in" | "owner-recorded";

export interface MarketingFields {
  /** They have agreed, and have not unsubscribed since */
  marketingOptIn?: boolean;
  /** When they last agreed (ISO) */
  marketingConsentAt?: string;
  marketingSource?: MarketingSource;
  /** When they last unsubscribed (ISO); the latest of this and the consent decides */
  marketingOptOutAt?: string;
}

/** What a booking says about consent (the tick-box at the time it was made). */
export interface ConsentBooking {
  marketingConsent?: boolean;
  bookingType?: string;
  createdAt?: string;
}

/** A client was asked back no more than once in this many days. */
export const WIN_BACK_COOLDOWN_DAYS = 60;

const later = (a?: string, b?: string): string | undefined => (a && b ? (a > b ? a : b) : a || b);

/**
 * The consent a client record should carry: the latest explicit agreement (a booking made
 * with the box ticked, or one the owner recorded) unless they have unsubscribed since.
 * `manual` is what is stored on the client already.
 */
export const marketingStatus = (manual: MarketingFields, bookings: ConsentBooking[]): MarketingFields => {
  let at: string | undefined = manual.marketingOptIn ? manual.marketingConsentAt : undefined;
  let source: MarketingSource | undefined = manual.marketingOptIn ? manual.marketingSource : undefined;
  for (const b of bookings) {
    if (b.marketingConsent !== true || !b.createdAt) continue;
    if (!at || b.createdAt > at) {
      at = b.createdAt;
      source = b.bookingType === "walkin" ? "walk-in" : "booking-form";
    }
  }
  const optOut = manual.marketingOptOutAt;
  const optedIn = !!at && (!optOut || at > optOut);
  if (optedIn) return { marketingOptIn: true, marketingConsentAt: at, ...(source ? { marketingSource: source } : {}), ...(optOut ? { marketingOptOutAt: optOut } : {}) };
  return optOut ? { marketingOptOutAt: optOut } : {};
};

/** Both records of one person (a merge): the latest consent and the latest unsubscribe. */
export const mergeMarketing = (a: MarketingFields, b: MarketingFields): MarketingFields => {
  const bookings: ConsentBooking[] = [a, b]
    .filter((m) => m.marketingConsentAt)
    .map((m) => ({ marketingConsent: true, createdAt: m.marketingConsentAt, bookingType: m.marketingSource === "walk-in" ? "walkin" : "customer" }));
  const optOut = later(a.marketingOptOutAt, b.marketingOptOutAt);
  const owner = [a, b].find((m) => m.marketingSource === "owner-recorded" && m.marketingConsentAt);
  const out = marketingStatus({ ...(optOut ? { marketingOptOutAt: optOut } : {}) }, bookings);
  if (out.marketingOptIn && owner && owner.marketingConsentAt === out.marketingConsentAt) out.marketingSource = "owner-recorded";
  return out;
};

/** May this client be sent a win-back message right now (consent only: the rest is the caller's)? */
export const hasMarketingConsent = (c: MarketingFields): boolean =>
  c.marketingOptIn === true && !!c.marketingConsentAt && (!c.marketingOptOutAt || c.marketingConsentAt > c.marketingOptOutAt);

export const MARKETING_SOURCE_LABELS: Record<MarketingSource, string> = {
  "booking-form": "ticked the box when booking online",
  "walk-in": "agreed when booked in by the salon",
  "owner-recorded": "recorded by the owner",
};
