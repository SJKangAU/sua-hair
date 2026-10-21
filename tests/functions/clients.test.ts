// tests/functions/clients.test.ts
// The clients collection on the server (DEC-044 to DEC-049), against the Firestore
// emulator: a client is created and kept current IN THE SAME TRANSACTION as every
// booking command, the trigger repairs anything the browser wrote, recompute equals
// what was maintained, the backfill builds clients from what exists (dry run,
// idempotent, rollback) and merge / anonymise / export do what they say.
// Fake people only. `npm run test:functions`.
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveBookingCore,
  assignStylistCore,
  cancelBookingCore,
  createBookingRequestCore,
  declineBookingCore,
  releaseExpiredPendingCore,
  restoreBookingCore,
  type OwnerContext,
} from "../../functions/src/bookingCommands";
import { CommandError } from "../../functions/src/commandErrors";
import {
  anonymiseClientCore,
  clientSyncCore,
  exportClientDataCore,
  mergeClientsCore,
  recomputeAllClients,
  recomputeClient,
  settleClients,
} from "../../functions/src/clients";
import { backfillClientsCore } from "../../functions/src/clientBackfill";
import { adminDb, resetEmulators } from "./adminEnv";
import { THURSDAY, FRIDAY, NOW, at, request, seedBooking, seedSalon } from "./fixtures";

const db = adminDb();
const owner: OwnerContext = { now: NOW, actorUid: "owner-uid" };
const actor = { uid: "owner-uid", name: "Owner" };
const book = (body: unknown) => createBookingRequestCore(db, body, { now: NOW });
const client = async (id: string) => (await db.doc(`clients/${id}`).get()).data();
const card = async (id: string) => (await db.doc(`clientCards/${id}`).get()).data();
const bookingOf = async (id: string) => (await db.doc(`bookings/${id}`).get()).data()!;
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return (err as CommandError).code;
  }
  throw new Error("expected a refusal");
};

// Everything on a client document except the moment it was last written
const stable = (d: FirebaseFirestore.DocumentData | undefined) => {
  const { updatedAt: _u, ...rest } = d ?? {};
  void _u;
  return rest;
};

const PHONE = "0400000001";

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
});

