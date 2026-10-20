// tests/firestore/smoke.test.ts
// ─────────────────────────────────────────────────────────────────────────
// End-to-end smoke test of the pilot's core promise, against the Firestore
// emulator with the real security rules:
//
//   1. a CLIENT books online (anonymous; pending)
//   2. the OWNER approves it
//   3. an admin then tries an OVERLAPPING walk-in, which must be blocked
//
// plus the public availability view staying PII-free throughout.
// Run via `npm run test:smoke`.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  createAdminBooking,
  writeStatusChange,
} from "../../src/lib/adminBookingWrites";
import { BookingConflictError } from "../../src/lib/bookingConflicts";
import { buildStatusPatch } from "../../src/lib/statusPatch";
import { toSlotBlock } from "../../src/lib/slotBlockData";
import { namePrefixRange } from "../../src/lib/nameRange";
import { generateSlots } from "../../src/lib/scheduling";
import type { Booking, SlotBlock } from "../../src/types";
import { createTestEnv, validPublicBooking } from "./testEnv";
import { DATE, anonDb, staffDb, walkin } from "./adminHelpers";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv();
});
afterAll(async () => {
  await testEnv.cleanup();
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  // The owner's role document is provisioned out-of-band (rules: users/*)
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
  });
});

/** Writes exactly what the public booking form commits: booking + slotBlock +
 *  customerLookups, in one batch, as an anonymous visitor. */
async function clientBooks(db: Firestore): Promise<string> {
  const booking = validPublicBooking({
    date: DATE,
    time: "10:00 AM",
    stylistId: "stylist-steve",
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
  }) as unknown as Omit<Booking, "id">;
  const ref = doc(collection(db, "bookings"));
  const batch = writeBatch(db);
  batch.set(ref, booking);
  batch.set(doc(db, "slotBlocks", ref.id), toSlotBlock(booking));
  batch.set(
    doc(db, "customerLookups", booking.customerPhone),
    { name: booking.customerName, lastVisit: booking.date, visitCount: increment(1) },
    { merge: true },
  );
  await batch.commit();
  return ref.id;
}

describe("smoke: client books -> owner approves -> overlapping walk-in is blocked", () => {
  it("runs the whole pilot-critical path", async () => {
    // 1. Client books online, anonymously
    const clientId = await clientBooks(anonDb(testEnv));

    // The client cannot read any booking back (not even their own)
    await assertFails(
      getDoc(doc(anonDb(testEnv), "bookings", clientId)),
    );

    // Staff see it as pending
    const owner = staffDb(testEnv, "owner-uid");
    const pending = await getDoc(doc(owner, "bookings", clientId));
    expect(pending.data()?.status).toBe("pending");

    // 2. Owner approves it (pending -> confirmed)
    const previous = { id: clientId, ...pending.data() } as Booking;
    const { patch } = buildStatusPatch(previous, "confirmed");
    await writeStatusChange(owner, previous, "confirmed", patch);
    const confirmed = await getDoc(doc(owner, "bookings", clientId));
    expect(confirmed.data()?.status).toBe("confirmed");
    expect(
      (await getDoc(doc(owner, "slotBlocks", clientId))).data()?.status,
    ).toBe("confirmed");

    // 3. An admin tries an overlapping walk-in: blocked, nothing written
    await expect(
      createAdminBooking(
        staffDb(testEnv, "admin-uid"),
        walkin({ time: "10:30 AM", stylistId: "stylist-steve" }),
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
    const all = await getDocs(collection(owner, "bookings"));
    expect(all.size).toBe(1);

    // ...and the same admin can book the next free half hour
    await assertSucceeds(
      createAdminBooking(
        staffDb(testEnv, "admin-uid"),
        walkin({ time: "11:00 AM", stylistId: "stylist-steve" }),
      ),
    );
    expect((await getDocs(collection(owner, "bookings"))).size).toBe(2);
  });

  it("a still-PENDING online booking already blocks an overlapping walk-in", async () => {
    await clientBooks(anonDb(testEnv));
    await expect(
      createAdminBooking(
        staffDb(testEnv, "admin-uid"),
        walkin({ time: "10:00 AM", stylistId: "stylist-steve" }),
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it("the public calendar sees the slot as taken but never any customer data", async () => {
    const clientId = await clientBooks(anonDb(testEnv));
    const publicDb = anonDb(testEnv);
    const snap = await getDocs(collection(publicDb, "slotBlocks"));
    expect(snap.size).toBe(1);
    const data = snap.docs[0].data();
    expect(JSON.stringify(data)).not.toMatch(/Jane|0412345678|Prefers quiet/);
    expect(snap.docs[0].id).toBe(clientId);

    // And the real availability engine marks 10:00-11:00 unavailable from it
    const blocks: SlotBlock[] = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as SlotBlock,
    );
    const slots = generateSlots(DATE, "stylist-steve", 60, 60, blocks);
    const at = (t: string) => slots.find((s) => s.time === t);
    expect(at("10:00 AM")?.available).toBe(false);
    expect(at("10:30 AM")?.available).toBe(false);
    expect(at("11:00 AM")?.available).toBe(true);
  });

  it("an anonymous visitor cannot create a walk-in or approve a booking", async () => {
    const clientId = await clientBooks(anonDb(testEnv));
    await assertFails(
      createAdminBooking(anonDb(testEnv), walkin({ time: "2:00 PM" })),
    );
    const owner = staffDb(testEnv, "owner-uid");
    const previous = {
      id: clientId,
      ...(await getDoc(doc(owner, "bookings", clientId))).data(),
    } as Booking;
    const { patch } = buildStatusPatch(previous, "confirmed");
    await assertFails(
      writeStatusChange(anonDb(testEnv), previous, "confirmed", patch),
    );
  });
});

describe("staff can find a client by typing the start of their name", () => {
  it("the same range query the Clients tab runs returns matching bookings", async () => {
    await clientBooks(anonDb(testEnv)); // customerNameLower is "jane customer"
    const owner = staffDb(testEnv, "owner-uid");
    const search = async (typed: string) => {
      const { from, to } = namePrefixRange(typed);
      const snap = await getDocs(
        query(
          collection(owner, "bookings"),
          where("customerNameLower", ">=", from),
          where("customerNameLower", "<", to),
          limit(50),
        ),
      );
      return snap.size;
    };
    expect(await search("jan")).toBe(1);
    expect(await search("Jane Cus")).toBe(1);
    expect(await search("JANE")).toBe(1);
    expect(await search("zzz")).toBe(0);
  });
});
