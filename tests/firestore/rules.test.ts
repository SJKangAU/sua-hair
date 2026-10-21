// tests/firestore/rules.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Permission matrix for firestore.rules — run against the Firestore
// emulator via `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  unprovisionedCtx,
  createTestEnv,
  validCustomerLookup,
  validPublicBooking,
  validSlotBlock,
  ownerCtx,
  stylistCtx,
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

  it("cannot create a booking, even a well-formed pending one (only createBookingRequest can)", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("bookings/bk-new").set(validPublicBooking()));
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

  it("cannot create a booking without recorded privacy consent", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const noConsent = validPublicBooking();
    delete (noConsent as Record<string, unknown>).consentGivenAt;
    await assertFails(anon.doc("bookings/bk-new").set(noConsent));
  });

  it("cannot create a booking with an optional email address either", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("bookings/bk-new")
        .set(validPublicBooking({ customerEmail: "jane@example.com" })),
    );
  });

  it("cannot create a booking with a non-string or oversized email", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .doc("bookings/bk-a")
        .set(validPublicBooking({ customerEmail: 12345 })),
    );
    await assertFails(
      anon
        .doc("bookings/bk-b")
        .set(validPublicBooking({ customerEmail: "a".repeat(250) + "@x.co" })),
    );
  });

  it("cannot create a booking and so cannot read one back", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("bookings/bk-new").set(validPublicBooking()));
    await assertFails(anon.doc("bookings/bk-new").get());
  });
});

describe("bookings — staff access works", () => {
  it("staff can get, list, update and delete bookings", async () => {
    await seedBooking("bk-1");
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
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

describe("booking lifecycle statuses", () => {
  const STATUSES = [
    "pending",
    "confirmed",
    "arrived",
    "in_service",
    "completed",
    "no_show",
    "cancelled",
  ];

  it("staff can move a booking and its slot block through every status", async () => {
    await seedBooking("bk-1");
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
    for (const status of STATUSES) {
      await assertSucceeds(staff.doc("bookings/bk-1").update({ status }));
      await assertSucceeds(staff.doc("slotBlocks/bk-1").update({ status }));
    }
  });

  it("staff can record arrival and restore metadata alongside the status", async () => {
    await seedBooking("bk-1");
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(
      staff.doc("bookings/bk-1").update({
        status: "arrived",
        arrivedAt: "2026-08-01T00:12:00.000Z",
      }),
    );
    await assertSucceeds(
      staff.doc("bookings/bk-1").update({
        status: "cancelled",
        restoreStatus: "arrived",
      }),
    );
  });

  it("staff cannot write an unknown status to a booking or slot block", async () => {
    await seedBooking("bk-1");
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
    await assertFails(staff.doc("bookings/bk-1").update({ status: "banana" }));
    await assertFails(
      staff.doc("slotBlocks/bk-1").update({ status: "banana" }),
    );
    await assertFails(
      staff
        .doc("bookings/bk-new")
        .set(validPublicBooking({ status: "banana" })),
    );
  });

  it("unrelated field edits still work on a booking that already has a valid status", async () => {
    await seedBooking("bk-1", { status: "completed" });
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(
      staff.doc("bookings/bk-1").update({ notes: "Left a tip" }),
    );
  });

  it("an anonymous customer still cannot create a booking in any status but pending", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    for (const status of STATUSES.filter((s) => s !== "pending")) {
      await assertFails(
        anon.doc(`bookings/bk-${status}`).set(validPublicBooking({ status })),
      );
    }
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

  it("anonymous cannot create a slot block, however well-formed (only the booking functions write them)", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("slotBlocks/bk-new").set(validSlotBlock({ status: "pending" })));
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

  it("anonymous can no longer write a lookup record (the booking function does)", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
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
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
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

describe("privateSettings — owner-only", () => {
  const settings = { notifyOwnerByEmail: true, ownerEmail: "owner@example.com" };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
      await ctx.firestore().doc("users/stylist-uid").set({ role: "stylist" });
      await ctx.firestore().doc("privateSettings/notifications").set(settings);
    });
  });

  it("the owner can read and write", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(owner.doc("privateSettings/notifications").get());
    await assertSucceeds(
      owner.doc("privateSettings/notifications").set({
        notifyOwnerByEmail: false,
        ownerEmail: "new@example.com",
      }),
    );
  });

  it("a stylist account cannot read or write", async () => {
    const stylist = stylistCtx(testEnv).firestore();
    await assertFails(stylist.doc("privateSettings/notifications").get());
    await assertFails(
      stylist.doc("privateSettings/notifications").set(settings),
    );
  });

  it("an anonymous visitor cannot read or write", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("privateSettings/notifications").get());
    await assertFails(anon.doc("privateSettings/notifications").set(settings));
  });

  it("the owner cannot write unexpected or mistyped fields", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertFails(
      owner
        .doc("privateSettings/notifications")
        .set({ ...settings, extra: "nope" }),
    );
    await assertFails(
      owner
        .doc("privateSettings/notifications")
        .set({ notifyOwnerByEmail: "yes", ownerEmail: "owner@example.com" }),
    );
  });
});

