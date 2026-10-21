// tests/firestore/clientsRules.test.ts
// The permission matrix for the clients collections (DEC-044 to DEC-049): clients
// (owner only: spend, blocked reason, email), clientCards (a stylist reads only
// their own clients' cards), notes (append-only, authored; a stylist may delete or
// pin only their own), the audit trail (owner, write-once) and the backfill ledger.
// Owner / stylist / other stylist / unprovisioned / anonymous. `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  OWNER_UID,
  STYLIST_UID,
  createTestEnv,
  ownerCtx,
  stylistCtx,
  unprovisionedCtx,
  validPublicBooking,
} from "./testEnv";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const owner = () => ownerCtx(env).firestore();
const stylist = () => stylistCtx(env).firestore(); // stylist-1
const otherStylist = () => stylistCtx(env, "stylist-2", "other-stylist-uid").firestore();
const nobody = () => unprovisionedCtx(env).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const MINE = "0400000001"; // a client of stylist-1
const THEIRS = "0400000002"; // a client of stylist-2 only

const clientDoc = (id: string, stylistIds: string[]) => ({
  phone: id,
  name: "Test Client",
  nameLower: "test client",
  searchTokens: ["test", "client"],
  aliases: [],
  tags: [],
  blocked: true,
  blockReason: "Private reason",
  email: "test.client@example.test",
  source: "online",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  totalVisits: 5,
  totalSpend: 450,
  stylistIds,
});

const note = (uid = STYLIST_UID, over: Record<string, unknown> = {}) => ({
  text: "Prefers mornings",
  authorUid: uid,
  authorName: "Steve",
  createdAt: "2026-10-01T00:00:00.000Z",
  pinned: false,
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`clients/${MINE}`).set(clientDoc(MINE, ["stylist-1", "stylist-3"]));
    await db.doc(`clients/${THEIRS}`).set(clientDoc(THEIRS, ["stylist-2"]));
    for (const [id, ids] of [[MINE, ["stylist-1", "stylist-3"]], [THEIRS, ["stylist-2"]]] as const) {
      await db.doc(`clientCards/${id}`).set({
        id, phone: id, name: "Test Client", nameLower: "test client", searchTokens: ["test", "client"],
        stylistIds: ids, blocked: true, tags: [],
      });
    }
    await db.doc(`clients/${MINE}/notes/by-stylist`).set(note(STYLIST_UID));
    await db.doc(`clients/${MINE}/notes/by-owner`).set(note(OWNER_UID, { authorName: "Owner" }));
    await db.doc(`clients/${THEIRS}/notes/n`).set(note("other-stylist-uid"));
    await db.doc(`clients/${MINE}/audit/a1`).set({ action: "block", byUid: OWNER_UID, byName: "Owner", at: "2026-10-01T00:00:00.000Z" });
    await db.doc("clientBackfills/b1").set({ status: "complete" });
    await db.doc("clientBackfills/b1/chunks/00000").set({ created: [MINE] });
    await db.doc("bookings/own").set(validPublicBooking({ status: "confirmed", clientId: MINE }));
  });
});

describe("clients: owner only (spend, the blocked reason and the email live here)", () => {
  it("the owner can read, list, create, update and delete", async () => {
    const db = owner();
    await assertSucceeds(db.doc(`clients/${MINE}`).get());
    await assertSucceeds(db.collection("clients").limit(5).get());
    await assertSucceeds(db.collection("clients").orderBy("nameLower").limit(5).get());
    await assertSucceeds(db.doc("clients/0400000009").set(clientDoc("0400000009", [])));
    await assertSucceeds(db.doc(`clients/${MINE}`).update({ tags: ["vip"], blocked: false }));
    await assertSucceeds(db.doc(`clients/${THEIRS}`).delete());
  });

  for (const [who, get] of [
    ["a stylist (even for their own client)", stylist],
    ["another stylist", otherStylist],
    ["an unprovisioned account", nobody],
    ["an anonymous visitor", anon],
  ] as const) {
    it(`${who} cannot read, list or write a client`, async () => {
      const db = get();
      await assertFails(db.doc(`clients/${MINE}`).get());
      await assertFails(db.collection("clients").limit(5).get());
      await assertFails(db.collection("clients").where("stylistIds", "array-contains", "stylist-1").get());
      await assertFails(db.doc("clients/0400000009").set(clientDoc("0400000009", [])));
      await assertFails(db.doc(`clients/${MINE}`).update({ blocked: false }));
      await assertFails(db.doc(`clients/${MINE}`).delete());
    });
  }
});

