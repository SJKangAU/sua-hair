// tests/firestore/permissionsRules.test.ts
// What a stylist the owner has trusted with "edit message wording" can touch (FR-026,
// DEC-052): the text-message wording and its log, and nothing else of the owner's. The
// permission is the `caps` claim ('msg'), written only by the Admin SDK. `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { createTestEnv } from "./testEnv";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const as = (claims: Record<string, unknown>) =>
  env.authenticatedContext("stylist-uid", { role: "stylist", stylistId: "stylist-1", ...claims }).firestore();
const editor = () => as({ caps: ["msg"] });
const plain = () => as({});
const otherCaps = () => as({ caps: ["winback", "timeoff", "records"] });

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  senderName: "SuaHair",
  kinds: { received: true, confirmed: true, not_confirmed: true, reminder: true },
  templates: { confirmed: "Hi {name}, booked for {date} at {time}. {salon}" },
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("privateSettings/sms").set(settings());
    await db.doc("privateSettings/notifications").set({ notifyOwnerByEmail: true, ownerEmail: "owner@example.test" });
    await db.doc("privateSettings/permissions").set({ stylistDefaults: ["editMessages"] });
    await db.doc("smsLog/b1_confirmed").set({ bookingId: "b1", kind: "confirmed", status: "sent", toEnding: "001" });
  });
});

describe("a stylist allowed to edit message wording", () => {
  it("reads and writes the text-message wording, as the owner does", async () => {
    const db = editor();
    await assertSucceeds(db.doc("privateSettings/sms").get());
    await assertSucceeds(db.doc("privateSettings/sms").set(settings({ enabled: false })));
  });

  it("is held to the same shape: bad sender names, unknown fields and bad wording are refused", async () => {
    const db = editor();
    await assertFails(db.doc("privateSettings/sms").set(settings({ senderName: "ab" })));
    await assertFails(db.doc("privateSettings/sms").set(settings({ extra: 1 })));
    await assertFails(db.doc("privateSettings/sms").set(settings({ templates: { confirmed: "" } })));
    await assertFails(db.doc("privateSettings/sms").set(settings({ templates: { confirmed: "x".repeat(321) } })));
  });

  it("reads the send log, but cannot write it", async () => {
    const db = editor();
    await assertSucceeds(db.doc("smsLog/b1_confirmed").get());
    await assertSucceeds(db.collection("smsLog").orderBy("createdAt", "desc").limit(8).get());
    await assertFails(db.doc("smsLog/b1_confirmed").update({ status: "failed" }));
    await assertFails(db.doc("smsLog/x").set({ status: "sent" }));
  });

  it("gets nothing else of the owner's: not the notification address, not the permission defaults", async () => {
    const db = editor();
    await assertFails(db.doc("privateSettings/notifications").get());
    await assertFails(db.doc("privateSettings/notifications").set({ notifyOwnerByEmail: false, ownerEmail: "x@example.test" }));
    await assertFails(db.doc("privateSettings/permissions").get());
    await assertFails(db.doc("privateSettings/permissions").set({ stylistDefaults: ["editMessages", "sendWinBack"] }));
    await assertFails(db.doc("users/stylist-uid").set({ role: "owner" }));
  });
});

describe("without the permission", () => {
  it("a stylist gets nothing of the wording or the log", async () => {
    for (const db of [plain(), otherCaps()]) {
      await assertFails(db.doc("privateSettings/sms").get());
      await assertFails(db.doc("privateSettings/sms").set(settings()));
      await assertFails(db.doc("smsLog/b1_confirmed").get());
    }
  });

  it("a malformed claim, an account with no role and an anonymous visitor get nothing", async () => {
    for (const claims of [{ caps: "msg" }, { caps: [1] }, { caps: ["fly"] }]) {
      await assertFails(as(claims).doc("privateSettings/sms").get());
    }
    const nobody = env.authenticatedContext("nobody", { caps: ["msg"] }).firestore();
    await assertFails(nobody.doc("privateSettings/sms").get());
    await assertFails(nobody.doc("privateSettings/sms").set(settings()));
    await assertFails(env.unauthenticatedContext().firestore().doc("privateSettings/sms").get());
  });

  it("the owner still can, as before", async () => {
    const owner = env.authenticatedContext("owner-uid", { role: "owner" }).firestore();
    await assertSucceeds(owner.doc("privateSettings/sms").set(settings({ enabled: false })));
    await assertSucceeds(owner.doc("privateSettings/permissions").get());
  });
});