describe("users — role documents", () => {
  it("a stylist can read only their own role document; the owner reads all; others none", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
      await ctx.firestore().doc("users/stylist-uid").set({ role: "stylist", stylistId: "stylist-1" });
      await ctx.firestore().doc("users/other-uid").set({ role: "stylist", stylistId: "s9" });
    });
    const stylist = stylistCtx(testEnv).firestore();
    await assertSucceeds(stylist.doc("users/stylist-uid").get());
    await assertFails(stylist.doc("users/other-uid").get());
    await assertFails(stylist.doc("users/owner-uid").get());
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(owner.doc("users/owner-uid").get());
    await assertSucceeds(owner.doc("users/other-uid").get());
    await assertSucceeds(owner.collection("users").get());
    await assertFails(unprovisionedCtx(testEnv, "stylist-uid").firestore().doc("users/stylist-uid").get());
  });

  it("nobody can write a role document through the client SDK", async () => {
    const staff = ownerCtx(testEnv, "owner-uid").firestore();
    await assertFails(staff.doc("users/owner-uid").set({ role: "owner" }));
  });
});

describe("stylistDayLocks — admin slot-claim lock documents", () => {
  const lock = { version: 1, updatedAt: "2026-12-01T00:00:00.000Z" };

  it("staff can create and bump a lock", async () => {
    const staff = ownerCtx(testEnv, "staff-1").firestore();
    await assertSucceeds(staff.doc("stylistDayLocks/2026-12-01_s1").set(lock));
    await assertSucceeds(
      staff.doc("stylistDayLocks/2026-12-01_s1").set({ ...lock, version: 2 }),
    );
    await assertSucceeds(staff.doc("stylistDayLocks/2026-12-01_s1").get());
  });

  it("anonymous visitors cannot read, create or change a lock", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("stylistDayLocks/2026-12-01_s1").set(lock);
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("stylistDayLocks/2026-12-01_s1").get());
    await assertFails(anon.doc("stylistDayLocks/2026-12-01_s1").set(lock));
    await assertFails(
      anon.doc("stylistDayLocks/2026-12-01_s2").set({ ...lock, version: 9 }),
    );
    await assertFails(anon.collection("stylistDayLocks").get());
  });

  it("a lock cannot carry anything but version and updatedAt", async () => {
    const staff = ownerCtx(testEnv, "staff-1").firestore();
    await assertFails(
      staff.doc("stylistDayLocks/x").set({ ...lock, customerName: "Jane" }),
    );
    await assertFails(staff.doc("stylistDayLocks/x").set({ version: "1", updatedAt: "now" }));
    await assertFails(staff.doc("stylistDayLocks/x").set({ version: 1 }));
  });

  it("nobody can delete a lock", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("stylistDayLocks/2026-12-01_s1").set(lock);
    });
    const staff = ownerCtx(testEnv, "staff-1").firestore();
    await assertFails(staff.doc("stylistDayLocks/2026-12-01_s1").delete());
  });
});

