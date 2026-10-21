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
import { findExisting, findExistingRecords, listBatches, rollbackBatch, runImport } from "../../src/lib/clientImportWrites";
import {
  createTestEnv,
  ownerCtx,
  stylistCtx,
} from "./testEnv";
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
  it("writes 1,250 clients in chunks of 150, each chunk with one ledger entry", async () => {
    const result = await runImport(owner(), entries(1250), { batchId: "b1", uid: "owner-uid" });
    expect(result).toEqual({ batchId: "b1", created: 1250, existed: 0 });
    expect(await lookup(1)).toEqual({ name: "Test Client 1", lastVisit: "", visitCount: 0 });
    expect(await lookup(1250)).toEqual({ name: "Test Client 1250", lastVisit: "", visitCount: 0 });

    const chunks = await ledgerChunks("b1");
    expect(chunks.map((c) => c.length)).toEqual([...Array(8).fill(IMPORT_CHUNK), 50]);
    expect(new Set(chunks.flat()).size).toBe(1250);

    const batch = (await getDoc(doc(owner(), "importBatches", "b1"))).data()!;
    expect(batch).toMatchObject({ status: "complete", created: 1250, existed: 0, planned: 1250, createdBy: "owner-uid", source: "fresha-client-list" });
  }, 120_000);

  it("reports progress as it goes", async () => {
    const seen: number[] = [];
    await runImport(owner(), entries(900), { batchId: "b1", uid: "owner-uid", onProgress: (d) => seen.push(d) });
    expect(seen).toEqual([150, 300, 450, 600, 750, 900]);
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

  it("an imported client's next online booking still merges in (written by the booking function), and the public cannot write the record", async () => {
    await runImport(owner(), entries(3), { batchId: "b1", uid: "owner-uid" });
    // The public can no longer write customerLookups (DEC-033)...
    const anon = anonDb(testEnv);
    await assertFails(
      setDoc(doc(anon, "customerLookups", phone(2)), { name: "Test Client 2", lastVisit: "2026-12-01", visitCount: increment(1) }, { merge: true }),
    );
    // ...createBookingRequest does it with the Admin SDK (rules bypassed)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(2)}`).set({ name: "Test Client 2", lastVisit: "2026-12-01", visitCount: 1 }, { merge: true });
    });
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
    // the booking function's merge (Admin SDK; the public cannot write lookups any more)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(3)}`).set({ name: "Test Client 3", lastVisit: "2026-12-01", visitCount: 1 }, { merge: true });
    });
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
          // stops after the fifth chunk of 150 (chunks commit in whole: 750 clients)
          if (done >= 750) throw new Error("stop");
        },
      }),
    ).rejects.toThrow("stop");
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "failed", created: 750 });
    expect((await ledgerChunks("b1")).flat()).toHaveLength(750);
    expect(await lookup(750)).toBeDefined();
    expect(await lookup(751)).toBeUndefined();
    expect(await rollbackBatch(owner(), "b1")).toEqual({ removed: 750, kept: 0 });
    expect(await lookup(1)).toBeUndefined();
    expect(await clientDoc(750)).toBeUndefined(); // the client documents it made go too
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
    const stylist = stylistCtx(testEnv).firestore();
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
    const o = ownerCtx(testEnv, "owner-uid").firestore();
    await assertSucceeds(o.doc("importBatches/b1").set({ status: "running", source: "x" }));
    await assertFails(o.doc("importBatches/b2").set({ status: "weird", source: "x" }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: "0400000001" }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: Array.from({ length: 501 }, (_, i) => phone(i)) }));
    await assertFails(o.doc("importBatches/b1/chunks/0").set({ phones: [], extra: 1 }));
    await assertSucceeds(o.doc("importBatches/b1/chunks/0").set({ phones: Array.from({ length: 500 }, (_, i) => phone(i)) }));
  });
});

