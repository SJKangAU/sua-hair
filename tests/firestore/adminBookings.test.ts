// tests/firestore/adminBookings.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Admin-created bookings (walk-ins and breaks) against the real Firestore
// emulator WITH the real security rules — run via `npm run test:admin`.
//
// Covers defect D1 (admin writes could overwrite an existing booking and
// were not conflict-checked), manual scenario TC-033, and the "two admins
// saving the same slot at once" race.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { createAdminBooking } from "../../src/lib/adminBookingWrites";
import { BookingConflictError } from "../../src/lib/bookingConflicts";
import type { Booking } from "../../src/types";
import { createTestEnv, validCustomerLookup } from "./testEnv";
import {
  DATE,
  STYLIST,
  anonDb as anonDbIn,
  breakBlock,
  seed as seedIn,
  staffDb as staffDbIn,
  walkin,
} from "./adminHelpers";

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

const staffDb = (uid?: string) => staffDbIn(testEnv, uid);
const anonDb = () => anonDbIn(testEnv);
const seed = (id: string, overrides: Partial<Booking> = {}) =>
  seedIn(testEnv, id, overrides);

async function bookingIds(): Promise<string[]> {
  const snap = await getDocs(collection(staffDb(), "bookings"));
  return snap.docs.map((d) => d.id).sort();
}

describe("TC-033 — admin walk-in that overlaps an existing booking is blocked", () => {
  it("rejects with BookingConflictError and writes nothing", async () => {
    await seed("existing", { time: "10:00 AM", totalTime: 60, activeTime: 60 });
    const db = staffDb();

    await expect(
      createAdminBooking(db, walkin({ time: "10:30 AM" })),
    ).rejects.toBeInstanceOf(BookingConflictError);

    expect(await bookingIds()).toEqual(["existing"]);
    const slots = await getDocs(collection(db, "slotBlocks"));
    expect(slots.docs.map((d) => d.id)).toEqual(["existing"]);
  });

  it("names the clashing booking in the message", async () => {
    await seed("existing", { time: "10:00 AM" });
    await expect(
      createAdminBooking(staffDb(), walkin({ time: "10:30 AM" })),
    ).rejects.toThrow(/Existing Client.*10:00 AM – 11:00 AM/);
  });

  it("does not touch the existing booking", async () => {
    await seed("existing", { time: "10:00 AM" });
    await createAdminBooking(staffDb(), walkin({ time: "10:30 AM" })).catch(
      () => undefined,
    );
    const snap = await getDoc(doc(staffDb(), "bookings/existing"));
    expect(snap.data()?.customerName).toBe("Existing Client");
  });

  it("is blocked at the exact same start time too (the old overwrite case)", async () => {
    await seed("existing", { time: "10:00 AM" });
    await expect(
      createAdminBooking(staffDb(), walkin({ time: "10:00 AM" })),
    ).rejects.toBeInstanceOf(BookingConflictError);
    expect(await bookingIds()).toEqual(["existing"]);
  });

  it("only blocks the same stylist and the same date", async () => {
    await seed("existing", { time: "10:00 AM" });
    const db = staffDb();
    await createAdminBooking(db, walkin({ stylistId: "stylist-other" }));
    await createAdminBooking(db, walkin({ date: "2026-12-02" }));
    expect(await bookingIds()).toHaveLength(3);
  });

  it("back-to-back bookings are allowed", async () => {
    await seed("existing", { time: "10:00 AM" });
    await createAdminBooking(staffDb(), walkin({ time: "11:00 AM" }));
    expect(await bookingIds()).toHaveLength(2);
  });

  it("a cancelled or no-show booking does not block the slot", async () => {
    await seed("cancelled", { time: "10:00 AM", status: "cancelled" });
    await seed("noshow", { time: "11:00 AM", status: "no_show" });
    const db = staffDb();
    await createAdminBooking(db, walkin({ time: "10:00 AM" }));
    await createAdminBooking(db, walkin({ time: "11:00 AM" }));
    expect(await bookingIds()).toHaveLength(4);
  });
});