describe("a booking request creates and updates the client in the same transaction", () => {
  it("creates the client and its card, links the booking and sets the summary", async () => {
    const r = await book(request({ customerPhone: PHONE, customerName: "Jane Citizen", stylistId: "steve" }));
    const c = await client(PHONE);
    expect(c).toMatchObject({
      phone: PHONE,
      name: "Jane Citizen",
      nameLower: "jane citizen",
      searchTokens: ["jane", "citizen"],
      source: "online",
      blocked: false,
      tags: [],
      totalVisits: 0, // a pending request is not a visit
      totalSpend: 0,
      hasUpcoming: true,
      nextBookingDate: THURSDAY,
      nextBookingId: r.bookingId,
      stylistIds: ["steve"],
      bookingCount: 1,
    });
    expect((await bookingOf(r.bookingId)).clientId).toBe(PHONE);
    // the card holds no spend, email or blocked reason
    expect(Object.keys((await card(PHONE))!).sort()).toEqual(
      ["blocked", "id", "name", "nameLower", "phone", "searchTokens", "stylistIds", "tags"],
    );
  });

  it("every command keeps the figures right, and a recompute finds nothing to change", async () => {
    const r1 = await book(request({ customerPhone: PHONE, stylistId: "steve", date: THURSDAY, time: "10:00 AM" }));
    const r2 = await book(request({ customerPhone: PHONE, stylistId: "yuto", date: FRIDAY, time: "10:00 AM" }));
    expect((await client(PHONE))!.bookingCount).toBe(2);
    expect((await client(PHONE))!.stylistIds).toEqual(["steve", "yuto"]);

    await approveBookingCore(db, { bookingId: r1.bookingId }, owner);
    expect(stable(await client(PHONE))).toMatchObject({ hasUpcoming: true, cancelCount: 0 });

    await declineBookingCore(db, { bookingId: r2.bookingId }, owner);
    let c = (await client(PHONE))!;
    expect(c.cancelCount).toBe(1);
    expect(c.stylistIds).toEqual(["steve"]); // a cancelled booking no longer ties a stylist to them
    expect(c.nextBookingId).toBe(r1.bookingId);

    await cancelBookingCore(db, { bookingId: r1.bookingId }, owner);
    c = (await client(PHONE))!;
    expect(c).toMatchObject({ cancelCount: 2, hasUpcoming: false, nextBookingDate: "" });

    await restoreBookingCore(db, { bookingId: r1.bookingId, status: "confirmed" }, owner);
    c = (await client(PHONE))!;
    expect(c).toMatchObject({ cancelCount: 1, hasUpcoming: true, nextBookingId: r1.bookingId });

    // the stored figures are exactly what a recompute from the bookings gives
    const before = stable(await client(PHONE));
    expect((await recomputeClient(db, PHONE, NOW)).changed).toBe(false);
    expect(stable(await client(PHONE))).toEqual(before);
    expect(stable(await card(PHONE))).toEqual(stable(await card(PHONE)));
  });

  it("an expired request releases the client's next booking in the same transaction", async () => {
    const r = await book(request({ customerPhone: PHONE }));
    expect((await client(PHONE))!.hasUpcoming).toBe(true);
    const later = NOW + 25 * 3_600_000;
    expect(await releaseExpiredPendingCore(db, later)).toEqual([r.bookingId]);
    expect(await client(PHONE)).toMatchObject({ hasUpcoming: false, cancelCount: 1 });
  });

  it("assigning a stylist to a legacy 'any' booking updates the client's stylists and price", async () => {
    await seedBooking(db, "legacy", {
      bookingType: "customer", status: "pending", stylistId: "any", stylistName: "Any Available Stylist",
      customerName: "Jane Citizen", customerPhone: PHONE, servicePrice: 1,
      services: [{ id: "mens-cut", name: "Men's Cut", price: 1, activeTime: 45, restTime: 0, totalTime: 45 }],
    });
    await db.doc("bookings/legacy").update({ stylistId: "any" });
    await assignStylistCore(db, { bookingId: "legacy", stylistId: "yuto" }, owner);
    const c = (await client(PHONE))!;
    expect(c.stylistIds).toEqual(["yuto"]);
    expect((await bookingOf("legacy")).clientId).toBe(PHONE);
    expect((await recomputeClient(db, PHONE, NOW)).changed).toBe(false);
  });

  it("a booking with no valid phone makes no client", async () => {
    await seedBooking(db, "walkin-nophone", { customerPhone: "", customerName: "Walk In" });
    await clientSyncCore(db, undefined, (await bookingOf("walkin-nophone")), "walkin-nophone", NOW);
    expect((await db.collection("clients").get()).size).toBe(0);
  });
});

describe("a blocked client is refused by the booking command", () => {
  it("a blocked flag on the client record stops a request, with a generic message", async () => {
    await db.doc(`clients/${PHONE}`).set({ phone: PHONE, name: "Blocked Person", blocked: true, tags: [] });
    expect(await codeOf(book(request({ customerPhone: PHONE })))).toBe("blocked");
    expect((await db.collection("bookings").get()).size).toBe(0);
  });

  it("an unblocked client record does not", async () => {
    await db.doc(`clients/${PHONE}`).set({ phone: PHONE, name: "Fine Person", blocked: false, tags: [] });
    await expect(book(request({ customerPhone: PHONE }))).resolves.toMatchObject({ status: "pending" });
  });

  it("the block survives later bookings: bookings never clear it, and a reason stays on the owner-only document", async () => {
    await db.doc(`clients/${PHONE}`).set({ phone: PHONE, name: "Kept Name", blocked: true, blockReason: "Unpaid", tags: [], source: "online", createdAt: new Date(NOW).toISOString() });
    await seedBooking(db, "b1", { bookingType: "customer", customerPhone: PHONE, customerName: "Kept Name" });
    await recomputeClient(db, PHONE, NOW);
    expect(await client(PHONE)).toMatchObject({ blocked: true, blockReason: "Unpaid" });
    expect((await card(PHONE))!.blocked).toBe(true);
    expect(JSON.stringify(await card(PHONE))).not.toContain("Unpaid");
  });
});

