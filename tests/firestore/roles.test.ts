// tests/firestore/roles.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The role matrix for firestore.rules (DEC-033): for EVERY collection, what an
// owner, a stylist, a signed-in-but-unprovisioned account and an anonymous
// visitor can do. Run via `npm run test:rules`.
//
//   owner          custom claim role == "owner"
//   stylist        role == "stylist" + stylistId == "stylist-1"
//   unprovisioned  signed in, no claim (the old "any signed-in account is staff"
//                  is gone)
//   anonymous      not signed in
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  createTestEnv,
  ownerCtx,
  stylistCtx,
  unprovisionedCtx,
  validCustomerLookup,
  validPublicBooking,
  validSlotBlock,
} from "./testEnv";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const owner = () => ownerCtx(env).firestore();
const stylist = () => stylistCtx(env).firestore();
const otherStylist = () => stylistCtx(env, "stylist-2", "other-stylist-uid").firestore();
const nobody = () => unprovisionedCtx(env).firestore();
const anon = () => env.unauthenticatedContext().firestore();

/** Every non-owner caller that must be denied where only the owner may act. */
const nonOwners = () => [
  ["stylist", stylist()],
  ["unprovisioned", nobody()],
  ["anonymous", anon()],
] as const;

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("bookings/own").set(validPublicBooking({ status: "confirmed" }));
    await db.doc("slotBlocks/own").set(validSlotBlock({ status: "confirmed" }));
    await db.doc("bookings/theirs").set(validPublicBooking({ stylistId: "stylist-2", status: "confirmed" }));
    await db.doc("slotBlocks/theirs").set(validSlotBlock({ stylistId: "stylist-2", status: "confirmed" }));
    await db.doc("bookings/pend").set(validPublicBooking({ status: "pending" }));
    await db.doc("stylists/stylist-1").set({ name: "Alex", level: "senior", status: "active", order: 0 });
    await db.doc("services/svc-1").set({ name: "Cut", price: { director: 3, senior: 2, junior: 1 } });
    await db.doc("salonSettings/main").set({ weeklySchedule: {}, dateOverrides: {} });
    await db.doc("privateSettings/notifications").set({ notifyOwnerByEmail: false, ownerEmail: "o@example.com" });
    await db.doc("customerLookups/0412345678").set(validCustomerLookup());
    await db.doc("waitlist/w1").set({ customerName: "Jane", customerPhone: "0412345678", requestedDate: "2026-12-01", status: "pending" });
    await db.doc("notifications/n-owner").set({ recipientId: "owner", recipientType: "owner", read: false, message: "m", bookingId: "own", createdAt: "x" });
    await db.doc("notifications/n-s1").set({ recipientId: "stylist-1", recipientType: "stylist", read: false, message: "m", bookingId: "own", createdAt: "x" });
    await db.doc("notifications/n-s2").set({ recipientId: "stylist-2", recipientType: "stylist", read: false, message: "m", bookingId: "own", createdAt: "x" });
    await db.doc("stylistDayLocks/2026-12-01_stylist-1").set({ version: 1, updatedAt: "x" });
    await db.doc("importBatches/b1").set({ status: "complete", source: "fresha-client-list" });
    await db.doc("users/owner-uid").set({ role: "owner" });
    await db.doc("rateLimits/k").set({ count: 1 });
    await db.doc("phoneLimits/0412345678").set({ version: 1 });
  });
});

