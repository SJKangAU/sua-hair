// tests/firestore/clientImport.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The client-list import through its real write path (clientImportWrites.ts),
// against the Firestore emulator WITH the real security rules - `npm run
// test:admin`. Fake people only (generated here: 0400000000 + n, "Test Client n").
//   - batches: 1,250 clients are written in chunks of 400, each with one ledger entry
//   - idempotent: importing the same file twice creates nothing the second time
//   - an existing client (real visit history) is never touched
//   - an imported record still accepts the public booking form's merge write
//   - rollback removes only what the batch created, and keeps a client who has since booked
//   - a stopped import can still be rolled back
//   - the ledger (phone numbers) is owner-only
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, increment, setDoc } from "firebase/firestore";
import type { ImportEntry } from "../../src/lib/clientImport";
import { IMPORT_CHUNK } from "../../src/lib/clientImport";
import { findExisting, listBatches, rollbackBatch, runImport } from "../../src/lib/clientImportWrites";
import { createTestEnv } from "./testEnv";
import { anonDb, staffDb } from "./adminHelpers";

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

const phone = (n: number) => `04${String(n).padStart(8, "0")}`;
const entries = (count: number, from = 1): ImportEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    phone: phone(from + i),
    name: `Test Client ${from + i}`,
    row: from + i + 1,
  }));

const owner = () => staffDb(testEnv, "owner-uid");
const lookup = async (n: number) => (await getDoc(doc(owner(), "customerLookups", phone(n)))).data();
const ledgerChunks = async (batchId: string) =>
  (await getDocs(collection(owner(), "importBatches", batchId, "chunks"))).docs.map((d) => d.data().phones as string[]);

describe("import: batching and the ledger", () => {
  it("writes 1,250 clients in chunks of 400, each chunk with one ledger entry", async () => {
    const result = await runImport(owner(), entries(1250), { batchId: "b1", uid: "owner-uid" });
    expect(result).toEqual({ batchId: "b1", created: 1250, existed: 0 });
    expect(await lookup(1)).toEqual({ name: "Test Client 1", lastVisit: "", visitCount: 0 });
    expect(await lookup(1250)).toEqual({ name: "Test Client 1250", lastVisit: "", visitCount: 0 });

    const chunks = await ledgerChunks("b1");
    expect(chunks.map((c) => c.length)).toEqual([IMPORT_CHUNK, IMPORT_CHUNK, IMPORT_CHUNK, 50]);
    expect(new Set(chunks.flat()).size).toBe(1250);

    const batch = (await getDoc(doc(owner(), "importBatches", "b1"))).data()!;
    expect(batch).toMatchObject({ status: "complete", created: 1250, existed: 0, planned: 1250, createdBy: "owner-uid", source: "fresha-client-list" });
  }, 120_000);

  it("reports progress as it goes", async () => {
    const seen: number[] = [];
    await runImport(owner(), entries(900), { batchId: "b1", uid: "owner-uid", onProgress: (d) => seen.push(d) });
    expect(seen).toEqual([400, 800, 900]);
  });
});

describe("import: idempotent and safe with existing clients", () => {
  it("importing the same file again creates nothing", async () => {
    await runImport(owner(), entries(120), { batchId: "first", uid: "owner-uid" });
    const again = await runImport(owner(), entries(120), { batchId: "second", uid: "owner-uid" });
    expect(again).toMatchObject({ created: 0, existed: 120 });
    expect(await ledgerChunks("second")).toEqual([]); // nothing created, nothing to roll back
    expect(await ledgerChunks("first")).toHaveLength(1);
  });

  it("never touches a client who already has a record (visit history is kept)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(7)}`).set({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5 });
    });
    const result = await runImport(owner(), entries(10), { batchId: "b1", uid: "owner-uid" });
    expect(result).toMatchObject({ created: 9, existed: 1 });
    expect(await lookup(7)).toEqual({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5 });
    expect((await ledgerChunks("b1")).flat()).not.toContain(phone(7));
  });

  it("findExisting sees which numbers already have a record, past Firestore's 30-value limit", async () => {
    await runImport(owner(), entries(75, 1), { batchId: "b1", uid: "owner-uid" });
    const asked = Array.from({ length: 100 }, (_, i) => phone(i + 1));
    const found = await findExisting(owner(), asked);
    expect(found.size).toBe(75);
    expect(found.has(phone(75))).toBe(true);
    expect(found.has(phone(76))).toBe(false);
  });

  it("an imported client's next online booking still writes (the public three-field rule)", async () => {
    await runImport(owner(), entries(3), { batchId: "b1", uid: "owner-uid" });
    const anon = anonDb(testEnv);
    await assertSucceeds(
      setDoc(doc(anon, "customerLookups", phone(2)), { name: "Test Client 2", lastVisit: "2026-12-01", visitCount: increment(1) }, { merge: true }),
    );
    expect(await lookup(2)).toEqual({ name: "Test Client 2", lastVisit: "2026-12-01", visitCount: 1 });
  });
});