describe("stylists.order — only the owner can write the display order", () => {
  const stylist = { name: "Alex", role: "Senior", level: "senior", status: "active" };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
      await ctx
        .firestore()
        .doc("users/stylist-uid")
        .set({ role: "stylist", stylistId: "s1" });
      await ctx.firestore().doc("stylists/s1").set({ ...stylist, order: 0 });
      await ctx.firestore().doc("stylists/s2").set(stylist); // legacy: no order
    });
  });

  it("anyone, including anonymous visitors, can read stylists and their order", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const snap = await assertSucceeds(anon.doc("stylists/s1").get());
    expect(snap.data()?.order).toBe(0);
    await assertSucceeds(anon.collection("stylists").get());
  });

  it("the owner can write order (update and create)", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(owner.doc("stylists/s1").update({ order: 5 }));
    await assertSucceeds(owner.doc("stylists/s2").update({ order: 1 }));
    await assertSucceeds(owner.doc("stylists/s3").set({ ...stylist, order: 2 }));
  });

  it("the owner cannot write a non-numeric order", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertFails(owner.doc("stylists/s1").update({ order: "first" }));
  });

  it("a stylist account cannot add or change order", async () => {
    const staff = stylistCtx(testEnv).firestore();
    await assertFails(staff.doc("stylists/s1").update({ order: 3 }));
    await assertFails(staff.doc("stylists/s2").update({ order: 0 }));
    await assertFails(staff.doc("stylists/s3").set({ ...stylist, order: 0 }));
  });

  it("a stylist account cannot remove order by overwriting the document without it", async () => {
    const staff = stylistCtx(testEnv).firestore();
    await assertFails(staff.doc("stylists/s1").set(stylist));
  });

  it("anonymous visitors cannot write order", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("stylists/s1").update({ order: 9 }));
    await assertFails(anon.doc("stylists/s9").set({ ...stylist, order: 0 }));
  });

  it("a stylist account can no longer edit or add stylists at all (stylist management is the owner's)", async () => {
    const staff = stylistCtx(testEnv).firestore();
    await assertFails(staff.doc("stylists/s1").update({ role: "Director" }));
    await assertFails(staff.doc("stylists/s4").set(stylist));
    await assertFails(staff.doc("stylists/s1").delete());
  });

  it("the owner can edit and add stylists without touching order", async () => {
    const owner = ownerCtx(testEnv).firestore();
    await assertSucceeds(owner.doc("stylists/s1").update({ role: "Director" }));
    await assertSucceeds(owner.doc("stylists/s4").set(stylist));
  });

  it("a stylist account cannot rewrite a stylist even leaving order as it was", async () => {
    const staff = stylistCtx(testEnv).firestore();
    await assertFails(staff.doc("stylists/s1").set({ ...stylist, order: 0 }));
  });
});

describe("phase fields (DEC-026) - bookings and slotBlocks", () => {
  const busy = [{ start: 600, end: 660 }, { start: 690, end: 720 }];
  const phases = [
    { type: "active", minutes: 60 },
    { type: "rest", minutes: 30 },
    { type: "active", minutes: 30 },
  ];
  const segments = [
    { type: "active", start: 600, end: 660 },
    { type: "rest", start: 660, end: 690 },
    { type: "active", start: 690, end: 720 },
  ];
  const tooMany = Array.from({ length: 9 }, () => ({ start: 1, end: 2 }));

  describe("the public slotBlocks projection", () => {
    it("the owner's write accepts busy blocks and a return point", async () => {
      const owner = ownerCtx(testEnv).firestore();
      await assertSucceeds(
        owner.doc("slotBlocks/new-1").set(validSlotBlock({ busy, returnAt: 690 })),
      );
      await assertSucceeds(
        owner.doc("slotBlocks/new-2").set(validSlotBlock({ busy, returnAt: null })),
      );
    });

    it("still accepts the projection without them (records from before phases)", async () => {
      const owner = ownerCtx(testEnv).firestore();
      await assertSucceeds(owner.doc("slotBlocks/old-1").set(validSlotBlock()));
    });

    it("rejects busy that is not a list, has too many blocks, or a non-numeric return point", async () => {
      const owner = ownerCtx(testEnv).firestore();
      await assertFails(owner.doc("slotBlocks/bad-1").set(validSlotBlock({ busy: "all day" })));
      await assertFails(owner.doc("slotBlocks/bad-2").set(validSlotBlock({ busy: tooMany })));
      await assertFails(owner.doc("slotBlocks/bad-3").set(validSlotBlock({ busy, returnAt: "noon" })));
    });

    it("cannot smuggle identity in through the new fields' neighbours", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        anon.doc("slotBlocks/pii").set(validSlotBlock({ busy, customerName: "Jane Customer" })),
      );
      await assertFails(anon.doc("slotBlocks/pii2").set(validSlotBlock({ busy, phases })));
    });

    it("anyone can read the busy blocks (they are the public availability data)", async () => {
      await seedBooking("bk-p", { busy, returnAt: 690 });
      const anon = testEnv.unauthenticatedContext().firestore();
      const snap = await assertSucceeds(anon.doc("slotBlocks/bk-p").get());
      expect(snap.data()?.busy).toEqual(busy);
    });

    it("staff can update the busy blocks; a malformed update is refused", async () => {
      await seedBooking("bk-q");
      const staff = ownerCtx(testEnv, "staff-1").firestore();
      await assertSucceeds(staff.doc("slotBlocks/bk-q").update({ busy, returnAt: 690 }));
      await assertFails(staff.doc("slotBlocks/bk-q").update({ busy: tooMany }));
      await assertFails(staff.doc("slotBlocks/bk-q").update({ returnAt: "later" }));
    });
  });

  describe("bookings", () => {
    it("an owner-written booking may carry its phases and segments", async () => {
      const owner = ownerCtx(testEnv).firestore();
      await assertSucceeds(
        owner.doc("bookings/ph-1").set(validPublicBooking({ phases, segments })),
      );
    });

    it("a booking with phases that are not a list, or too many, is refused", async () => {
      const owner = ownerCtx(testEnv).firestore();
      await assertFails(owner.doc("bookings/ph-2").set(validPublicBooking({ phases: "long" })));
      await assertFails(owner.doc("bookings/ph-3").set(validPublicBooking({ segments: tooMany })));
    });

    it("staff can save new phases; an oversized list is refused", async () => {
      await seedBooking("bk-r");
      const staff = ownerCtx(testEnv, "staff-1").firestore();
      await assertSucceeds(staff.doc("bookings/bk-r").update({ phases, segments }));
      await assertFails(staff.doc("bookings/bk-r").update({ phases: tooMany }));
    });

    it("the booking list stays staff-only whatever fields it carries", async () => {
      await seedBooking("bk-s", { phases, segments });
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(anon.doc("bookings/bk-s").get());
    });
  });
});

