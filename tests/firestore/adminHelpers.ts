// tests/firestore/adminHelpers.ts
// Shared builders for the admin-write emulator tests (adminBookings.test.ts,
// adminSlotClaims.test.ts): a modular Firestore bound to a signed-in staff
// account with the real security rules enforced, and booking factories.
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import type { Booking } from "../../src/types";
import { validSlotBlock } from "./testEnv";

export const DATE = "2026-12-01"; // a Tuesday
export const STYLIST = "stylist-steve";

type CompatDb = { _delegate: Firestore };

/** The rules-unit-testing context hands out a compat Firestore; its
 *  `_delegate` is the modular one the app code is written against. */
export function staffDb(env: RulesTestEnvironment, uid = "staff-1"): Firestore {
  return (env.authenticatedContext(uid).firestore() as unknown as CompatDb)
    ._delegate;
}

export function anonDb(env: RulesTestEnvironment): Firestore {
  return (env.unauthenticatedContext().firestore() as unknown as CompatDb)
    ._delegate;
}

export function walkin(overrides: Partial<Booking> = {}): Omit<Booking, "id"> {
  return {
    bookingType: "walkin",
    status: "confirmed",
    customerName: "Walk In",
    customerNameLower: "walk in",
    customerPhone: "",
    stylistId: STYLIST,
    stylistName: "Steve",
    stylistLevel: "director",
    serviceId: "cut",
    serviceName: "Cut",
    servicePrice: 90,
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
    date: DATE,
    time: "10:00 AM",
    createdAt: "2026-11-30T00:00:00.000Z",
    ...overrides,
  };
}

export function breakBlock(
  overrides: Partial<Booking> = {},
): Omit<Booking, "id"> {
  return walkin({
    bookingType: "break",
    customerName: "Break",
    serviceId: "break",
    serviceName: "Lunch",
    servicePrice: 0,
    blockReason: "Lunch",
    activeTime: 30,
    totalTime: 30,
    ...overrides,
  });
}

/** Seed an existing booking + its slotBlock, bypassing rules. */
export async function seed(
  env: RulesTestEnvironment,
  id: string,
  overrides: Partial<Booking> = {},
): Promise<void> {
  const b = walkin({ customerName: "Existing Client", ...overrides });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`bookings/${id}`).set(b);
    await ctx.firestore().doc(`slotBlocks/${id}`).set(validSlotBlock(b));
  });
}
