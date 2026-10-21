// tests/firestore/clientAccessRules.test.ts
// Whose clients a stylist may open (FR-025, DEC-051). The default is their own (a
// booking with them). The owner can widen it per stylist with a custom claim:
// `clientStylists: [ids]` (named colleagues) or `clientsAll: true`. These replay the
// queries the app sends against the real rules: cards, notes and the bookings behind a
// client's history, for a stylist with no extra access, with colleagues, with all, and
// with a malformed claim. `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { createTestEnv, validPublicBooking } from "./testEnv";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

// stylist-1 is the person under test
const as = (claims: Record<string, unknown>) =>
  env.authenticatedContext("stylist-1-uid", { role: "stylist", stylistId: "stylist-1", ...claims }).firestore();
const plain = () => as({});
const withColleague = () => as({ clientStylists: ["stylist-2"] });
const withAll = () => as({ clientsAll: true });

const A = "0400000001"; //  a client of stylist-1
const B = "0400000002"; //  a client of stylist-2
const C = "0400000003"; //  a client of stylist-3
const BOTH = "0400000004"; // a client of stylist-2 and stylist-3

const card = (id: string, stylistIds: string[]) => ({
  id, phone: id, name: "Test Client", nameLower: "test client", searchTokens: ["test", "client"],
  stylistIds, blocked: false, tags: [],
});

const note = (uid: string) => ({
  text: "A note", authorUid: uid, authorName: "Someone", createdAt: "2026-10-01T00:00:00.000Z", pinned: false,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, ids] of [[A, ["stylist-1"]], [B, ["stylist-2"]], [C, ["stylist-3"]], [BOTH, ["stylist-2", "stylist-3"]]] as const) {
      await db.doc(`clients/${id}`).set({ phone: id, name: "Test Client", stylistIds: ids, totalSpend: 900, blocked: false });
      await db.doc(`clientCards/${id}`).set(card(id, [...ids]));
      await db.doc(`clients/${id}/notes/n1`).set(note("owner-uid"));
    }
    await db.doc("bookings/b-own").set(validPublicBooking({ stylistId: "stylist-1", clientId: A }));
    await db.doc("bookings/b-col").set(validPublicBooking({ stylistId: "stylist-2", clientId: B }));
    await db.doc("bookings/b-other").set(validPublicBooking({ stylistId: "stylist-3", clientId: C }));
  });
});