// ── Blocked clients (DEC-039) ────────────────────────────────────────────────
describe("import: blocked clients", () => {
  const blockedEntries = (nums: number[]): ImportEntry[] =>
    nums.map((n) => ({ phone: phone(n), name: `Test Client ${n}`, row: n + 1, blocked: true }));
  const flag = async (n: number) =>
    (await getDoc(doc(owner(), "customerLookups", phone(n)))).get("blocked");
  const ledgerBlocked = async (batchId: string) =>
    (await getDocs(collection(owner(), "importBatches", batchId, "chunks"))).docs.flatMap(
      (d) => (d.data().blocked ?? []) as string[],
    );

  it("stores blocked: true on a new blocked client and nothing on the others; nothing else is added", async () => {
    const all = [...entries(3, 1), ...blockedEntries([4])];
    const result = await runImport(owner(), all, { batchId: "b1", uid: "owner-uid" });
    expect(result).toMatchObject({ created: 4, existed: 0, flagged: 1 });
    expect(await lookup(4)).toEqual({ name: "Test Client 4", lastVisit: "", visitCount: 0, blocked: true });
    expect(await lookup(1)).toEqual({ name: "Test Client 1", lastVisit: "", visitCount: 0 }); // no blocked field at all
    expect(await ledgerBlocked("b1")).toEqual([phone(4)]);
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "complete", flagged: 1 });
  });

  it("an EXISTING client Fresha has blocked gets the flag and nothing else changes", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(7)}`).set({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5 });
    });
    const result = await runImport(owner(), blockedEntries([7]), { batchId: "b1", uid: "owner-uid" });
    expect(result).toMatchObject({ created: 0, existed: 1, flagged: 1 });
    expect(await lookup(7)).toEqual({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5, blocked: true });
    expect(await ledgerBlocked("b1")).toEqual([phone(7)]);
  });

  it("an existing client who is already blocked is not counted or recorded again", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(8)}`).set({ name: "Already", lastVisit: "", visitCount: 0, blocked: true });
    });
    const result = await runImport(owner(), blockedEntries([8]), { batchId: "b1", uid: "owner-uid" });
    expect(result.flagged).toBeUndefined();
    expect(await ledgerBlocked("b1")).toEqual([]);
  });

  it("findExistingRecords reports whether an existing record is already blocked", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(1)}`).set({ name: "A", lastVisit: "", visitCount: 0, blocked: true });
      await ctx.firestore().doc(`customerLookups/${phone(2)}`).set({ name: "B", lastVisit: "", visitCount: 0 });
    });
    const found = await findExistingRecords(owner(), [phone(1), phone(2), phone(3)]);
    expect([...found.entries()]).toEqual([
      [phone(1), { blocked: true }],
      [phone(2), { blocked: false }],
    ]);
  });

  it("rollback removes a created blocked client's record, and removes ONLY the flag it set on an existing one", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(7)}`).set({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5 });
      await ctx.firestore().doc(`customerLookups/${phone(8)}`).set({ name: "Blocked Before", lastVisit: "", visitCount: 0, blocked: true });
    });
    await runImport(owner(), [...entries(2, 1), ...blockedEntries([4, 7, 8])], { batchId: "b1", uid: "owner-uid" });
    expect(await flag(7)).toBe(true);

    const result = await rollbackBatch(owner(), "b1");
    expect(result).toMatchObject({ removed: 3, kept: 0, unblocked: 1 }); // 1,2,4 removed; 7's flag removed
    expect(await lookup(4)).toBeUndefined(); // created blocked: gone entirely
    expect(await lookup(7)).toEqual({ name: "Real Visitor", lastVisit: "2026-09-01", visitCount: 5 }); // flag gone, record intact
    expect(await lookup(8)).toEqual({ name: "Blocked Before", lastVisit: "", visitCount: 0, blocked: true }); // was blocked before: untouched
    expect(await ledgerChunks("b1")).toEqual([]);
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "rolled_back", unblocked: 1 });
  });

  it("rollback keeps a created client who has booked since, but still removes the flag the import set", async () => {
    await runImport(owner(), blockedEntries([5]), { batchId: "b1", uid: "owner-uid" });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`customerLookups/${phone(5)}`).set({ lastVisit: "2026-12-01", visitCount: 1 }, { merge: true });
    });
    const result = await rollbackBatch(owner(), "b1");
    expect(result).toMatchObject({ removed: 0, kept: 1, unblocked: 1 });
    expect(await lookup(5)).toEqual({ name: "Test Client 5", lastVisit: "2026-12-01", visitCount: 1 });
  });

  it("is idempotent: importing the same blocked list twice flags and creates nothing the second time; rolling back twice is harmless", async () => {
    const list = [...entries(3, 1), ...blockedEntries([4])];
    await runImport(owner(), list, { batchId: "b1", uid: "owner-uid" });
    const again = await runImport(owner(), list, { batchId: "b2", uid: "owner-uid" });
    expect(again).toMatchObject({ created: 0, existed: 4 });
    expect(again.flagged).toBeUndefined();
    await rollbackBatch(owner(), "b1");
    expect(await rollbackBatch(owner(), "b1")).toEqual({ removed: 0, kept: 0 });
  });

  it("the blocked flag lives in an owner-only collection: stylists and the public cannot read it", async () => {
    await runImport(owner(), blockedEntries([4]), { batchId: "b1", uid: "owner-uid" });
    const stylist = stylistCtx(testEnv).firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    for (const db of [stylist, anon]) {
      await assertFails(db.doc(`customerLookups/${phone(4)}`).get());
      await assertFails(db.collection("customerLookups").get());
    }
  });
});

// ── The client records the import also makes (DEC-044) ───────────────────────

const clientDoc = async (n: number) => (await getDoc(doc(owner(), "clients", phone(n)))).data();
const cardDoc = async (n: number) => (await getDoc(doc(owner(), "clientCards", phone(n)))).data();

