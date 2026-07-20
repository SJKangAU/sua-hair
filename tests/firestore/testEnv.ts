// tests/firestore/testEnv.ts
// ─────────────────────────────────────────────────────────────────────────
// Shared Firestore emulator harness for firestore.rules tests.
//
// Run via `npm run test:rules` / `npm run test:security`, which wrap
// `firebase emulators:exec` around vitest so a real (local, ephemeral)
// Firestore emulator backs every assertion — these are not unit tests of
// rule *syntax*, they replay the actual queries an attacker or the app
// would send and assert the emulator's real allow/deny decision.
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

export const PROJECT_ID = "sua-hair-rules-test";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8085;

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
    },
  });
}

/** A syntactically valid public customer booking matching isValidPublicBooking(). */
export function validPublicBooking(overrides: Record<string, unknown> = {}) {
  return {
    bookingType: "customer",
    status: "pending",
    customerName: "Jane Customer",
    customerNameLower: "jane customer",
    customerPhone: "0412345678",
    stylistId: "stylist-1",
    stylistName: "Alex Stylist",
    stylistLevel: "senior",
    serviceId: "svc-1",
    serviceName: "Colour + Cut",
    servicePrice: 180,
    activeTime: 45,
    restTime: 30,
    totalTime: 75,
    date: "2026-08-01",
    time: "10:00 AM",
    notes: "Prefers quiet chair by the window",
    bookingRef: "BK-20260801-stylist-1-1000",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The PII-free slotBlocks projection of the booking above. */
export function validSlotBlock(overrides: Record<string, unknown> = {}) {
  return {
    stylistId: "stylist-1",
    date: "2026-08-01",
    time: "10:00 AM",
    activeTime: 45,
    totalTime: 75,
    restTime: 30,
    status: "pending",
    ...overrides,
  };
}

export function validCustomerLookup(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jane Customer",
    lastVisit: "2026-08-01",
    visitCount: 3,
    ...overrides,
  };
}