describe("the trigger repairs what the owner's browser wrote", () => {
  it("a walk-in written with no clientId gets one and a client appears", async () => {
    await seedBooking(db, "w1", { bookingType: "walkin", customerPhone: PHONE, customerName: "Walk In Person", status: "completed", date: "2026-11-01" });
    await clientSyncCore(db, undefined, await bookingOf("w1"), "w1", NOW);
    expect((await bookingOf("w1")).clientId).toBe(PHONE);
    expect(await client(PHONE)).toMatchObject({ name: "Walk In Person", source: "walk-in", totalVisits: 1, totalSpend: 75, firstVisit: "2026-11-01", lastVisit: "2026-11-01" });
  });

  it("a delete and a status change update the client; a move between clients updates both", async () => {
    await seedBooking(db, "w1", { bookingType: "walkin", customerPhone: PHONE, status: "completed", date: "2026-11-01" });
    await seedBooking(db, "w2", { bookingType: "walkin", customerPhone: PHONE, status: "completed", date: "2026-11-02", time: "11:00 AM" });
    await clientSyncCore(db, undefined, await bookingOf("w1"), "w1", NOW);
    expect((await client(PHONE))!.totalVisits).toBe(2);
    const before = await bookingOf("w2");
    await db.doc("bookings/w2").delete();
    await clientSyncCore(db, before, undefined, "w2", NOW);
    expect((await client(PHONE))!.totalVisits).toBe(1);
    // a booking re-pointed at another client updates the old one as well
    const old = await bookingOf("w1");
    await db.doc("bookings/w1").update({ clientId: "0400000002", customerPhone: "0400000002" });
    await clientSyncCore(db, old, await bookingOf("w1"), "w1", NOW);
    expect((await client(PHONE))!.bookingCount).toBe(0);
    expect((await client("0400000002"))!.bookingCount).toBe(1);
  });

  it("a reschedule moves the next booking, and a no-show (a stylist's status change) updates the counts", async () => {
    await seedBooking(db, "w1", { bookingType: "walkin", customerPhone: PHONE, status: "confirmed", date: "2026-12-10" });
    let before = undefined as FirebaseFirestore.DocumentData | undefined;
    await clientSyncCore(db, before, await bookingOf("w1"), "w1", NOW);
    expect(await client(PHONE)).toMatchObject({ nextBookingDate: "2026-12-10", hasUpcoming: true, noShowCount: 0 });

    before = await bookingOf("w1");
    await db.doc("bookings/w1").update({ date: "2026-12-12", time: "2:00 PM" });
    await clientSyncCore(db, before, await bookingOf("w1"), "w1", NOW);
    expect(await client(PHONE)).toMatchObject({ nextBookingDate: "2026-12-12", nextBookingTime: "2:00 PM" });

    before = await bookingOf("w1");
    await db.doc("bookings/w1").update({ status: "no_show" });
    await clientSyncCore(db, before, await bookingOf("w1"), "w1", NOW);
    expect(await client(PHONE)).toMatchObject({ noShowCount: 1, hasNoShows: true, hasUpcoming: false, totalVisits: 0, totalSpend: 0 });
    expect((await card(PHONE))!.stylistIds).toEqual(["steve"]); // a no-show still ties the stylist to them
    expect((await recomputeClient(db, PHONE, NOW)).changed).toBe(false);
  });

  it("settleClients turns a booking whose day has arrived from 'next' into a visit", async () => {
    await seedBooking(db, "w1", { bookingType: "walkin", customerPhone: PHONE, status: "confirmed", date: "2026-12-03" });
    await clientSyncCore(db, undefined, await bookingOf("w1"), "w1", at("2026-12-02", "09:00"));
    expect(await client(PHONE)).toMatchObject({ totalVisits: 0, hasUpcoming: true });
    expect(await settleClients(db, at("2026-12-02", "23:00"))).toBe(0); // not yet
    expect(await settleClients(db, at("2026-12-03", "03:30"))).toBe(1);
    expect(await client(PHONE)).toMatchObject({ totalVisits: 1, hasUpcoming: false, lastVisit: "2026-12-03" });
  });

  it("recomputeAllClients repairs a client whose stored figures have drifted", async () => {
    await seedBooking(db, "w1", { bookingType: "walkin", customerPhone: PHONE, status: "completed", date: "2026-11-01" });
    await clientSyncCore(db, undefined, await bookingOf("w1"), "w1", NOW);
    await db.doc(`clients/${PHONE}`).update({ totalSpend: 9999, totalVisits: 42 });
    expect(await recomputeAllClients(db, NOW, [PHONE])).toEqual({ checked: 1, changed: 1 });
    expect(await client(PHONE)).toMatchObject({ totalSpend: 75, totalVisits: 1 });
    expect(await recomputeAllClients(db, NOW)).toEqual({ checked: 1, changed: 0 });
  });
});

