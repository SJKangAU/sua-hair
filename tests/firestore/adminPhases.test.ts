// tests/firestore/adminPhases.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Phases (DEC-026) through the real write paths, against the Firestore
// emulator WITH the real security rules - `npm run test:admin`:
//   - a three-phase booking stores its phases, its absolute segments and a
//     PII-free busy projection, in one transaction
//   - other clients fit in the processing gap but not on the return block
//   - editing ONE booking's phases is conflict-checked in a transaction, names
//     the clash, writes nothing when refused, and never touches the service
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import {
  createAdminBooking,
  updateBookingWithSlotLock,
  writePhaseEdit,
  writeStatusChange,
} from "../../src/lib/adminBookingWrites";
import { BookingConflictError } from "../../src/lib/bookingConflicts";
import { phaseEditHistoryEntry } from "../../src/lib/bookingHistory";
import { resolvePhases } from "../../src/lib/bookingPhases";
import { phaseWriteFields } from "../../src/lib/phaseFields";
import { toSlotBlock } from "../../src/lib/slotBlockData";
import { buildStatusPatch } from "../../src/lib/statusPatch";
import type { Booking, Phase } from "../../src/types";
import { createTestEnv } from "./testEnv";
import { DATE, staffDb as staffDbIn, walkin } from "./adminHelpers";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv();
});
afterAll(async () => {
  await testEnv.cleanup();
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("services/perm").set({
      name: "Digital perm",
      phases: PERM,
      activeTime: 90,
      restTime: 30,
      totalTime: 120,
      price: { director: 300, senior: 260, junior: 220 },
      status: "active",
    });
  });
});

const staffDb = (uid?: string) => staffDbIn(testEnv, uid);

const A = (minutes: number): Phase => ({ type: "active", minutes });
const R = (minutes: number): Phase => ({ type: "rest", minutes });
const PERM: Phase[] = [A(60), R(30), A(30)]; // busy 10:00-11:00 and 11:30-12:00 when started at 10:00

function phased(time: string, phases: Phase[], over: Partial<Booking> = {}): Omit<Booking, "id"> {
  return walkin({ time, ...phaseWriteFields(time, phases), ...over });
}

async function seedPhased(id: string, time: string, phases: Phase[], over: Partial<Booking> = {}) {
  const b = phased(time, phases, { customerName: `Client ${id}`, ...over });
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`bookings/${id}`).set(b);
    await ctx.firestore().doc(`slotBlocks/${id}`).set(toSlotBlock(b));
  });
  return b;
}

async function load(id: string): Promise<Booking> {
  const snap = await getDoc(doc(staffDb(), "bookings", id));
  return { id, ...snap.data() } as Booking;
}

const edit = async (id: string, phases: Phase[], db = staffDb()) => {
  const previous = await load(id);
  const entry = phaseEditHistoryEntry(resolvePhases(previous), phases, undefined);
  return writePhaseEdit(db, previous, phases, entry);
};

describe("a three-phase booking is stored with its phases and a PII-free busy projection", () => {
  it("writes phases, absolute segments, legacy totals and the return time", async () => {
    const id = await createAdminBooking(staffDb(), phased("10:00 AM", PERM, { customerPhone: "0412345678" }));
    const b = await load(id);
    expect(b.phases).toEqual(PERM);
    expect(b.segments).toEqual([
      { type: "active", start: 600, end: 660 },
      { type: "rest", start: 660, end: 690 },
      { type: "active", start: 690, end: 720 },
    ]);
    expect([b.activeTime, b.restTime, b.totalTime]).toEqual([90, 30, 120]);
    expect(b.returnTime).toBe("11:30 AM"); // the processing gap ends, the stylist is due back
  });

  it("the slotBlocks projection holds the busy blocks only, and nothing identifying", async () => {
    const id = await createAdminBooking(
      staffDb(),
      phased("10:00 AM", PERM, { customerName: "Private Person", customerPhone: "0412345678", notes: "secret" }),
    );
    const slot = (await getDoc(doc(staffDb(), "slotBlocks", id))).data() ?? {};
    expect(slot.busy).toEqual([{ start: 600, end: 660 }, { start: 690, end: 720 }]);
    expect(slot.returnAt).toBeNull(); // ends in hands-on: no return point
    expect(JSON.stringify(slot)).not.toMatch(/Private|0412345678|secret/);
  });

  it("a booking that ends in processing records the minute the stylist is due back", async () => {
    const id = await createAdminBooking(staffDb(), phased("10:00 AM", [A(30), R(60)]));
    const slot = (await getDoc(doc(staffDb(), "slotBlocks", id))).data() ?? {};
    expect(slot.busy).toEqual([{ start: 600, end: 630 }]);
    expect(slot.returnAt).toBe(690);
  });
});

