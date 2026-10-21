// tests/firestore/smsRules.test.ts
// Who can touch the text-message settings and log (FR-024, DEC-050): the settings
// document is owner-only and only well-formed wording is accepted; smsLog is
// readable by the owner and writable by nobody from a browser; a client can be
// marked "no texts" by the owner and not by a stylist. `npm run test:rules`.
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { createTestEnv, ownerCtx, stylistCtx, unprovisionedCtx } from "./testEnv";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

const owner = () => ownerCtx(env).firestore();
const stylist = () => stylistCtx(env).firestore();
const nobody = () => unprovisionedCtx(env).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  senderName: "SuaHair",
  kinds: { received: true, confirmed: true, not_confirmed: true, reminder: false },
  templates: { confirmed: "Hi {name}, booked for {date} at {time}. {salon}" },
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("privateSettings/sms").set(settings());
    await ctx.firestore().doc("smsLog/b1_confirmed").set({ bookingId: "b1", kind: "confirmed", status: "sent", toEnding: "001" });
    await ctx.firestore().doc("clients/0400000001").set({ phone: "0400000001", name: "Test Client" });
  });
});

describe("privateSettings/sms", () => {
  it("only the owner reads it", async () => {
    await assertSucceeds(owner().doc("privateSettings/sms").get());
    await assertFails(stylist().doc("privateSettings/sms").get());
    await assertFails(nobody().doc("privateSettings/sms").get());
    await assertFails(anon().doc("privateSettings/sms").get());
  });

  it("only the owner writes it", async () => {
    await assertSucceeds(owner().doc("privateSettings/sms").set(settings({ enabled: false })));
    await assertFails(stylist().doc("privateSettings/sms").set(settings()));
    await assertFails(nobody().doc("privateSettings/sms").set(settings()));
    await assertFails(anon().doc("privateSettings/sms").set(settings()));
  });

  it("accepts a complete document, and one with only some of the wording", async () => {
    await assertSucceeds(
      owner().doc("privateSettings/sms").set(
        settings({
          templates: {
            received: "a",
            confirmed: "b",
            not_confirmed: "c",
            reminder: "d".repeat(320),
          },
        }),
      ),
    );
    await assertSucceeds(owner().doc("privateSettings/sms").set(settings({ templates: {}, kinds: {} })));
  });

  it("rejects unexpected fields, wrong types, bad sender names and wording that is empty or too long", async () => {
    const set = (over: Record<string, unknown>) => owner().doc("privateSettings/sms").set(settings(over));
    await assertFails(set({ extra: 1 }));
    await assertFails(set({ enabled: "yes" }));
    await assertFails(set({ senderName: 5 }));
    await assertFails(set({ senderName: "ab" }));
    await assertFails(set({ senderName: "Sua Hair Studio" }));
    await assertFails(set({ senderName: "Sua-Hair" }));
    await assertFails(set({ kinds: { surprise: true } }));
    await assertFails(set({ kinds: "all" }));
    await assertFails(set({ templates: { surprise: "hi" } }));
    await assertFails(set({ templates: { confirmed: "" } }));
    await assertFails(set({ templates: { confirmed: "x".repeat(321) } }));
    await assertFails(set({ templates: { confirmed: 7 } }));
  });

  it("does not loosen the notifications document next to it", async () => {
    await assertSucceeds(
      owner().doc("privateSettings/notifications").set({ notifyOwnerByEmail: true, ownerEmail: "o@example.test" }),
    );
    await assertFails(owner().doc("privateSettings/notifications").set(settings()));
    await assertFails(owner().doc("privateSettings/anything-else").set(settings()));
  });
});

describe("smsLog", () => {
  it("the owner reads it, and lists it newest first", async () => {
    await assertSucceeds(owner().doc("smsLog/b1_confirmed").get());
    await assertSucceeds(owner().collection("smsLog").orderBy("createdAt", "desc").limit(8).get());
  });

  it("nobody else reads it", async () => {
    await assertFails(stylist().doc("smsLog/b1_confirmed").get());
    await assertFails(nobody().doc("smsLog/b1_confirmed").get());
    await assertFails(anon().doc("smsLog/b1_confirmed").get());
    await assertFails(stylist().collection("smsLog").get());
  });

  it("no browser writes it, the owner included (only the functions do)", async () => {
    await assertFails(owner().doc("smsLog/new").set({ status: "sent" }));
    await assertFails(owner().doc("smsLog/b1_confirmed").update({ status: "failed" }));
    await assertFails(owner().doc("smsLog/b1_confirmed").delete());
  });

  it("the outbox the emulator stand-in writes is not reachable from a browser at all", async () => {
    await assertFails(owner().doc("smsOutbox/x").get());
    await assertFails(owner().doc("smsOutbox/x").set({ body: "hi" }));
  });
});

describe("a client's 'no texts' flag", () => {
  it("the owner sets and clears it", async () => {
    await assertSucceeds(owner().doc("clients/0400000001").update({ smsOptOut: true }));
    await assertSucceeds(owner().doc("clients/0400000001").update({ smsOptOut: false }));
  });

  it("a stylist cannot read or change the client record", async () => {
    await assertFails(stylist().doc("clients/0400000001").update({ smsOptOut: true }));
    await assertFails(stylist().doc("clients/0400000001").get());
  });
});