describe("import: rollback", () => {
  it("removes what the batch created and nothing else", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(900)}`).set({ name: "Unrelated Client", lastVisit: "", visitCount: 0 });
    });
    await runImport(owner(), entries(450), { batchId: "b1", uid: "owner-uid" });
    const result = await rollbackBatch(owner(), "b1");
    expect(result).toEqual({ removed: 450, kept: 0 });
    expect(await lookup(1)).toBeUndefined();
    expect(await lookup(450)).toBeUndefined();
    expect(await lookup(900)).toEqual({ name: "Unrelated Client", lastVisit: "", visitCount: 0 }); // not this batch's
    expect(await ledgerChunks("b1")).toEqual([]); // the ledger keeps no phone numbers
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "rolled_back", removed: 450, kept: 0 });
  });

  it("keeps a client who has booked since the import", async () => {
    await runImport(owner(), entries(5), { batchId: "b1", uid: "owner-uid" });
    await setDoc(doc(anonDb(testEnv), "customerLookups", phone(3)), { name: "Test Client 3", lastVisit: "2026-12-01", visitCount: increment(1) }, { merge: true });
    const result = await rollbackBatch(owner(), "b1");
    expect(result).toEqual({ removed: 4, kept: 1 });
    expect(await lookup(3)).toEqual({ name: "Test Client 3", lastVisit: "2026-12-01", visitCount: 1 });
    expect(await lookup(2)).toBeUndefined();
  });

  it("rolling back twice is harmless, and a second import after a rollback adds the clients again", async () => {
    await runImport(owner(), entries(20), { batchId: "b1", uid: "owner-uid" });
    await rollbackBatch(owner(), "b1");
    expect(await rollbackBatch(owner(), "b1")).toEqual({ removed: 0, kept: 0 });
    const again = await runImport(owner(), entries(20), { batchId: "b2", uid: "owner-uid" });
    expect(again.created).toBe(20);
  });

  it("a stopped import leaves a ledger of exactly what it wrote, and can be rolled back", async () => {
    await expect(
      runImport(owner(), entries(1000), {
        batchId: "b1",
        uid: "owner-uid",
        onProgress: (done) => {
          if (done >= 800) throw new Error("stop");
        },
      }),
    ).rejects.toThrow("stop");
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "failed", created: 800 });
    expect((await ledgerChunks("b1")).flat()).toHaveLength(800);
    expect(await lookup(800)).toBeDefined();
    expect(await lookup(801)).toBeUndefined();
    expect(await rollbackBatch(owner(), "b1")).toEqual({ removed: 800, kept: 0 });
    expect(await lookup(1)).toBeUndefined();
  }, 120_000);

  it("lists batches newest first", async () => {
    await runImport(owner(), entries(2), { batchId: "a", uid: "owner-uid" });
    await new Promise((r) => setTimeout(r, 15));
    await runImport(owner(), entries(2, 10), { batchId: "b", uid: "owner-uid" });
    expect((await listBatches(owner())).map((b) => b.id)).toEqual(["b", "a"]);
  });
});

describe("import: only the owner can use the ledger", () => {
  it("a stylist account and the public cannot create, read or delete batches or chunks", async () => {
    await runImport(owner(), entries(3), { batchId: "b1", uid: "owner-uid" });
    const stylist = testEnv.authenticatedContext("stylist-uid").firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    for (const db of [stylist, anon]) {
      await assertFails(db.doc("importBatches/b1").get());
      await assertFails(db.collection("importBatches").get());
      await assertFails(db.doc("importBatches/b2").set({ status: "running", source: "x" }));
      await assertFails(db.doc("importBatches/b1/chunks/00000").get());
      await assertFails(db.doc("importBatches/b1/chunks/00009").set({ phones: ["0400000001"] }));
      await assertFails(db.doc("importBatches/b1").delete());
    }
  });

  it("the owner's ledger writes are validated: known status, phone list of at most 500", async () => {
    const o = testEnv.authenticatedContext("owner-uid").firestore();
    await assertSucceeds(o.doc("importBatches/b1").set({ status: "running", source: "x" }));
    await assertFails(o.doc("importBatches/b2").set({ status: "weird", source: "x" }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: "0400000001" }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: Array.from({ length: 501 }, (_, i) => phone(i)) }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: [], extra: 1 }));
    await assertSucceeds(o.doc("importBatches/b1/chunks/0").set({ phones: Array.from({ length: 500 }, (_, i) => phone(i)) }));
  });
});