describe("import: client records", () => {
  it("makes a client and a card for every new client, with no bookings, from Fresha, dated when Fresha added them", async () => {
    const list = entries(3).map((e, i) => ({ ...e, added: `2026-0${i + 1}-15`, ...(i === 2 ? { blocked: true } : {}) }));
    await runImport(owner(), list, { batchId: "b1", uid: "owner-uid" });
    expect(await clientDoc(1)).toMatchObject({
      phone: phone(1),
      name: "Test Client 1",
      source: "fresha-import",
      createdAt: "2026-01-15T00:00:00.000Z",
      bookingCount: 0,
      totalVisits: 0,
      totalSpend: 0,
      blocked: false,
      tags: [],
      stylistIds: [],
      nameLower: "test client 1",
    });
    expect((await clientDoc(1))!.searchTokens).toEqual(["test", "client"]);
    expect(await clientDoc(3)).toMatchObject({ blocked: true });
    expect(Object.keys((await cardDoc(1))!).sort()).toEqual(["blocked", "id", "name", "nameLower", "phone", "searchTokens", "stylistIds", "tags"]);
    expect(await cardDoc(3)).toMatchObject({ blocked: true });
    expect((await ledgerChunks("b1")).flat().length).toBe(3);
  });

  it("never recreates or overwrites a client who already exists (one with history and a name the owner set)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`clients/${phone(5)}`).set({
        phone: phone(5), name: "Real Client", nameOverride: true, tags: ["vip"], blocked: false,
        bookingCount: 7, totalVisits: 6, totalSpend: 600, source: "online", createdAt: "2025-01-01T00:00:00.000Z",
      });
    });
    await runImport(owner(), entries(10), { batchId: "b1", uid: "owner-uid" });
    expect(await clientDoc(5)).toMatchObject({ name: "Real Client", bookingCount: 7, totalSpend: 600, source: "online", tags: ["vip"] });
    expect(await clientDoc(4)).toMatchObject({ source: "fresha-import" });
  });

  it("importing the same file again changes nothing and counts nothing twice", async () => {
    await runImport(owner(), entries(20), { batchId: "first", uid: "owner-uid" });
    const before = await clientDoc(7);
    const again = await runImport(owner(), entries(20), { batchId: "second", uid: "owner-uid" });
    expect(again).toMatchObject({ created: 0, existed: 20 });
    expect(await clientDoc(7)).toEqual(before);
    expect(before).toMatchObject({ totalVisits: 0, totalSpend: 0, bookingCount: 0 });
  });

  it("an existing client Fresha has blocked gets only the flag, on the client and the card as well", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`customerLookups/${phone(2)}`).set({ name: "Existing", lastVisit: "2026-09-01", visitCount: 4 });
      await db.doc(`clients/${phone(2)}`).set({ phone: phone(2), name: "Existing", blocked: false, tags: [], bookingCount: 4, totalVisits: 4, source: "online" });
      await db.doc(`clientCards/${phone(2)}`).set({ id: phone(2), phone: phone(2), name: "Existing", blocked: false, tags: [], stylistIds: [], searchTokens: [], nameLower: "existing" });
    });
    await runImport(owner(), entries(3).map((e) => (e.phone === phone(2) ? { ...e, blocked: true } : e)), { batchId: "b1", uid: "owner-uid" });
    expect(await clientDoc(2)).toMatchObject({ blocked: true, name: "Existing", bookingCount: 4 });
    expect(await cardDoc(2)).toMatchObject({ blocked: true });
    // rollback removes only the flag it set
    await rollbackBatch(owner(), "b1");
    expect(await clientDoc(2)).toMatchObject({ blocked: false, name: "Existing", bookingCount: 4 });
    expect(await cardDoc(2)).toMatchObject({ blocked: false });
  });

  it("rollback removes the clients and cards the import made, but keeps one with a booking, an edit or a note", async () => {
    await runImport(owner(), entries(6), { batchId: "b1", uid: "owner-uid" });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`clients/${phone(2)}`).update({ bookingCount: 1, totalVisits: 1 }); // has a booking now
      await db.doc(`clients/${phone(3)}`).update({ tags: ["vip"] }); // the owner edited them
      await db.doc(`clients/${phone(4)}/notes/n1`).set({ text: "Prefers mornings", authorUid: "u", authorName: "Owner", createdAt: "x", pinned: false });
    });
    await rollbackBatch(owner(), "b1");
    expect(await clientDoc(1)).toBeUndefined();
    expect(await cardDoc(1)).toBeUndefined();
    expect(await clientDoc(5)).toBeUndefined();
    for (const n of [2, 3, 4]) expect(await clientDoc(n), `client ${n} is kept`).toBeDefined();
    expect((await getDoc(doc(owner(), "importBatches", "b1"))).data()).toMatchObject({ status: "rolled_back", clientsRemoved: 3 });
  });
});