describe("rest windows — a booking may sit inside another booking's rest time", () => {
  // Colour: 30 min hands-on, 60 min processing → 10:00-10:30 active, 10:30-11:30 rest
  const colour = { activeTime: 30, restTime: 60, totalTime: 90 };

  it("walk-in whose hands-on time fits inside the rest window is allowed", async () => {
    await seed("colour", { time: "10:00 AM", ...colour });
    const id = await createAdminBooking(
      staffDb(),
      walkin({ time: "10:30 AM", activeTime: 45, totalTime: 45 }),
    );
    expect(id).toBeTruthy();
    expect(await bookingIds()).toHaveLength(2);
  });

  it("walk-in that would need the stylist during the active phase is blocked", async () => {
    await seed("colour", { time: "10:00 AM", ...colour });
    await expect(
      createAdminBooking(staffDb(), walkin({ time: "10:15 AM" })),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it("walk-in whose hands-on time overruns the rest window is blocked", async () => {
    await seed("colour", { time: "10:00 AM", ...colour });
    await expect(
      createAdminBooking(
        staffDb(),
        walkin({ time: "11:00 AM", activeTime: 60, totalTime: 60 }),
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });
});

describe("breaks", () => {
  it("a break overlapping a booking is blocked", async () => {
    await seed("existing", { time: "10:00 AM" });
    await expect(
      createAdminBooking(staffDb(), breakBlock({ time: "10:30 AM" })),
    ).rejects.toBeInstanceOf(BookingConflictError);
    expect(await bookingIds()).toEqual(["existing"]);
  });

  it("a walk-in overlapping a break is blocked", async () => {
    const db = staffDb();
    await createAdminBooking(db, breakBlock({ time: "1:00 PM" }));
    await expect(
      createAdminBooking(
        db,
        walkin({ time: "1:00 PM", totalTime: 30, activeTime: 30 }),
      ),
    ).rejects.toThrow(/a break \(Lunch\), 1:00 PM – 1:30 PM/);
  });

  it("a break in free time is allowed", async () => {
    await seed("existing", { time: "10:00 AM" });
    await createAdminBooking(staffDb(), breakBlock({ time: "1:00 PM" }));
    expect(await bookingIds()).toHaveLength(2);
  });
});

describe("D1 — document IDs are unique and never reuse a slot's identity", () => {
  it("re-using a freed slot creates a new document, not an overwrite", async () => {
    const db = staffDb();
    const first = await createAdminBooking(
      db,
      walkin({ customerName: "First Client" }),
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc(`bookings/${first}`)
        .update({ status: "cancelled" });
    });
    const second = await createAdminBooking(
      db,
      walkin({ customerName: "Second Client" }),
    );

    expect(second).not.toBe(first);
    const firstDoc = await getDoc(doc(db, "bookings", first));
    const secondDoc = await getDoc(doc(db, "bookings", second));
    expect(firstDoc.data()?.customerName).toBe("First Client");
    expect(secondDoc.data()?.customerName).toBe("Second Client");
  });

  it("50 bookings produce 50 distinct IDs, none derived from date/stylist/time", async () => {
    const db = staffDb();
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      // Different days so none conflict; same stylist and same time on purpose
      const date = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      ids.push(await createAdminBooking(db, walkin({ date })));
    }
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) {
      expect(id).not.toContain(STYLIST);
      expect(id).not.toContain("10:00");
    }
  });

  it("the slotBlocks projection shares the booking's ID and holds no PII", async () => {
    const db = staffDb();
    const id = await createAdminBooking(
      db,
      walkin({
        customerName: "Private Person",
        customerPhone: "0412345678",
        notes: "secret",
      }),
    );
    const slot = await getDoc(doc(db, "slotBlocks", id));
    expect(slot.exists()).toBe(true);
    expect(Object.keys(slot.data() ?? {}).sort()).toEqual([
      "activeTime",
      "busy",
      "date",
      "restTime",
      "returnAt",
      "status",
      "stylistId",
      "time",
      "totalTime",
    ]);
  });

  it("a named client's visit record is incremented", async () => {
    const db = staffDb();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc("customerLookups/0412345678")
        .set(validCustomerLookup({ visitCount: 3 }));
    });
    await createAdminBooking(
      db,
      walkin({ customerName: "Jane", customerPhone: "0412 345 678" }),
    );
    const snap = await getDoc(doc(db, "customerLookups", "0412345678"));
    expect(snap.data()).toMatchObject({
      name: "Jane",
      visitCount: 4,
      lastVisit: DATE,
    });
  });
});

describe("D1 — two admins saving the same slot at once cannot both win", () => {
  it("two simultaneous creates for the same slot: exactly one succeeds", async () => {
    const results = await Promise.allSettled([
      createAdminBooking(
        staffDb("admin-a"),
        walkin({ customerName: "Admin A client" }),
      ),
      createAdminBooking(
        staffDb("admin-b"),
        walkin({ customerName: "Admin B client" }),
      ),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BookingConflictError,
    );
    expect(await bookingIds()).toHaveLength(1);
  });

  it("overlapping (not identical) simultaneous creates: still exactly one wins", async () => {
    const results = await Promise.allSettled([
      createAdminBooking(staffDb("admin-a"), walkin({ time: "10:00 AM" })),
      createAdminBooking(staffDb("admin-b"), walkin({ time: "10:30 AM" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bookingIds()).toHaveLength(1);
  });

  it("a walk-in and a break racing for the same slot: exactly one wins", async () => {
    const results = await Promise.allSettled([
      createAdminBooking(staffDb("admin-a"), walkin()),
      createAdminBooking(staffDb("admin-b"), breakBlock({ time: "10:00 AM" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bookingIds()).toHaveLength(1);
  });

  it("five admins racing, repeated: never more than one booking per slot", async () => {
    for (let round = 0; round < 3; round++) {
      const date = `2026-12-1${round}`;
      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((n) =>
          createAdminBooking(
            staffDb(`admin-${n}`),
            walkin({ date, customerName: `Client ${n}` }),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") {
          expect(r.reason).toBeInstanceOf(BookingConflictError);
        }
      }
    }
    const snap = await getDocs(collection(staffDb(), "bookings"));
    expect(snap.size).toBe(3);
  });

  it("different stylists saving at the same time do not block each other", async () => {
    const results = await Promise.allSettled([
      createAdminBooking(
        staffDb("admin-a"),
        walkin({ stylistId: "stylist-a" }),
      ),
      createAdminBooking(
        staffDb("admin-b"),
        walkin({ stylistId: "stylist-b" }),
      ),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await bookingIds()).toHaveLength(2);
  });
});

describe("security — the write path still needs a staff login", () => {
  it("an anonymous visitor cannot create an admin walk-in", async () => {
    await assertFails(createAdminBooking(anonDb(), walkin()));
  });
});