describe("no extra access: only the stylist's own clients (DEC-047, unchanged)", () => {
  it("opens their own client, and nobody else's", async () => {
    const db = plain();
    await assertSucceeds(db.doc(`clientCards/${A}`).get());
    await assertFails(db.doc(`clientCards/${B}`).get());
    await assertFails(db.doc(`clientCards/${C}`).get());
    await assertSucceeds(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-1").get());
    await assertFails(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-2").get());
    await assertFails(db.collection("clientCards").get());
  });

  it("reads only their own bookings and a colleague's notes are closed", async () => {
    const db = plain();
    await assertSucceeds(db.doc("bookings/b-own").get());
    await assertFails(db.doc("bookings/b-col").get());
    await assertSucceeds(db.collection("bookings").where("stylistId", "==", "stylist-1").get());
    await assertFails(db.collection("bookings").where("stylistId", "==", "stylist-2").get());
    await assertSucceeds(db.collection(`clients/${A}/notes`).get());
    await assertFails(db.collection(`clients/${B}/notes`).get());
  });
});

describe("with named colleagues (clientStylists)", () => {
  it("opens the colleague's clients by card, by query and by notes; not anyone else's", async () => {
    const db = withColleague();
    await assertSucceeds(db.doc(`clientCards/${A}`).get()); // still their own
    await assertSucceeds(db.doc(`clientCards/${B}`).get());
    await assertSucceeds(db.doc(`clientCards/${BOTH}`).get()); // shared with the colleague
    await assertFails(db.doc(`clientCards/${C}`).get());
    await assertSucceeds(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-2").get());
    await assertSucceeds(
      db.collection("clientCards").where("stylistIds", "array-contains", "stylist-2").orderBy("nameLower").limit(25).get(),
    );
    await assertFails(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-3").get());
    await assertFails(db.collection("clientCards").get());
    await assertSucceeds(db.collection(`clients/${B}/notes`).get());
    await assertFails(db.collection(`clients/${C}/notes`).get());
  });

  it("reads the colleague's bookings for a client's history, as the app asks for them", async () => {
    const db = withColleague();
    await assertSucceeds(db.doc("bookings/b-col").get());
    await assertFails(db.doc("bookings/b-other").get());
    await assertSucceeds(db.collection("bookings").where("clientId", "==", B).where("stylistId", "==", "stylist-2").get());
    await assertSucceeds(
      db.collection("bookings").where("clientId", "==", B).where("stylistId", "in", ["stylist-1", "stylist-2"]).orderBy("date", "desc").get(),
    );
    await assertFails(db.collection("bookings").where("clientId", "==", C).where("stylistId", "==", "stylist-3").get());
    await assertFails(db.collection("bookings").where("clientId", "==", C).get());
  });

  it("can add a note to a colleague's client but not to one they were not given", async () => {
    const db = withColleague();
    await assertSucceeds(db.doc(`clients/${B}/notes/mine`).set(note("stylist-1-uid")));
    await assertFails(db.doc(`clients/${C}/notes/mine`).set(note("stylist-1-uid")));
    await assertFails(db.doc(`clients/${B}/notes/spoof`).set(note("someone-else")));
  });

  it("still cannot read the owner's client record, change anything of a colleague's, or write the card", async () => {
    const db = withColleague();
    await assertFails(db.doc(`clients/${B}`).get()); // spend, email, blocked reason: owner only
    await assertFails(db.collection("clients").get());
    await assertFails(db.doc(`clientCards/${B}`).update({ tags: ["x"] }));
    await assertFails(db.doc("bookings/b-col").update({ notes: "hacked" }));
    await assertFails(db.doc("bookings/b-col").delete());
    await assertFails(db.doc(`clients/${B}/notes/n1`).delete()); // someone else's note
    await assertFails(db.doc(`clients/${B}/notes/n1`).update({ pinned: true }));
  });
});

describe("with every client (clientsAll)", () => {
  it("lists and opens every card, with or without a stylist filter", async () => {
    const db = withAll();
    await assertSucceeds(db.collection("clientCards").get());
    await assertSucceeds(db.collection("clientCards").orderBy("nameLower").limit(25).get());
    for (const id of [A, B, C, BOTH]) await assertSucceeds(db.doc(`clientCards/${id}`).get());
    await assertSucceeds(db.collection("clientCards").where("stylistIds", "array-contains", "stylist-3").get());
    await assertSucceeds(db.collection(`clients/${C}/notes`).get());
  });

  it("reads every stylist's bookings for a client's history", async () => {
    const db = withAll();
    await assertSucceeds(db.collection("bookings").where("clientId", "==", C).orderBy("date", "desc").get());
    await assertSucceeds(db.doc("bookings/b-other").get());
  });

  it("is still not the owner: no client records, no booking or role writes", async () => {
    const db = withAll();
    await assertFails(db.doc(`clients/${C}`).get());
    await assertFails(db.doc(`clientCards/${C}`).set(card(C, ["stylist-1"])));
    await assertFails(db.doc("bookings/b-other").update({ notes: "x" }));
    await assertFails(db.doc("bookings/new").set(validPublicBooking({ stylistId: "stylist-1" })));
    await assertFails(db.doc("users/stylist-1-uid").set({ role: "owner" }));
  });
});

describe("the claim is only honoured for a stylist, and only when well-formed", () => {
  it("a malformed list or flag gives nothing extra", async () => {
    for (const claims of [
      { clientStylists: "stylist-2" },
      { clientStylists: 7 },
      { clientStylists: [2] },
      { clientsAll: "true" },
      { clientsAll: 1 },
    ]) {
      const db = as(claims);
      await assertFails(db.doc(`clientCards/${B}`).get());
      await assertFails(db.doc("bookings/b-col").get());
      await assertSucceeds(db.doc(`clientCards/${A}`).get()); // their own still works
    }
  });

  it("an account with no role gets nothing from a client-access claim", async () => {
    const db = env.authenticatedContext("nobody", { clientsAll: true, clientStylists: ["stylist-2"] }).firestore();
    await assertFails(db.doc(`clientCards/${B}`).get());
    await assertFails(db.doc("bookings/b-col").get());
    await assertFails(db.collection("clientCards").get());
  });

  it("an anonymous visitor gets nothing", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(db.doc(`clientCards/${B}`).get());
    await assertFails(db.doc("bookings/b-col").get());
  });
});

describe("the owner's role records", () => {
  it("the owner reads every users/{uid} record (the Team screen); a stylist reads only their own", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/stylist-1-uid").set({ role: "stylist", stylistId: "stylist-1", clientAccess: { all: false, stylistIds: ["stylist-2"] } });
      await ctx.firestore().doc("users/stylist-2-uid").set({ role: "stylist", stylistId: "stylist-2" });
    });
    const owner = env.authenticatedContext("owner-uid", { role: "owner" }).firestore();
    await assertSucceeds(owner.collection("users").get());
    const mine = plain();
    await assertSucceeds(mine.doc("users/stylist-1-uid").get());
    await assertFails(mine.doc("users/stylist-2-uid").get());
    await assertFails(mine.collection("users").get());
    await assertFails(owner.doc("users/stylist-1-uid").update({ clientAccess: { all: true, stylistIds: [] } })); // only the function writes
  });
});
