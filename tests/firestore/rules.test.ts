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

  it("cannot create a booking without recorded privacy consent", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const noConsent = validPublicBooking();
    delete (noConsent as Record<string, unknown>).consentGivenAt;
    await assertFails(anon.doc("bookings/bk-new").set(noConsent));
  });

  it("can create a booking with an optional email address", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
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
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
    for (const status of STATUSES) {
      await assertSucceeds(staff.doc("bookings/bk-1").update({ status }));
      await assertSucceeds(staff.doc("slotBlocks/bk-1").update({ status }));
    }
  });

  it("staff can record arrival and restore metadata alongside the status", async () => {
    await seedBooking("bk-1");
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
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
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
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
    const staff = testEnv.authenticatedContext("owner-uid").firestore();
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
    const owner = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(owner.doc("privateSettings/notifications").get());
    await assertSucceeds(
      owner.doc("privateSettings/notifications").set({
        notifyOwnerByEmail: false,
        ownerEmail: "new@example.com",
      }),
    );
  });

  it("a stylist account cannot read or write", async () => {
    const stylist = testEnv.authenticatedContext("stylist-uid").firestore();
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
    const owner = testEnv.authenticatedContext("owner-uid").firestore();
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

describe("stylistDayLocks — admin slot-claim lock documents", () => {
  const lock = { version: 1, updatedAt: "2026-12-01T00:00:00.000Z" };

  it("staff can create and bump a lock", async () => {
    const staff = testEnv.authenticatedContext("staff-1").firestore();
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
    const staff = testEnv.authenticatedContext("staff-1").firestore();
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
    const staff = testEnv.authenticatedContext("staff-1").firestore();
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
    const owner = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(owner.doc("stylists/s1").update({ order: 5 }));
    await assertSucceeds(owner.doc("stylists/s2").update({ order: 1 }));
    await assertSucceeds(owner.doc("stylists/s3").set({ ...stylist, order: 2 }));
  });

  it("the owner cannot write a non-numeric order", async () => {
    const owner = testEnv.authenticatedContext("owner-uid").firestore();
    await assertFails(owner.doc("stylists/s1").update({ order: "first" }));
  });

  it("a stylist account cannot add or change order", async () => {
    const staff = testEnv.authenticatedContext("stylist-uid").firestore();
    await assertFails(staff.doc("stylists/s1").update({ order: 3 }));
    await assertFails(staff.doc("stylists/s2").update({ order: 0 }));
    await assertFails(staff.doc("stylists/s3").set({ ...stylist, order: 0 }));
  });

  it("a stylist account cannot remove order by overwriting the document without it", async () => {
    const staff = testEnv.authenticatedContext("stylist-uid").firestore();
    await assertFails(staff.doc("stylists/s1").set(stylist));
  });

  it("anonymous visitors cannot write order", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.doc("stylists/s1").update({ order: 9 }));
    await assertFails(anon.doc("stylists/s9").set({ ...stylist, order: 0 }));
  });

  it("other staff writes to a stylist are unchanged (edit fields, add without order)", async () => {
    const staff = testEnv.authenticatedContext("stylist-uid").firestore();
    await assertSucceeds(staff.doc("stylists/s1").update({ role: "Director" }));
    await assertSucceeds(staff.doc("stylists/s4").set(stylist));
  });

  it("a staff edit that leaves order as it was is allowed", async () => {
    const staff = testEnv.authenticatedContext("stylist-uid").firestore();
    await assertSucceeds(staff.doc("stylists/s1").set({ ...stylist, order: 0 }));
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
    it("accepts busy blocks and a return point", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(
        anon.doc("slotBlocks/new-1").set(validSlotBlock({ busy, returnAt: 690 })),
      );
      await assertSucceeds(
        anon.doc("slotBlocks/new-2").set(validSlotBlock({ busy, returnAt: null })),
      );
    });

    it("still accepts the projection without them (records from before phases)", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(anon.doc("slotBlocks/old-1").set(validSlotBlock()));
    });

    it("rejects busy that is not a list, has too many blocks, or a non-numeric return point", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(anon.doc("slotBlocks/bad-1").set(validSlotBlock({ busy: "all day" })));
      await assertFails(anon.doc("slotBlocks/bad-2").set(validSlotBlock({ busy: tooMany })));
      await assertFails(anon.doc("slotBlocks/bad-3").set(validSlotBlock({ busy, returnAt: "noon" })));
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
      const staff = testEnv.authenticatedContext("staff-1").firestore();
      await assertSucceeds(staff.doc("slotBlocks/bk-q").update({ busy, returnAt: 690 }));
      await assertFails(staff.doc("slotBlocks/bk-q").update({ busy: tooMany }));
      await assertFails(staff.doc("slotBlocks/bk-q").update({ returnAt: "later" }));
    });
  });

  describe("bookings", () => {
    it("a public booking may carry its phases and segments", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(
        anon.doc("bookings/ph-1").set(validPublicBooking({ phases, segments })),
      );
    });

    it("a public booking with phases that are not a list, or too many, is refused", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(anon.doc("bookings/ph-2").set(validPublicBooking({ phases: "long" })));
      await assertFails(anon.doc("bookings/ph-3").set(validPublicBooking({ segments: tooMany })));
    });

    it("staff can save new phases; an oversized list is refused", async () => {
      await seedBooking("bk-r");
      const staff = testEnv.authenticatedContext("staff-1").firestore();
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