describe("bookings", () => {
  it("owner: read, list, create, update, delete", async () => {
    const db = owner();
    await assertSucceeds(db.doc("bookings/own").get());
    await assertSucceeds(db.collection("bookings").where("date", "==", "2026-08-01").get());
    await assertSucceeds(db.doc("bookings/new").set(validPublicBooking({ bookingType: "walkin", status: "confirmed" })));
    await assertSucceeds(db.doc("bookings/own").update({ status: "arrived" }));
    await assertSucceeds(db.doc("bookings/own").delete());
  });

  it("stylist: reads only their own stylist's bookings, by get and by an own-stylist query", async () => {
    const db = stylist();
    await assertSucceeds(db.doc("bookings/own").get());
    await assertFails(db.doc("bookings/theirs").get());
    await assertSucceeds(db.collection("bookings").where("stylistId", "==", "stylist-1").where("date", "==", "2026-08-01").get());
    await assertFails(db.collection("bookings").where("date", "==", "2026-08-01").get());
    await assertFails(db.collection("bookings").where("stylistId", "==", "stylist-2").get());
  });

  it("stylist: can move their own booking through the day's lifecycle and add a note", async () => {
    const db = stylist();
    await assertSucceeds(db.doc("bookings/own").update({ status: "arrived", arrivedAt: "2026-08-01T00:00:00Z" }));
    await assertSucceeds(db.doc("bookings/own").update({ status: "in_service" }));
    await assertSucceeds(db.doc("bookings/own").update({ status: "completed" }));
    await assertSucceeds(db.doc("bookings/own").update({ notes: "Wants a fringe trim next time" }));
  });

  it("stylist: cannot approve, cancel, restore, move, re-price or re-assign a booking", async () => {
    const db = stylist();
    await assertFails(db.doc("bookings/pend").update({ status: "confirmed" }));
    await assertFails(db.doc("bookings/own").update({ status: "cancelled" }));
    await assertFails(db.doc("bookings/own").update({ status: "pending" }));
    await assertFails(db.doc("bookings/own").update({ time: "9:00 AM" }));
    await assertFails(db.doc("bookings/own").update({ date: "2026-08-02" }));
    await assertFails(db.doc("bookings/own").update({ servicePrice: 1 }));
    await assertFails(db.doc("bookings/own").update({ stylistId: "stylist-2" }));
    await assertFails(db.doc("bookings/own").update({ phases: [{ type: "active", minutes: 15 }] }));
    // the colour consultation answers are the client's: a stylist reads them, never edits them
    await assertFails(db.doc("bookings/own").update({ consultation: { desiredColour: "Blonde" } }));
    await assertFails(db.doc("bookings/own").update({ needsConsultation: false }));
  });

  it("stylist: cannot touch another stylist's booking, create or delete any", async () => {
    const db = stylist();
    await assertFails(db.doc("bookings/theirs").update({ status: "arrived" }));
    await assertFails(db.doc("bookings/own").delete());
    await assertFails(db.doc("bookings/x").set(validPublicBooking({ bookingType: "walkin", status: "confirmed" })));
  });

  it("a cancelled booking cannot be revived by a stylist", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("bookings/own").update({ status: "cancelled" });
    });
    await assertFails(stylist().doc("bookings/own").update({ status: "arrived" }));
  });

  it.each(["unprovisioned", "anonymous"] as const)("%s: no read, list, create, update or delete", async (who) => {
    const db = who === "anonymous" ? anon() : nobody();
    await assertFails(db.doc("bookings/own").get());
    await assertFails(db.collection("bookings").get());
    await assertFails(db.doc("bookings/new").set(validPublicBooking()));
    await assertFails(db.doc("bookings/own").update({ status: "confirmed" }));
    await assertFails(db.doc("bookings/own").delete());
  });
});

describe("slotBlocks", () => {
  it("everyone, including anonymous, can read the PII-free projection", async () => {
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      await assertSucceeds(db.doc("slotBlocks/own").get());
      await assertSucceeds(db.collection("slotBlocks").where("date", "==", "2026-08-01").get());
    }
  });

  it("owner: create, update, delete", async () => {
    const db = owner();
    await assertSucceeds(db.doc("slotBlocks/new").set(validSlotBlock({ status: "confirmed" })));
    await assertSucceeds(db.doc("slotBlocks/own").update({ status: "arrived" }));
    await assertSucceeds(db.doc("slotBlocks/own").delete());
  });

  it("stylist: may only move their own slot's status through the day's lifecycle", async () => {
    const db = stylist();
    await assertSucceeds(db.doc("slotBlocks/own").update({ status: "arrived" }));
    await assertFails(db.doc("slotBlocks/theirs").update({ status: "arrived" }));
    await assertFails(db.doc("slotBlocks/own").update({ time: "9:00 AM" }));
    await assertFails(db.doc("slotBlocks/own").update({ status: "cancelled" }));
    await assertFails(db.doc("slotBlocks/own").delete());
    await assertFails(db.doc("slotBlocks/new").set(validSlotBlock({ status: "confirmed" })));
  });

  it.each(["unprovisioned", "anonymous"] as const)("%s: cannot create, update or delete", async (who) => {
    const db = who === "anonymous" ? anon() : nobody();
    await assertFails(db.doc("slotBlocks/new").set(validSlotBlock({ status: "pending" })));
    await assertFails(db.doc("slotBlocks/own").update({ status: "cancelled" }));
    await assertFails(db.doc("slotBlocks/own").delete());
  });
});