describe("clientCards: a stylist reads only their own clients, and a card holds no spend", () => {
  it("the owner reads and writes cards", async () => {
    await assertSucceeds(owner().doc(`clientCards/${THEIRS}`).get());
    await assertSucceeds(owner().collection("clientCards").limit(5).get());
    await assertSucceeds(owner().doc(`clientCards/${MINE}`).update({ name: "Changed" }));
  });

  it("a stylist can get and search the cards of clients who have booked with them", async () => {
    const db = stylist();
    await assertSucceeds(db.doc(`clientCards/${MINE}`).get());
    await assertSucceeds(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-1").limit(25).get());
    await assertSucceeds(
      db.collection("clientCards").where("stylistIds", "array-contains", "stylist-1")
        .where("nameLower", ">=", "te").where("nameLower", "<", "te").orderBy("nameLower").limit(25).get(),
    );
  });

  it("a stylist cannot read another stylist's client, list everyone, or search with someone else's id", async () => {
    const db = stylist();
    await assertFails(db.doc(`clientCards/${THEIRS}`).get());
    await assertFails(db.collection("clientCards").limit(5).get());
    await assertFails(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-2").get());
    await assertFails(otherStylist().doc(`clientCards/${MINE}`).get());
  });

  it("a stylist cannot write or delete a card", async () => {
    const db = stylist();
    await assertFails(db.doc(`clientCards/${MINE}`).update({ name: "Changed" }));
    await assertFails(db.doc(`clientCards/${MINE}`).delete());
    await assertFails(db.doc("clientCards/0400000009").set({ phone: "0400000009", stylistIds: ["stylist-1"] }));
  });

  it("the card a stylist can read has no spend, email or blocked reason (the document is not readable at all)", async () => {
    const snap = await assertSucceeds(stylist().doc(`clientCards/${MINE}`).get());
    const data = JSON.stringify(snap.data());
    for (const secret of ["Private reason", "450", "example.test", "totalSpend"]) {
      if (data.includes(secret)) throw new Error(`the card exposes ${secret}`);
    }
  });

  it("an unprovisioned account and an anonymous visitor read nothing", async () => {
    for (const db of [nobody(), anon()]) {
      await assertFails(db.doc(`clientCards/${MINE}`).get());
      await assertFails(db.collection("clientCards").limit(5).get());
      await assertFails(db.doc(`clientCards/${MINE}`).update({ name: "x" }));
    }
  });
});

describe("notes: append-only, authored, owner and the client's own stylists", () => {
  it("the owner reads any client's notes and can add, pin and delete any", async () => {
    const db = owner();
    await assertSucceeds(db.collection(`clients/${THEIRS}/notes`).get());
    await assertSucceeds(db.doc(`clients/${MINE}/notes/new`).set(note(OWNER_UID, { authorName: "Owner" })));
    await assertSucceeds(db.doc(`clients/${MINE}/notes/by-stylist`).update({ pinned: true }));
    await assertSucceeds(db.doc(`clients/${MINE}/notes/by-stylist`).delete());
  });

  it("a stylist reads and adds notes on their own client, with their own uid as the author", async () => {
    const db = stylist();
    await assertSucceeds(db.collection(`clients/${MINE}/notes`).get());
    await assertSucceeds(db.doc(`clients/${MINE}/notes/n2`).set(note(STYLIST_UID)));
  });

  it("a stylist cannot add a note in someone else's name, or a malformed one", async () => {
    const db = stylist();
    await assertFails(db.doc(`clients/${MINE}/notes/x1`).set(note(OWNER_UID)));
    await assertFails(db.doc(`clients/${MINE}/notes/x2`).set(note(STYLIST_UID, { text: "" })));
    await assertFails(db.doc(`clients/${MINE}/notes/x3`).set(note(STYLIST_UID, { text: "x".repeat(2001) })));
    await assertFails(db.doc(`clients/${MINE}/notes/x4`).set({ ...note(STYLIST_UID), extra: 1 }));
    await assertFails(db.doc(`clients/${MINE}/notes/x5`).set(note(STYLIST_UID, { pinned: "yes" })));
  });

  it("a stylist cannot read or add notes on another stylist's client", async () => {
    const db = stylist();
    await assertFails(db.collection(`clients/${THEIRS}/notes`).get());
    await assertFails(db.doc(`clients/${THEIRS}/notes/n`).get());
    await assertFails(db.doc(`clients/${THEIRS}/notes/y`).set(note(STYLIST_UID)));
  });

  it("a stylist can delete and pin only their own notes; never edit anyone's text", async () => {
    const db = stylist();
    await assertSucceeds(db.doc(`clients/${MINE}/notes/by-stylist`).update({ pinned: true }));
    await assertFails(db.doc(`clients/${MINE}/notes/by-stylist`).update({ text: "rewritten" }));
    await assertFails(db.doc(`clients/${MINE}/notes/by-stylist`).update({ authorUid: OWNER_UID }));
    await assertFails(db.doc(`clients/${MINE}/notes/by-owner`).update({ pinned: true }));
    await assertFails(db.doc(`clients/${MINE}/notes/by-owner`).delete());
    await assertSucceeds(db.doc(`clients/${MINE}/notes/by-stylist`).delete());
  });

  it("the owner cannot edit a note's text either (append-only)", async () => {
    await assertFails(owner().doc(`clients/${MINE}/notes/by-stylist`).update({ text: "rewritten" }));
  });

  it("an unprovisioned account and an anonymous visitor cannot read or write notes", async () => {
    for (const db of [nobody(), anon()]) {
      await assertFails(db.collection(`clients/${MINE}/notes`).get());
      await assertFails(db.doc(`clients/${MINE}/notes/z`).set(note("nobody-uid")));
    }
  });
});

describe("audit trail and the build-the-client-list ledger", () => {
  it("the owner reads the audit and adds an entry as themselves; nobody edits or deletes one", async () => {
    const db = owner();
    await assertSucceeds(db.collection(`clients/${MINE}/audit`).get());
    await assertSucceeds(db.doc(`clients/${MINE}/audit/a2`).set({ action: "unblock", byUid: OWNER_UID, byName: "Owner", at: "2026-10-02T00:00:00.000Z" }));
    await assertFails(db.doc(`clients/${MINE}/audit/a3`).set({ action: "unblock", byUid: "someone-else", byName: "Owner", at: "x" }));
    await assertFails(db.doc(`clients/${MINE}/audit/a1`).update({ action: "edit" }));
    await assertFails(db.doc(`clients/${MINE}/audit/a1`).delete());
  });

  it("stylists, unprovisioned accounts and the public cannot read or write the audit", async () => {
    for (const db of [stylist(), otherStylist(), nobody(), anon()]) {
      await assertFails(db.collection(`clients/${MINE}/audit`).get());
      await assertFails(db.doc(`clients/${MINE}/audit/a9`).set({ action: "edit", byUid: "x", byName: "x", at: "x" }));
    }
  });

  it("the ledger is readable by the owner only and writable by nobody from a browser", async () => {
    await assertSucceeds(owner().doc("clientBackfills/b1").get());
    await assertSucceeds(owner().collection("clientBackfills/b1/chunks").get());
    await assertFails(owner().doc("clientBackfills/b2").set({ status: "x" }));
    await assertFails(owner().doc("clientBackfills/b1").delete());
    for (const db of [stylist(), nobody(), anon()]) {
      await assertFails(db.doc("clientBackfills/b1").get());
      await assertFails(db.collection("clientBackfills/b1/chunks").get());
    }
  });
});

describe("a stylist sees their own history with a client and nothing of other stylists'", () => {
  it("their own bookings for the client are readable by clientId + stylistId", async () => {
    await assertSucceeds(
      stylist().collection("bookings").where("clientId", "==", MINE).where("stylistId", "==", "stylist-1").get(),
    );
  });

  it("the whole of a client's history across stylists is not readable by a stylist", async () => {
    await assertFails(stylist().collection("bookings").where("clientId", "==", MINE).get());
    await assertFails(
      stylist().collection("bookings").where("clientId", "==", MINE).where("stylistId", "==", "stylist-2").get(),
    );
  });

  it("the owner reads a client's whole history", async () => {
    await assertSucceeds(owner().collection("bookings").where("clientId", "==", MINE).orderBy("date", "desc").get());
  });
});