describe("other clients and the processing gap", () => {
  it("a client can be booked into the processing gap", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    const id = await createAdminBooking(staffDb(), phased("11:00 AM", [A(30)], { customerName: "Gap Client" }));
    expect(id).toBeTruthy();
  });

  it("a client who would run onto the return block is refused, naming the perm", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await expect(createAdminBooking(staffDb(), phased("11:00 AM", [A(45)]))).rejects.toThrow(/Client perm.*10:00 AM – 12:00 PM/);
  });

  it("a client colliding with only the return block is refused", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await expect(createAdminBooking(staffDb(), phased("11:15 AM", [A(30)]))).rejects.toBeInstanceOf(BookingConflictError);
  });

  it("back-to-back is allowed on both sides of every busy block", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    const db = staffDb();
    await createAdminBooking(db, phased("9:30 AM", [A(30)]));
    await createAdminBooking(db, phased("12:00 PM", [A(60)]));
  });

  it("a three-phase booking is refused where its return block would land on another booking", async () => {
    await seedPhased("other", "11:15 AM", [A(30)]);
    await expect(createAdminBooking(staffDb(), phased("10:00 AM", PERM))).rejects.toBeInstanceOf(BookingConflictError);
    await createAdminBooking(staffDb(), phased("10:15 AM", PERM)); // busy 10:15-11:15 and 11:45-12:15
  });

  it("restoring a cancelled three-phase booking checks ALL its busy blocks", async () => {
    await seedPhased("perm", "10:00 AM", PERM, { status: "cancelled" });
    await createAdminBooking(staffDb(), phased("11:30 AM", [A(30)])); // takes the cancelled booking's return block
    const previous = await load("perm");
    const { patch } = buildStatusPatch(previous, "confirmed");
    await expect(writeStatusChange(staffDb(), previous, "confirmed", patch)).rejects.toBeInstanceOf(BookingConflictError);
    expect((await load("perm")).status).toBe("cancelled");
  });

  it("rescheduling checks the moved booking's return block too", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await seedPhased("blocker", "2:15 PM", [A(30)]); // 2:15-2:45
    const p = await load("perm");
    // moved to 2:00: busy 2:00-3:00 collides
    await expect(
      updateBookingWithSlotLock(
        staffDb(), "perm",
        { stylistId: p.stylistId, date: DATE, time: "2:00 PM", totalTime: p.totalTime, activeTime: p.activeTime, phases: p.phases },
        { time: "2:00 PM" }, { time: "2:00 PM" },
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
  });
});

describe("customising ONE booking's phases", () => {
  it("longer processing pushes the return later: booking, segments, return time and projection all move", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await edit("perm", [A(60), R(60), A(30)]);
    const b = await load("perm");
    expect(b.phases).toEqual([A(60), R(60), A(30)]);
    expect(b.segments?.at(-1)).toEqual({ type: "active", start: 720, end: 750 });
    expect(b.totalTime).toBe(150);
    expect(b.history?.at(-1)?.label).toMatch(/processing 30 to 60 min/);
    const slot = (await getDoc(doc(staffDb(), "slotBlocks", "perm"))).data() ?? {};
    expect(slot.busy).toEqual([{ start: 600, end: 660 }, { start: 720, end: 750 }]);
    expect(slot.totalTime).toBe(150);
    // identity fields untouched
    expect(b.customerName).toBe("Client perm");
    expect(b.servicePrice).toBe(90);
  });

  it("the service the booking came from is never touched", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    const before = (await getDoc(doc(staffDb(), "services", "perm"))).data();
    await edit("perm", [A(90), R(45), A(15)]);
    expect((await getDoc(doc(staffDb(), "services", "perm"))).data()).toEqual(before);
  });

  it("an edit that collides is refused, names the clash, and writes nothing", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await seedPhased("later", "12:00 PM", [A(60)]);
    const before = await load("perm");
    await expect(edit("perm", [A(60), R(60), A(30)])).rejects.toThrow(/Client later/); // return block 12:00-12:30
    expect(await load("perm")).toEqual(before);
    const slot = (await getDoc(doc(staffDb(), "slotBlocks", "perm"))).data() ?? {};
    expect(slot.busy).toEqual([{ start: 600, end: 660 }, { start: 690, end: 720 }]);
  });

  it("shortening processing while another client is booked in the gap is refused", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    await seedPhased("gap", "11:00 AM", [A(30)]);
    await expect(edit("perm", [A(60), R(15), A(30)])).rejects.toThrow(/Client gap/);
    expect((await load("perm")).phases).toEqual(PERM);
  });

  it("a legacy booking with no phases can be edited", async () => {
    const legacy = walkin({ time: "10:00 AM", activeTime: 30, restTime: 60, totalTime: 90, customerName: "Legacy" });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("bookings/old").set(legacy);
      await ctx.firestore().doc("slotBlocks/old").set({
        stylistId: legacy.stylistId, date: DATE, time: "10:00 AM", activeTime: 30, restTime: 60, totalTime: 90, status: "confirmed",
      });
    });
    await edit("old", [A(30), R(75)]);
    const b = await load("old");
    expect(b.phases).toEqual([A(30), R(75)]);
    expect(b.totalTime).toBe(105);
    const slot = (await getDoc(doc(staffDb(), "slotBlocks", "old"))).data() ?? {};
    expect(slot.returnAt).toBe(705);
  });

  it("an edit and a new booking racing for the same stretch of the day cannot both win", async () => {
    await seedPhased("a", "10:00 AM", [A(30), R(60), A(30)]); // busy 10:00-10:30, return block 11:30-12:00
    // edit: processing 60 -> 90 moves the return block to 12:00-12:30
    // create: a 30-minute client at 12:00 (free today, but not once the return moves)
    const results = await Promise.allSettled([
      edit("a", [A(30), R(90), A(30)], staffDb("admin-a")),
      createAdminBooking(staffDb("admin-b"), phased("12:00 PM", [A(30)], { customerName: "Racer" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BookingConflictError);
  });
});

describe("only staff can write phases", () => {
  it("an anonymous visitor cannot edit a booking's phases", async () => {
    await seedPhased("perm", "10:00 AM", PERM);
    const anon = (testEnv.unauthenticatedContext().firestore() as unknown as { _delegate: import("firebase/firestore").Firestore })._delegate;
    const previous = await load("perm");
    await expect(
      writePhaseEdit(anon, previous, [A(60), R(60), A(30)], phaseEditHistoryEntry(PERM, PERM, undefined)),
    ).rejects.toThrow();
  });
});
