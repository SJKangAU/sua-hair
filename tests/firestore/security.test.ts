// tests/firestore/security.test.ts
// ─────────────────────────────────────────────────────────────────────────
// "Public responses never contain PII" evidence — run via
// `npm run test:security`. These tests replay the exact queries an
// anonymous attacker (or the public booking calendar) can send against
// the real Firestore emulator and assert on the *documents actually
// returned*, not just allow/deny outcomes.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  createTestEnv,
  validCustomerLookup,
  validPublicBooking,
  validSlotBlock,
} from "./testEnv";

const PII_FIELDS = [
  "customerName",
  "customerNameLower",
  "customerPhone",
  "notes",
  "servicePrice",
  "bookingRef",
  "traineeName",
  "flagReason",
];

const ALLOWED_SLOT_BLOCK_FIELDS = new Set([
  "stylistId",
  "date",
  "time",
  "activeTime",
  "totalTime",
  "restTime",
  "status",
]);

let testEnv: RulesTestEnvironment;
const KNOWN_PHONE = "0412345678";
const KNOWN_DATE = "2026-08-01";

beforeAll(async () => {
  testEnv = await createTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .doc("bookings/bk-1")
      .set(
        validPublicBooking({ customerPhone: KNOWN_PHONE, date: KNOWN_DATE }),
      );
    await ctx
      .firestore()
      .doc("slotBlocks/bk-1")
      .set(validSlotBlock({ date: KNOWN_DATE }));
    await ctx
      .firestore()
      .doc(`customerLookups/${KNOWN_PHONE}`)
      .set(validCustomerLookup());
  });
});

describe("public availability never leaks customer identity", () => {
  it("returns only the 7 allow-listed, PII-free fields from slotBlocks", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const snap = await anon
      .collection("slotBlocks")
      .where("stylistId", "==", "stylist-1")
      .get();

    expect(snap.empty).toBe(false);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const keys = Object.keys(data);
      // Every field on every returned document must be in the allow-list.
      for (const key of keys) {
        expect(ALLOWED_SLOT_BLOCK_FIELDS.has(key)).toBe(true);
      }
      // Explicitly assert no PII field ever rides along.
      for (const piiField of PII_FIELDS) {
        expect(data[piiField]).toBeUndefined();
      }
    }
  });

  it("does not expose the underlying booking document id as a queryable link to PII", async () => {
    // The slotBlock id matches the booking id by design (see slotBlocks.ts),
    // but that id alone is not PII and — critically — cannot be used by an
    // anonymous client to pivot into the bookings collection.
    const anon = testEnv.unauthenticatedContext().firestore();
    const slotSnap = await anon.doc("slotBlocks/bk-1").get();
    expect(slotSnap.exists).toBe(true);
    await assertFails(anon.doc(`bookings/${slotSnap.id}`).get());
  });
});

describe("anonymous clients cannot query booking documents at all", () => {
  it("cannot fetch a booking by guessing/enumerating its document id", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("bookings/bk-1").get());
  });

  it("cannot query bookings by date", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon.collection("bookings").where("date", "==", KNOWN_DATE).get(),
    );
  });

  it("cannot query bookings by a date range", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("date", ">=", "2026-01-01")
        .where("date", "<=", "2026-12-31")
        .get(),
    );
  });

  it("cannot query bookings by customer name", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("customerNameLower", "==", "jane customer")
        .get(),
    );
  });

  it("cannot query bookings by customer phone", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("customerPhone", "==", KNOWN_PHONE)
        .get(),
    );
  });
});

describe("customer identity requires verified staff access, not just a known phone number", () => {
  it("blocks the phone-enumeration attack: knowing a phone number is not ownership proof", async () => {
    // This is the exact regression this task closes: the public booking
    // form used to `getDoc` this collection by phone number alone and
    // render the real customer's name + visit count. Anyone who typed in
    // (or brute-forced) another person's mobile number got their identity
    // back with zero proof of ownership.
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc(`customerLookups/${KNOWN_PHONE}`).get());
  });

  it("blocks listing/scanning the identity collection anonymously", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection("customerLookups").get());
  });

  it("staff (verified access) can still read customer identity for legitimate service", async () => {
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    const snap = await staff.doc(`customerLookups/${KNOWN_PHONE}`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.name).toBe("Jane Customer");
  });
});

describe("owner/staff access remains fully functional under the tightened rules", () => {
  it("staff can read full booking PII for operational use", async () => {
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    const snap = await staff.doc("bookings/bk-1").get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.customerPhone).toBe(KNOWN_PHONE);
  });
});