describe("the backfill", () => {
  const seedHistory = async () => {
    await seedBooking(db, "a1", { bookingType: "customer", customerPhone: "0400000001", customerName: "Jaid Lee", status: "completed", date: "2026-08-01" });
    await seedBooking(db, "a2", { bookingType: "customer", customerPhone: "0400000001", customerName: "Jade Lee", status: "completed", date: "2026-09-01", time: "11:00 AM" });
    await seedBooking(db, "a3", { bookingType: "walkin", customerPhone: "0400000002", customerName: "Sam Walker", status: "confirmed", date: "2026-11-05" });
    await seedBooking(db, "nophone", { bookingType: "walkin", customerPhone: "", customerName: "No Phone", date: "2026-11-05", time: "12:00 PM" });
    await seedBooking(db, "badphone", { bookingType: "customer", customerPhone: "12345", customerName: "Bad Phone", date: "2026-11-05", time: "1:00 PM" });
    await seedBooking(db, "anyone", { bookingType: "customer", status: "pending", stylistId: "any", customerPhone: "0400000003", customerName: "Any Client", date: "2026-12-10", time: "10:00 AM" });
    await seedBooking(db, "brk", { bookingType: "break", customerName: "Break", customerPhone: "", date: "2026-11-05", time: "2:00 PM" });
    await db.doc("customerLookups/0400000004").set({ name: "Imported Person", lastVisit: "", visitCount: 0 });
    await db.doc("customerLookups/0400000005").set({ name: "Blocked Import", lastVisit: "", visitCount: 0, blocked: true });
  };

  it("a dry run writes nothing and reports counts and rows, never names or numbers", async () => {
    await seedHistory();
    const r = await backfillClientsCore(db, { mode: "dry" }, actor, NOW);
    expect(r.counts).toMatchObject({
      bookingsScanned: 7,
      clientsFound: 5, // 01, 02, 03 (any), 04, 05
      clientsToCreate: 5,
      clientsExisting: 0,
      visitRecordsOnly: 2,
      skippedNoPhone: 1,
      skippedInvalidPhone: 1,
      legacyAnyStylist: 1,
      breaksAndTraining: 1,
      bookingsToLink: 4,
    });
    expect(r.report!.every((x) => typeof x.row === "number" && typeof x.reason === "string")).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/Jade|Walker|Imported Person|0400000/);
    expect((await db.collection("clients").get()).size).toBe(0);
    expect((await bookingOf("a1")).clientId).toBeUndefined();
  });

  it("applies: builds clients, links bookings, handles aliases, 'any', lookups and blocked flags", async () => {
    await seedHistory();
    const r = await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    expect(r).toMatchObject({ mode: "apply", created: 5, linked: 4 });

    const jade = (await client("0400000001"))!;
    expect(jade).toMatchObject({ name: "Jade Lee", totalVisits: 2, totalSpend: 150, firstVisit: "2026-08-01", lastVisit: "2026-09-01", source: "online" });
    expect(jade.aliases).toEqual(["Jaid Lee"]);
    expect(jade.searchTokens).toEqual(expect.arrayContaining(["jade", "lee", "jaid"]));
    expect((await bookingOf("a1")).clientId).toBe("0400000001");

    // a confirmed walk-in whose day has passed is a visit
    expect(await client("0400000002")).toMatchObject({ source: "walk-in", totalVisits: 1, totalSpend: 75, hasUpcoming: false });
    // the legacy "any" booking counts for the client but ties no stylist to them
    expect(await client("0400000003")).toMatchObject({ bookingCount: 1, stylistIds: [], hasUpcoming: true });
    // the Fresha import's visit records become clients with no bookings
    expect(await client("0400000004")).toMatchObject({ name: "Imported Person", source: "fresha-import", bookingCount: 0, totalVisits: 0, blocked: false });
    expect(await client("0400000005")).toMatchObject({ blocked: true });
    expect((await card("0400000005"))!.blocked).toBe(true);
    // a booking with no phone, a bad phone and a break make no client
    expect((await bookingOf("nophone")).clientId).toBeUndefined();
    expect((await bookingOf("badphone")).clientId).toBeUndefined();
    expect((await bookingOf("brk")).clientId).toBeUndefined();
    expect((await db.collection("clients").get()).size).toBe(5);
    // and every client equals its recompute
    expect(await recomputeAllClients(db, NOW)).toEqual({ checked: 5, changed: 0 });
  });

  it("is idempotent: a second run creates and links nothing, and nothing is counted twice", async () => {
    await seedHistory();
    await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    const before = (await client("0400000001"))!;
    const again = await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    expect(again).toMatchObject({ created: 0, linked: 0 });
    expect(stable(await client("0400000001"))).toEqual(stable(before));
    expect((await client("0400000001"))!.totalVisits).toBe(2);
    expect((await db.collection("clients").get()).size).toBe(5);
  });

  it("never overwrites what the owner set on an existing client", async () => {
    await seedHistory();
    await db.doc("clients/0400000001").set({ phone: "0400000001", name: "Jade L", nameOverride: true, tags: ["vip"], blocked: false, source: "online", createdAt: "2026-01-01T00:00:00.000Z", email: "owner.set@example.test" });
    await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    expect(await client("0400000001")).toMatchObject({ name: "Jade L", tags: ["vip"], email: "owner.set@example.test", totalVisits: 2, createdAt: "2026-01-01T00:00:00.000Z" });
  });

  it("rolls back by batch: removes the clients it created and the links it made, keeps one with a note", async () => {
    await seedHistory();
    const r = await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    await db.doc("clients/0400000002/notes/n1").set({ text: "Prefers mornings", authorUid: "u", authorName: "Owner", createdAt: "x", pinned: false });
    const out = await backfillClientsCore(db, { mode: "rollback", batchId: r.batchId }, actor, NOW);
    expect(out).toMatchObject({ mode: "rollback", removed: 4, kept: 1, unlinked: 4 });
    expect(await client("0400000001")).toBeUndefined();
    expect(await client("0400000002")).toBeDefined(); // has a note
    expect((await bookingOf("a1")).clientId).toBeUndefined();
    expect((await db.collection(`clientBackfills/${r.batchId}/chunks`).get()).size).toBe(0);
    expect((await db.doc(`clientBackfills/${r.batchId}`).get()).get("status")).toBe("rolled_back");
  });

  it("refuses a bad mode or batch id", async () => {
    expect(await codeOf(backfillClientsCore(db, { mode: "wipe" }, actor, NOW))).toBe("invalid");
    expect(await codeOf(backfillClientsCore(db, { mode: "rollback", batchId: "../x" }, actor, NOW))).toBe("invalid");
    expect(await codeOf(backfillClientsCore(db, { mode: "rollback", batchId: "backfill-nothere1" }, actor, NOW))).toBe("not-found");
  });

  it("handles more than one batch of clients (200 operations each)", async () => {
    for (let i = 0; i < 230; i++) {
      await db.doc(`customerLookups/04${String(30_000_000 + i)}`).set({ name: `Test Client ${i}`, lastVisit: "", visitCount: 0 });
    }
    const dry = await backfillClientsCore(db, { mode: "dry" }, actor, NOW);
    expect(dry.counts!.clientsToCreate).toBe(230);
    const r = await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    expect(r.created).toBe(230);
    const chunks = await db.collection(`clientBackfills/${r.batchId}/chunks`).get();
    expect(chunks.size).toBe(2);
    expect((await db.collection("clients").get()).size).toBe(230);
  }, 120_000);
});

