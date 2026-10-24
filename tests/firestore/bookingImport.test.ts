// tests/firestore/bookingImport.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The Fresha appointments import through its real write path (bookingImportWrites.ts),
// against the Firestore emulator WITH the real security rules - `npm run test:admin`.
// Fake people only.
//   - writes the booking, its slotBlocks projection and a ledger entry together
//   - idempotent: the Fresha ref is found, so a second run is a no-op for the dry run
//   - a clash with a booking already in the app is skipped, not double-booked
//   - a cancelled booking holds no slot
//   - rollback removes untouched bookings and keeps one the salon has since changed
//   - the ledger is owner-only
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { buildPlan, dryRun, type RawRow, type StylistRef } from "../../src/lib/bookingImport";
import { findExistingRefs, rollbackBookingBatch, runImport } from "../../src/lib/bookingImportWrites";
import { createTestEnv, stylistCtx } from "./testEnv";
import { staffDb } from "./adminHelpers";

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
    await ctx.firestore().doc("users/owner-uid").set({ role: "owner" });
    await ctx.firestore().doc("users/stylist-uid").set({ role: "stylist" });
  });
});

const owner = () => staffDb(testEnv, "owner-uid");
const sam: StylistRef = { id: "st-1", name: "Sam", level: "director" };
const map = new Map<string, StylistRef | undefined>([["Sam", sam]]);
const row = (n: number, over: RawRow = {}): RawRow => ({
  "Ref #": `#T${String(n).padStart(7, "0")}`,
  Client: `Test Person ${n}`,
  Service: "Cut",
  "Scheduled Date": "2027-01-30",
  Time: "9:00 am",
  Duration: "30",
  Staff: "Sam",
  Price: "40.00",
  Status: "Booked",
  ...over,
});
const ready = (rows: RawRow[], existing = new Set<string>()) => dryRun(buildPlan(rows), map, existing).toCreate;
const ids = async (name: string) => (await getDocs(collection(owner(), name))).docs.map((d) => d.id);

describe("booking import", () => {
  it("writes the booking, its projection and a ledger entry together", async () => {
    const r = await runImport(owner(), ready([row(1)]), { batchId: "b1", uid: "owner-uid" });
    expect(r).toEqual({ batchId: "b1", created: 1, clashed: 0 });
    const [id] = await ids("bookings");
    const b = (await getDoc(doc(owner(), "bookings", id))).data()!;
    expect(b).toMatchObject({ bookingRef: "FR-T0000001", status: "confirmed", stylistId: "st-1", customerPhone: "" });
    expect((await getDoc(doc(owner(), "slotBlocks", id))).data()).toMatchObject({ stylistId: "st-1", date: "2027-01-30", time: "9:00 AM" });
    expect((await getDoc(doc(owner(), "importBatches", "b1", "chunks", id))).data()).toEqual({ phones: [], bookings: [id] });
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "complete", created: 1, source: "fresha-appointments" });
  });

  it("a booking with a confirmed number carries it, its client id and the imported marker", async () => {
    const [e] = ready([row(1)]);
    await runImport(owner(), [{ ...e, phone: "0400000001" }], { batchId: "b1", uid: "owner-uid" });
    const [id] = await ids("bookings");
    const b = (await getDoc(doc(owner(), "bookings", id))).data()!;
    expect(b).toMatchObject({ customerPhone: "0400000001", clientId: "0400000001", importedFrom: "fresha-appointments", bookingType: "walkin" });
    // no visit record is written: the booking is not a visit that has happened
    expect(await ids("customerLookups")).toEqual([]);
  });

  it("finds refs already imported", async () => {
    await runImport(owner(), ready([row(1), row(2, { Time: "10:00 am" })]), { batchId: "b1", uid: "owner-uid" });
    const found = await findExistingRefs(owner(), ["FR-T0000001", "FR-T0000002", "FR-T0000003"]);
    expect([...found].sort()).toEqual(["FR-T0000001", "FR-T0000002"]);
  });

  it("skips a booking that clashes with one already in the app", async () => {
    await runImport(owner(), ready([row(1)]), { batchId: "b1", uid: "owner-uid" });
    const r = await runImport(owner(), ready([row(2, { Time: "9:15 am" }), row(3, { Time: "11:00 am" })]), { batchId: "b2", uid: "owner-uid" });
    expect(r).toMatchObject({ created: 1, clashed: 1 });
    expect(await ids("bookings")).toHaveLength(2);
  });

  it("a cancelled booking holds no slot", async () => {
    await runImport(owner(), ready([row(1, { Status: "Canceled" })]), { batchId: "b1", uid: "owner-uid" });
    const r = await runImport(owner(), ready([row(2)]), { batchId: "b2", uid: "owner-uid" });
    expect(r.created).toBe(1);
  });

  it("rollback removes untouched bookings and keeps one that has changed", async () => {
    await runImport(owner(), ready([row(1), row(2, { Time: "10:00 am" })]), { batchId: "b1", uid: "owner-uid" });
    const all = await getDocs(collection(owner(), "bookings"));
    const changed = all.docs.find((d) => d.get("bookingRef") === "FR-T0000002")!;
    await updateDoc(changed.ref, { history: arrayUnion({ at: "x", by: "o", change: "moved" }) });
    const out = await rollbackBookingBatch(owner(), "b1");
    expect(out).toEqual({ removed: 1, kept: 1 });
    expect(await ids("bookings")).toEqual([changed.id]);
    expect(await ids("slotBlocks")).toEqual([changed.id]);
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).get("status")).toBe("rolled_back");
  });

  it("the ledger is owner-only", async () => {
    await runImport(owner(), ready([row(1)]), { batchId: "b1", uid: "owner-uid" });
    const stylist = stylistCtx(testEnv).firestore();
    await assertFails(getDocs(collection(stylist, "importBatches", "b1", "chunks")));
    await assertFails(setDoc(doc(stylist, "importBatches", "b1", "chunks", "x"), { phones: [], bookings: ["x"] }));
  });
});