describe("stylists, services, salonSettings (public read, owner-only write)", () => {
  const targets = [
    ["stylists/stylist-1", { name: "Hacked" }],
    ["services/svc-1", { name: "Hacked", price: { director: 1, senior: 1, junior: 1 } }],
    ["salonSettings/main", { weeklySchedule: {}, dateOverrides: { "2026-12-25": { closed: true } } }],
  ] as const;

  it("everyone can read them", async () => {
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      for (const [path] of targets) await assertSucceeds(db.doc(path).get());
      await assertSucceeds(db.collection("services").get());
    }
  });

  it("owner can write them", async () => {
    const db = owner();
    await assertSucceeds(db.doc("stylists/stylist-1").update({ name: "Alexis" }));
    await assertSucceeds(db.doc("services/svc-1").update({ price: { director: 9, senior: 8, junior: 7 } }));
    await assertSucceeds(db.doc("services/svc-2").set({ name: "New", price: { director: 1, senior: 1, junior: 1 } }));
    await assertSucceeds(db.doc("salonSettings/main").set({ weeklySchedule: {}, dateOverrides: {} }));
  });

  it("stylist, unprovisioned and anonymous cannot change services, prices, stylists, settings or hours", async () => {
    for (const [, db] of nonOwners()) {
      for (const [path, data] of targets) {
        await assertFails(db.doc(path).set(data));
        await assertFails(db.doc(path).update(data));
      }
      await assertFails(db.doc("services/svc-1").update({ "price.junior": 0 }));
      await assertFails(db.doc("services/svc-1").delete());
      await assertFails(db.doc("stylists/stylist-1").delete());
      await assertFails(db.doc("stylists/stylist-1").update({ order: 9 }));
    }
  });
});

describe("privateSettings", () => {
  it("owner only", async () => {
    await assertSucceeds(owner().doc("privateSettings/notifications").get());
    await assertSucceeds(
      owner().doc("privateSettings/notifications").set({ notifyOwnerByEmail: true, ownerEmail: "a@b.co" }),
    );
    for (const [, db] of nonOwners()) {
      await assertFails(db.doc("privateSettings/notifications").get());
      await assertFails(
        db.doc("privateSettings/notifications").set({ notifyOwnerByEmail: true, ownerEmail: "a@b.co" }),
      );
    }
  });
});

describe("customerLookups (client list, blocked flag)", () => {
  it("owner: get, list, write, delete", async () => {
    const db = owner();
    await assertSucceeds(db.doc("customerLookups/0412345678").get());
    await assertSucceeds(db.collection("customerLookups").get());
    await assertSucceeds(
      db.doc("customerLookups/0400000009").set({ name: "Imported", lastVisit: "", visitCount: 0, blocked: true }),
    );
    await assertSucceeds(db.doc("customerLookups/0400000009").delete());
  });

  it("stylist, unprovisioned and anonymous: no access at all", async () => {
    for (const [, db] of nonOwners()) {
      await assertFails(db.doc("customerLookups/0412345678").get());
      await assertFails(db.collection("customerLookups").get());
      await assertFails(db.doc("customerLookups/0412345678").set(validCustomerLookup(), { merge: true }));
      await assertFails(db.doc("customerLookups/0412345678").delete());
    }
  });
});

describe("waitlist", () => {
  it("owner: read, update, delete; but entries are created only by the joinWaitlist function", async () => {
    const db = owner();
    await assertSucceeds(db.doc("waitlist/w1").get());
    await assertSucceeds(db.collection("waitlist").get());
    await assertSucceeds(db.doc("waitlist/w1").update({ status: "contacted" }));
    await assertSucceeds(db.doc("waitlist/w1").delete());
  });

  it("nobody can create an entry directly - not even the owner", async () => {
    const entry = { customerName: "Jane", customerPhone: "0412345678", requestedDate: "2026-12-01", status: "pending", createdAt: "x" };
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      await assertFails(db.doc("waitlist/new").set(entry));
    }
  });

  it("stylist, unprovisioned and anonymous cannot read, update or delete", async () => {
    for (const [, db] of nonOwners()) {
      await assertFails(db.doc("waitlist/w1").get());
      await assertFails(db.collection("waitlist").get());
      await assertFails(db.doc("waitlist/w1").update({ status: "resolved" }));
      await assertFails(db.doc("waitlist/w1").delete());
    }
  });
});