describe("importBatches — the client import's ledger is owner-only", () => {
  const batch = { status: "complete", source: "fresha-client-list", created: 3 };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
      await ctx.firestore().doc("users/stylist-uid").set({ role: "stylist" });
      await ctx.firestore().doc("importBatches/b1").set(batch);
      await ctx.firestore().doc("importBatches/b1/chunks/00000").set({ phones: ["0400000001"] });
    });
  });

  it("the owner can read, create, update and delete batches and chunks", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(owner.doc("importBatches/b1").get());
    await assertSucceeds(owner.collection("importBatches/b1/chunks").get());
    await assertSucceeds(owner.doc("importBatches/b2").set({ status: "running", source: "fresha-client-list" }));
    await assertSucceeds(owner.doc("importBatches/b2").update({ status: "complete" }));
    await assertSucceeds(owner.doc("importBatches/b1/chunks/00001").set({ phones: ["0400000002"] }));
    await assertSucceeds(owner.doc("importBatches/b1/chunks/00000").delete());
  });

  it("a stylist account cannot see or write any of it", async () => {
    const stylist = stylistCtx(testEnv).firestore();
    await assertFails(stylist.doc("importBatches/b1").get());
    await assertFails(stylist.collection("importBatches").get());
    await assertFails(stylist.doc("importBatches/b1/chunks/00000").get());
    await assertFails(stylist.doc("importBatches/b3").set({ status: "running", source: "x" }));
    await assertFails(stylist.doc("importBatches/b1/chunks/00005").set({ phones: [] }));
    await assertFails(stylist.doc("importBatches/b1").delete());
  });

  it("the public cannot see or write any of it", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("importBatches/b1").get());
    await assertFails(anon.doc("importBatches/b1/chunks/00000").get());
    await assertFails(anon.doc("importBatches/b3").set({ status: "running", source: "x" }));
  });

  it("rejects an unknown status, a non-list or oversize phone list and extra chunk fields", async () => {
    const owner = ownerCtx(testEnv, "owner-uid").firestore();
    await assertFails(owner.doc("importBatches/b4").set({ status: "odd", source: "x" }));
    await assertFails(owner.doc("importBatches/b1/chunks/0").set({ phones: "0400000001" }));
    await assertFails(owner.doc("importBatches/b1/chunks/0").set({ phones: Array.from({ length: 501 }, (_, i) => `04${String(i).padStart(8, "0")}`) }));
    await assertFails(owner.doc("importBatches/b1/chunks/0").set({ phones: [], note: "x" }));
  });

  it("an imported lookup (name, empty lastVisit, 0 visits) can be merged by the owner but not the public", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("customerLookups/0400000001").set({ name: "Test Client 1", lastVisit: "", visitCount: 0 });
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon.doc("customerLookups/0400000001").set(validCustomerLookup({ name: "Test Client 1", visitCount: 1 }), { merge: true }),
    );
    const owner = ownerCtx(testEnv).firestore();
    await assertSucceeds(
      owner.doc("customerLookups/0400000001").set(validCustomerLookup({ name: "Test Client 1", visitCount: 1 }), { merge: true }),
    );
  });
});
