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

describe("the email wording (privateSettings/email, FR-027)", () => {
  const email = (over: Record<string, unknown> = {}) => ({
    templates: {
      confirmed: {
        enabled: true,
        subject: "Your booking at {salon}",
        preheader: "{date} at {time}",
        headline: "See you, {name}",
        intro: "Your booking is confirmed.",
        closing: "Call {phone}.",
        showDetails: true,
        showReference: false,
        callButton: true,
      },
    },
    ...over,
  });
  const owner = () => env.authenticatedContext("owner-uid", { role: "owner" }).firestore();

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("privateSettings/email").set(email());
    });
  });

  it("the owner and an allowed stylist read and write it; another stylist and the public cannot", async () => {
    await assertSucceeds(owner().doc("privateSettings/email").set(email()));
    await assertSucceeds(editor().doc("privateSettings/email").get());
    await assertSucceeds(editor().doc("privateSettings/email").set(email()));
    for (const db of [plain(), otherCaps(), env.unauthenticatedContext().firestore()]) {
      await assertFails(db.doc("privateSettings/email").get());
      await assertFails(db.doc("privateSettings/email").set(email()));
    }
  });

  it("accepts some of the wording, or none of it", async () => {
    await assertSucceeds(editor().doc("privateSettings/email").set({ templates: {} }));
    await assertSucceeds(editor().doc("privateSettings/email").set({ templates: { reminder: { headline: "Soon, {name}" } } }));
  });

  it("refuses unknown fields, unknown emails, wrong types, empty or too-long text", async () => {
    const t = (over: Record<string, unknown>) => ({ templates: { confirmed: { ...email().templates.confirmed, ...over } } });
    for (const db of [owner(), editor()]) {
      await assertFails(db.doc("privateSettings/email").set(email({ extra: 1 })));
      await assertFails(db.doc("privateSettings/email").set({ templates: { surprise: {} } }));
      await assertFails(db.doc("privateSettings/email").set(t({ surprise: "x" })));
      await assertFails(db.doc("privateSettings/email").set(t({ enabled: "yes" })));
      await assertFails(db.doc("privateSettings/email").set(t({ callButton: 1 })));
      await assertFails(db.doc("privateSettings/email").set(t({ subject: "" })));
      await assertFails(db.doc("privateSettings/email").set(t({ subject: "x".repeat(151) })));
      await assertFails(db.doc("privateSettings/email").set(t({ preheader: "x".repeat(201) })));
      await assertFails(db.doc("privateSettings/email").set(t({ headline: "x".repeat(201) })));
      await assertFails(db.doc("privateSettings/email").set(t({ intro: "x".repeat(1001) })));
      await assertFails(db.doc("privateSettings/email").set(t({ closing: "x".repeat(601) })));
      await assertFails(db.doc("privateSettings/email").set(t({ intro: 7 })));
    }
    await assertSucceeds(owner().doc("privateSettings/email").set(t({ intro: "x".repeat(1000), subject: "x".repeat(150) })));
  });
});

describe("time off (timeOff, privateSettings/timeOff, FR-029)", () => {
  const owner = () => env.authenticatedContext("owner-uid", { role: "owner" }).firestore();
  const approver = () => as({ caps: ["timeoff"] });
  const other = () => env.authenticatedContext("yuto-uid", { role: "stylist", stylistId: "stylist-2" }).firestore();

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("timeOff/r1").set({ stylistId: "stylist-1", kind: "dayoff", status: "pending", reason: "Family" });
      await ctx.firestore().doc("timeOff/r2").set({ stylistId: "stylist-2", kind: "dayoff", status: "pending", reason: "Private" });
    });
  });

  it("the owner and an approver read every request; a stylist only their own; the public none", async () => {
    for (const db of [owner(), approver()]) {
      await assertSucceeds(db.doc("timeOff/r1").get());
      await assertSucceeds(db.doc("timeOff/r2").get());
      await assertSucceeds(db.collection("timeOff").where("status", "==", "pending").get());
    }
    await assertSucceeds(plain().doc("timeOff/r1").get());
    await assertSucceeds(plain().collection("timeOff").where("stylistId", "==", "stylist-1").get());
    await assertFails(plain().doc("timeOff/r2").get());
    await assertFails(plain().collection("timeOff").get());
    await assertFails(other().doc("timeOff/r1").get());
    await assertFails(env.unauthenticatedContext().firestore().doc("timeOff/r1").get());
    await assertFails(as({ caps: ["msg"] }).doc("timeOff/r2").get()); // another permission is not this one
  });

  it("nobody writes a request from a browser, the owner and approvers included", async () => {
    for (const db of [owner(), approver(), plain()]) {
      await assertFails(db.doc("timeOff/new").set({ stylistId: "stylist-1", kind: "dayoff", status: "approved" }));
      await assertFails(db.doc("timeOff/r1").update({ status: "approved" }));
      await assertFails(db.doc("timeOff/r1").delete());
    }
  });

  it("the policy for a waiting request: the owner writes a valid one; nobody else reads or writes it", async () => {
    await assertSucceeds(owner().doc("privateSettings/timeOff").set({ pending: "auto", autoMaxHours: 3 }));
    await assertSucceeds(owner().doc("privateSettings/timeOff").set({ pending: "hold", autoMaxHours: 12 }));
    for (const bad of [
      { pending: "never", autoMaxHours: 3 },
      { pending: "hold", autoMaxHours: 0 },
      { pending: "hold", autoMaxHours: 13 },
      { pending: "hold", autoMaxHours: 1.5 },
      { pending: "hold" },
      { pending: "hold", autoMaxHours: 3, extra: 1 },
    ]) {
      await assertFails(owner().doc("privateSettings/timeOff").set(bad));
    }
    for (const db of [plain(), editor(), approver()]) {
      await assertFails(db.doc("privateSettings/timeOff").get());
      await assertFails(db.doc("privateSettings/timeOff").set({ pending: "auto", autoMaxHours: 3 }));
    }
  });
});

