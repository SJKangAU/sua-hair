// functions/src/limits.ts
// Rate limiting for the public callables (createBookingRequest, joinWaitlist).
//
// A fixed window per key, counted in a transaction on rateLimits/{key:window}.
// The key is a SHA-256 of the phone number or IP address, so the collection holds
// no personal data. Documents carry `expireAt` (a Timestamp) - turn on a TTL policy
// for the `rateLimits` collection group's `expireAt` field (docs/DEPLOYMENT.md) and
// Firestore removes them; until then they are tiny and harmless. The collection has
// no security rule, so no client can read or write it.
//
// Attempts are counted whether or not the request goes on to succeed: the point is
// to blunt scripts that probe slots or hammer the form.

import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { CommandError } from "./commandErrors";

export interface Limit {
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const LIMITS = {
  // Attempts, not successes. A shared salon Wi-Fi can put many real customers
  // behind one address, so the per-address allowance is generous; the per-phone one
  // is what stops one person hammering the form.
  bookingPerIp: { max: 30, windowMs: HOUR },
  bookingPerPhone: { max: 8, windowMs: HOUR },
  waitlistPerIp: { max: 20, windowMs: HOUR },
  waitlistPerPhone: { max: 5, windowMs: 24 * HOUR },
  // Texts cost money. A number gets a handful a day (a request, a confirmation, a
  // reminder, and room for a rebooking), the salon as a whole a ceiling that a
  // runaway loop or a flood of fake requests cannot get past, and the owner's
  // "send a test" button a few an hour.
  smsPerPhone: { max: 6, windowMs: 24 * HOUR },
  smsPerDay: { max: 400, windowMs: 24 * HOUR },
  smsTestPerHour: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, Limit>;

export const hashKey = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * Count one attempt for `scope:value` and throw CommandError("rate-limited") if the
 * window's allowance is already used up.
 */
export const consumeRateLimit = async (
  db: Firestore,
  scope: string,
  value: string,
  limit: Limit,
  now: number,
): Promise<void> => {
  const window = Math.floor(now / limit.windowMs);
  const ref = db.doc(`rateLimits/${scope}-${hashKey(value)}-${window}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = (snap.get("count") as number | undefined) ?? 0;
    if (count >= limit.max) return false;
    tx.set(ref, {
      count: count + 1,
      scope,
      expireAt: Timestamp.fromMillis((window + 2) * limit.windowMs),
    });
    return true;
  });
  if (!allowed) {
    throw new CommandError(
      "rate-limited",
      "Too many attempts. Please wait a little while, or call the salon.",
    );
  }
};
