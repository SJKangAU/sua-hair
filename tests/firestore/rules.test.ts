// tests/firestore/rules.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Permission matrix for firestore.rules — run against the Firestore
// emulator via `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  createTestEnv,
  validCustomerLookup,
  validPublicBooking,
  validSlotBlock,
} from "./testEnv";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv();
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Seeds a booking + matching slotBlock, bypassing rules entirely. */
async function seedBooking(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .doc(`bookings/${id}`)
      .set(validPublicBooking(overrides));
    await ctx
      .firestore()
      .doc(`slotBlocks/${id}`)
      .set(validSlotBlock(overrides));
    await ctx
      .firestore()
      .doc(
        `customerLookups/${
          (overrides.customerPhone as string) ?? "0412345678"
        }`,
      )
      .set(validCustomerLookup());
  });
}

describe("bookings — anonymous access is denied", () => {
  it("cannot get a booking document by id", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("bookings/bk-1").get());
  });

  it("cannot list bookings filtered by date", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon.collection("bookings").where("date", "==", "2026-08-01").get(),
    );
  });

  it("cannot list bookings filtered by a date range", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("date", ">=", "2026-01-01")
        .where("date", "<=", "2026-12-31")
        .get(),
    );
  });

  it("cannot list bookings filtered by customer name", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("customerNameLower", "==", "jane customer")
        .get(),
    );
  });

  it("cannot list bookings filtered by customer phone", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("bookings")
        .where("customerPhone", "==", "0412345678")
        .get(),
    );
  });

  it("cannot update or delete a booking", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon.doc("bookings/bk-1").update({ status: "confirmed" }),
    );
    await assertFails(anon.doc("bookings/bk-1").delete());
  });

  it("can create a valid pending customer booking", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.doc("bookings/bk-new").set(validPublicBooking()));
  });

  it("cannot create a booking that is pre-confirmed", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("bookings/bk-new")
        .set(validPublicBooking({ status: "confirmed" })),
    );
  });

  it("cannot create a walk-in/break/training booking type", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("bookings/bk-new")
        .set(validPublicBooking({ bookingType: "walkin" })),
    );
  });

  it("cannot create a booking missing a required field", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const missingPhone = validPublicBooking();
    delete (missingPhone as Record<string, unknown>).customerPhone;
    await assertFails(anon.doc("bookings/bk-new").set(missingPhone));
  });

  it("cannot read back the booking it just created", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await anon.doc("bookings/bk-new").set(validPublicBooking());
    await assertFails(anon.doc("bookings/bk-new").get());
  });
});

describe("bookings — staff access works", () => {
  it("staff can get, list, update and delete bookings", async () => {
    await seedBooking("bk-1");
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(staff.doc("bookings/bk-1").get());
    await assertSucceeds(
      staff.collection("bookings").where("date", "==", "2026-08-01").get(),
    );
    await assertSucceeds(
      staff.doc("bookings/bk-1").update({ status: "confirmed" }),
    );
    await assertSucceeds(staff.doc("bookings/bk-1").delete());
  });
});

describe("slotBlocks — public availability projection", () => {
  it("anonymous can list and get slot blocks", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.doc("slotBlocks/bk-1").get());
    await assertSucceeds(
      anon.collection("slotBlocks").where("stylistId", "==", "stylist-1").get(),
    );
  });

  it("anonymous can create a well-formed public slot block", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.doc("slotBlocks/bk-new").set(validSlotBlock()));
  });

  it("rejects an anonymous slot block carrying an extra (potentially PII) field", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("slotBlocks/bk-new")
        .set(validSlotBlock({ customerName: "Jane Customer" })),
    );
  });

  it("anonymous cannot update or delete a slot block", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon.doc("slotBlocks/bk-1").update({ status: "confirmed" }),
    );
    await assertFails(anon.doc("slotBlocks/bk-1").delete());
  });
});

describe("customerLookups — identity requires staff auth", () => {
  it("anonymous cannot get a lookup by phone number", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("customerLookups/0412345678").get());
  });

  it("anonymous cannot list lookups", async () => {
    await seedBooking("bk-1");
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection("customerLookups").get());
  });

  it("anonymous can still write their own lookup record on booking creation", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      anon
        .doc("customerLookups/0412345678")
        .set(validCustomerLookup(), { merge: true }),
    );
  });

  it("rejects an anonymous lookup write with an unexpected field", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("customerLookups/0412345678")
        .set(
          { ...validCustomerLookup(), phone: "0412345678" },
          { merge: true },
        ),
    );
  });

  it("staff can get and list lookups", async () => {
    await seedBooking("bk-1");
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(staff.doc("customerLookups/0412345678").get());
    await assertSucceeds(staff.collection("customerLookups").get());
  });
});

describe("reference data — public read, staff write", () => {
  it("anonymous can read stylists, services and salon settings", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("stylists/stylist-1").set({ name: "Alex" });
      await ctx.firestore().doc("services/svc-1").set({ name: "Cut" });
      await ctx
        .firestore()
        .doc("salonSettings/main")
        .set({ openTime: "09:00" });
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.doc("stylists/stylist-1").get());
    await assertSucceeds(anon.doc("services/svc-1").get());
    await assertSucceeds(anon.doc("salonSettings/main").get());
  });

  it("anonymous cannot write stylists, services or salon settings", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("stylists/stylist-1").set({ name: "Hacker" }));
    await assertFails(anon.doc("services/svc-1").set({ name: "Hacker" }));
    await assertFails(
      anon.doc("salonSettings/main").set({ openTime: "00:00" }),
    );
  });
});

describe("users — role documents", () => {
  it("a signed-in user can read only their own role document", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
      await ctx.firestore().doc("users/other-uid").set({ role: "stylist" });
    });
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(staff.doc("users/owner-uid").get());
    await assertFails(staff.doc("users/other-uid").get());
  });

  it("nobody can write a role document through the client SDK", async () => {
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    await assertFails(staff.doc("users/owner-uid").set({ role: "owner" }));
  });
});