describe("merge, anonymise and export", () => {
  const twoClients = async () => {
    await seedBooking(db, "k1", { bookingType: "customer", customerPhone: "0400000001", customerName: "Jade Lee", status: "completed", date: "2026-08-01" });
    await seedBooking(db, "m1", { bookingType: "customer", customerPhone: "0400000002", customerName: "Jade Leigh", status: "completed", date: "2026-09-01", servicePrice: 100 });
    await backfillClientsCore(db, { mode: "apply" }, actor, NOW);
    await db.doc("clients/0400000002/notes/n1").set({ text: "Allergic to ammonia", authorUid: "stylist-uid", authorName: "Steve", createdAt: "2026-09-01T00:00:00.000Z", pinned: true });
    await db.doc("clients/0400000002").update({ tags: ["vip"], blocked: true, blockReason: "Test reason" });
  };

  it("merge moves bookings and notes onto the kept client, keeps the other name as an alias, carries tags and the block", async () => {
    await twoClients();
    const r = await mergeClientsCore(db, { keepId: "0400000001", mergeId: "0400000002" }, actor, NOW);
    expect(r).toEqual({ moved: 1, notesMoved: 1 });
    expect((await bookingOf("m1")).clientId).toBe("0400000001");
    expect(await client("0400000002")).toBeUndefined();
    expect(await card("0400000002")).toBeUndefined();
    const kept = (await client("0400000001"))!;
    expect(kept).toMatchObject({ totalVisits: 2, totalSpend: 175, tags: ["vip"], blocked: true, blockReason: "Test reason" });
    // the most recent booking's name wins; the other spelling is kept as an alias
    expect(kept.name).toBe("Jade Leigh");
    expect(kept.aliases).toContain("Jade Lee");
    const notes = await db.collection("clients/0400000001/notes").get();
    expect(notes.docs.map((d) => d.data())).toEqual([expect.objectContaining({ text: "Allergic to ammonia", authorName: "Steve", pinned: true })]);
    const audit = await db.collection("clients/0400000001/audit").get();
    expect(audit.docs[0].data()).toMatchObject({ action: "merge", byUid: "owner-uid" });
    expect((await recomputeClient(db, "0400000001", NOW)).changed).toBe(false);
  });

  it("a trigger that runs AFTER a merge does not bring the merged-away client back", async () => {
    await twoClients();
    const moved = { ...(await bookingOf("m1")) };
    await mergeClientsCore(db, { keepId: "0400000001", mergeId: "0400000002" }, actor, NOW);
    expect(await client("0400000002")).toBeUndefined();
    // the booking moved, but still carries the old phone; the trigger for that update is late
    // (a loaded machine) and rebuilds the OLD client from it: it must find nothing to build
    await clientSyncCore(db, moved, await bookingOf("m1"), "m1", NOW);
    expect(await client("0400000002")).toBeUndefined();
    expect(await card("0400000002")).toBeUndefined();
    expect((await recomputeClient(db, "0400000002", NOW)).exists).toBe(false);
    // and the kept client still has the booking
    expect(await client("0400000001")).toMatchObject({ totalVisits: 2 });
  });

  it("a recompute that overlaps the client's deletion never writes the record back", async () => {
    // an imported client: a record and no bookings. A late trigger reads it just before a
    // merge or anonymise deletes it; the read and the write are one transaction, so the
    // deleted client stays deleted whichever lands first.
    for (let i = 0; i < 25; i++) {
      const id = `04000010${String(i).padStart(2, "0")}`;
      await db.doc(`clients/${id}`).set({ phone: id, name: "Imported Person", tags: [], blocked: false, source: "fresha-import", createdAt: "2025-01-01T00:00:00.000Z" });
      await Promise.all([recomputeClient(db, id, NOW), db.doc(`clients/${id}`).delete()]);
      expect((await db.doc(`clients/${id}`).get()).exists, `client ${id}`).toBe(false);
      expect((await db.doc(`clientCards/${id}`).get()).exists, `card ${id}`).toBe(false);
    }
  });

  it("merge refuses the same client twice, an unknown client and a tombstone", async () => {
    await twoClients();
    expect(await codeOf(mergeClientsCore(db, { keepId: "0400000001", mergeId: "0400000001" }, actor, NOW))).toBe("invalid");
    expect(await codeOf(mergeClientsCore(db, { keepId: "0400000001", mergeId: "0400000009" }, actor, NOW))).toBe("not-found");
    expect(await codeOf(mergeClientsCore(db, { keepId: "0400000001", mergeId: "deleted-0123456789abcdef" }, actor, NOW))).toBe("precondition");
  });

  it("anonymise removes the personal data and notes, keeps the bookings and their prices for the accounts", async () => {
    await twoClients();
    await db.doc("customerLookups/0400000001").set({ name: "Jade Lee", lastVisit: "2026-08-01", visitCount: 1 });
    const r = await anonymiseClientCore(db, { clientId: "0400000001" }, actor, NOW);
    expect(r.anonymisedBookings).toBe(1);
    const b = await bookingOf("k1");
    expect(b).toMatchObject({ customerName: "Deleted Customer", customerPhone: null, customerEmail: null, notes: null, servicePrice: 75, status: "completed", date: "2026-08-01" });
    expect(b.clientId).toMatch(/^deleted-/);
    expect(await client("0400000001")).toBeUndefined();
    expect(await card("0400000001")).toBeUndefined();
    expect((await db.doc("customerLookups/0400000001").get()).exists).toBe(false);
    expect((await db.collection("clients/0400000001/notes").get()).size).toBe(0);
    expect(JSON.stringify(b)).not.toMatch(/Jade|0400000001/);
    // the audit entry survives, under the tombstone
    const tomb = b.clientId as string;
    const audit = await db.collection(`clients/${tomb}/audit`).get();
    expect(audit.docs[0].data()).toMatchObject({ action: "anonymise", byUid: "owner-uid" });
    // another client is untouched, and a second anonymise is refused
    expect(await client("0400000002")).toBeDefined();
    expect(await codeOf(anonymiseClientCore(db, { clientId: tomb }, actor, NOW))).toBe("precondition");
  });

  it("export returns the client, notes, bookings and audit, and records that it happened", async () => {
    await twoClients();
    const out = (await exportClientDataCore(db, { clientId: "0400000002" }, actor, NOW)) as {
      client: { name: string };
      notes: unknown[];
      bookings: { id: string }[];
      audit: unknown[];
    };
    expect(out.client.name).toBe("Jade Leigh");
    expect(out.notes).toHaveLength(1);
    expect(out.bookings.map((b) => b.id)).toEqual(["m1"]);
    const audit = await db.collection("clients/0400000002/audit").get();
    expect(audit.docs.map((d) => d.data().action)).toContain("export");
    expect(await codeOf(exportClientDataCore(db, { clientId: "0400000009" }, actor, NOW))).toBe("not-found");
  });
});