describe("notifications", () => {
  it("owner reads, marks read, deletes and may add one (admin screens); nobody else creates", async () => {
    const db = owner();
    await assertSucceeds(db.collection("notifications").where("recipientId", "==", "owner").get());
    await assertSucceeds(db.doc("notifications/n-owner").update({ read: true }));
    await assertSucceeds(db.doc("notifications/n-owner").delete());
    await assertSucceeds(db.doc("notifications/n-new").set({ recipientId: "owner", read: false, message: "x" }));
    for (const c of [stylist(), nobody(), anon()]) {
      await assertFails(c.doc("notifications/new").set({ recipientId: "owner", read: false, message: "x" }));
    }
  });

  it("stylist reads and marks read only their own notifications", async () => {
    const db = stylist();
    await assertSucceeds(db.doc("notifications/n-s1").get());
    await assertSucceeds(db.collection("notifications").where("recipientId", "==", "stylist-1").get());
    await assertSucceeds(db.doc("notifications/n-s1").update({ read: true }));
    await assertFails(db.doc("notifications/n-s2").get());
    await assertFails(db.doc("notifications/n-owner").get());
    await assertFails(db.collection("notifications").where("recipientId", "==", "owner").get());
    await assertFails(db.doc("notifications/n-s2").update({ read: true }));
    await assertFails(db.doc("notifications/n-s1").update({ message: "edited" }));
    await assertFails(db.doc("notifications/n-s1").delete());
  });

  it("unprovisioned and anonymous have no access", async () => {
    for (const db of [nobody(), anon()]) {
      await assertFails(db.doc("notifications/n-s1").get());
      await assertFails(db.collection("notifications").get());
      await assertFails(db.doc("notifications/n-s1").update({ read: true }));
    }
  });

  it("another stylist cannot read this stylist's notifications", async () => {
    await assertFails(otherStylist().doc("notifications/n-s1").get());
  });
});

describe("stylistDayLocks, importBatches, users, server-only collections", () => {
  it("owner can use the day locks; no one else can read or write them", async () => {
    const lock = { version: 2, updatedAt: "now" };
    await assertSucceeds(owner().doc("stylistDayLocks/2026-12-01_stylist-1").get());
    await assertSucceeds(owner().doc("stylistDayLocks/2026-12-01_stylist-1").set(lock));
    for (const [, db] of nonOwners()) {
      await assertFails(db.doc("stylistDayLocks/2026-12-01_stylist-1").get());
      await assertFails(db.doc("stylistDayLocks/2026-12-01_stylist-1").set(lock));
    }
  });

  it("the import ledger is owner-only", async () => {
    await assertSucceeds(owner().doc("importBatches/b1").get());
    await assertSucceeds(owner().doc("importBatches/b2").set({ status: "running", source: "fresha-client-list" }));
    for (const [, db] of nonOwners()) {
      await assertFails(db.doc("importBatches/b1").get());
      await assertFails(db.doc("importBatches/b3").set({ status: "running", source: "x" }));
    }
  });

  it("the import ledger chunk can record the phones it blocked", async () => {
    await assertSucceeds(
      owner().doc("importBatches/b1/chunks/00000").set({ phones: ["0400000001"], blocked: ["0400000001"] }),
    );
    await assertFails(
      owner().doc("importBatches/b1/chunks/00001").set({ phones: [], blocked: "x" }),
    );
  });

  it("users: owner reads all, role documents are never writable by anyone", async () => {
    await assertSucceeds(owner().doc("users/owner-uid").get());
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      await assertFails(db.doc("users/owner-uid").set({ role: "owner" }));
      await assertFails(db.doc("users/new").set({ role: "owner" }));
    }
    await assertFails(nobody().doc("users/nobody-uid").get());
    await assertFails(anon().doc("users/owner-uid").get());
  });

  it("rateLimits and phoneLimits (functions' counters) are closed to every client", async () => {
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      await assertFails(db.doc("rateLimits/k").get());
      await assertFails(db.doc("rateLimits/k").set({ count: 0 }));
      await assertFails(db.doc("phoneLimits/0412345678").get());
      await assertFails(db.doc("phoneLimits/0412345678").set({ version: 0 }));
    }
  });

  it("an unknown collection is denied to everyone", async () => {
    for (const db of [owner(), stylist(), nobody(), anon()]) {
      await assertFails(db.doc("somethingElse/x").get());
      await assertFails(db.doc("somethingElse/x").set({ a: 1 }));
    }
  });
});

describe("claims", () => {
  it("a stylist claim without a stylistId is not staff", async () => {
    const db = env.authenticatedContext("half-uid", { role: "stylist" }).firestore();
    await assertFails(db.doc("bookings/own").get());
    await assertFails(db.collection("notifications").get());
  });

  it("an unknown role value is not staff", async () => {
    const db = env.authenticatedContext("odd-uid", { role: "admin" }).firestore();
    await assertFails(db.doc("bookings/own").get());
    await assertFails(db.doc("services/svc-1").update({ name: "x" }));
    expect(true).toBe(true);
  });
});
