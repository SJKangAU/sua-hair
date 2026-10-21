// tests/functions/sms.test.ts
// Booking texts against the Firestore emulator, with a recording stand-in for the
// provider (FR-024, DEC-050): the owner's switches, the once-only record, the caps,
// the client's opt-out, a provider that fails, and the owner's test text.
// `npm run test:functions`. Fake people only; nothing here can reach a real phone.
import { beforeEach, describe, expect, it } from "vitest";
import { CommandError } from "../../functions/src/commandErrors";
import { LIMITS } from "../../functions/src/limits";
import { outboxTransport, type OutboundSms, type SmsTransport } from "../../functions/src/sms/provider";
import { sendBookingSmsCore, sendTestSmsCore, type SmsBooking } from "../../functions/src/sms/send";
import { DEFAULT_TEMPLATES } from "../../src/lib/sms";
import { adminDb, resetEmulators } from "./adminEnv";
import { NOW } from "./fixtures";

const db = adminDb();

const sent: OutboundSms[] = [];
const recorder: SmsTransport = {
  async send(sms) {
    sent.push(sms);
    return { id: `msg-${sent.length}` };
  },
};
const broken: SmsTransport = {
  async send() {
    throw new Error("ClickSend responded 500: boom");
  },
};

const PHONE = "0400000001";
const booking = (over: Partial<SmsBooking> = {}): SmsBooking => ({
  bookingType: "customer",
  customerName: "Test Person",
  customerPhone: PHONE,
  serviceName: "Ladies Cut",
  stylistId: "steve",
  stylistName: "Steve Hwang",
  date: "2026-12-03",
  time: "10:30 AM",
  bookingRef: "SUA-TEST",
  ...over,
});

const enable = (extra: Record<string, unknown> = {}) =>
  db.doc("privateSettings/sms").set({ enabled: true, senderName: "SuaHair", kinds: {}, templates: {}, ...extra });

const send = (kind: Parameters<typeof sendBookingSmsCore>[2], id = "b1", b = booking(), transport = recorder) =>
  sendBookingSmsCore(db, transport, kind, id, b, NOW);

const logOf = async (id: string) => (await db.doc(`smsLog/${id}`).get()).data();

beforeEach(async () => {
  await resetEmulators();
  sent.length = 0;
});

describe("the owner's switches", () => {
  it("sends nothing when no settings exist (a fresh deploy never texts anybody)", async () => {
    expect(await send("confirmed")).toBe("disabled");
    expect(sent).toHaveLength(0);
    expect((await db.collection("smsLog").get()).size).toBe(0);
  });

  it("sends nothing while texts are switched off, even with wording saved", async () => {
    await enable({ enabled: false });
    expect(await send("confirmed")).toBe("disabled");
    expect(sent).toHaveLength(0);
  });

  it("sends nothing for a message switched off, but the others still go", async () => {
    await enable({ kinds: { reminder: false } });
    expect(await send("reminder")).toBe("disabled");
    expect(await send("confirmed")).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  it("sends the default wording, filled in, from the saved sender name", async () => {
    await enable({ senderName: "Sua Hair" });
    expect(await send("received")).toBe("sent");
    expect(sent[0]).toMatchObject({ to: "+61400000001", from: "Sua Hair", reference: "b1_received" });
    expect(sent[0].body).toBe(
      "Hi Test, we've got your request for Ladies Cut with Steve Hwang on Thursday 3 December at 10:30 AM. " +
        "It isn't confirmed yet - we'll text you once it is. Sua Hair Studio",
    );
  });

  it("sends the owner's own wording once they have changed it", async () => {
    await enable({ templates: { confirmed: "Booked, {name}! {date}, {time}. {salon}" } });
    await send("confirmed");
    expect(sent[0].body).toBe("Booked, Test! Thursday 3 December, 10:30 AM. Sua Hair Studio");
  });

  it("falls back to the default when the stored wording has a bad placeholder", async () => {
    await enable({ templates: { confirmed: "Hi {nmae}" } });
    await send("confirmed");
    expect(sent[0].body).toBe(
      "Hi Test, you're booked in! Ladies Cut with Steve Hwang on Thursday 3 December at 10:30 AM. " +
        "Need to change it? Call (03) 9569 0840. Sua Hair Studio",
    );
    expect(DEFAULT_TEMPLATES.confirmed).toContain("{name}");
  });
});

describe("who gets a text", () => {
  beforeEach(() => enable());

  it("needs a valid Australian mobile on the booking", async () => {
    expect(await send("confirmed", "b1", booking({ customerPhone: null }))).toBe("no-phone");
    expect(await send("confirmed", "b2", booking({ customerPhone: "0395690840" }))).toBe("no-phone");
    expect(await send("confirmed", "b3", booking({ customerPhone: "" }))).toBe("no-phone");
    expect(sent).toHaveLength(0);
  });

  it("accepts the number however it was written", async () => {
    expect(await send("confirmed", "b1", booking({ customerPhone: "0400 000 001" }))).toBe("sent");
    expect(sent[0].to).toBe("+61400000001");
  });

  it("skips a client who has asked not to be texted", async () => {
    await db.doc(`clients/${PHONE}`).set({ phone: PHONE, name: "Test Person", smsOptOut: true });
    expect(await send("confirmed")).toBe("opted-out");
    expect(sent).toHaveLength(0);
    expect((await db.collection("smsLog").get()).size).toBe(0);
  });

  it("texts a client who is on file but has not opted out", async () => {
    await db.doc(`clients/${PHONE}`).set({ phone: PHONE, name: "Test Person", smsOptOut: false });
    expect(await send("confirmed")).toBe("sent");
  });
});

describe("exactly once", () => {
  beforeEach(() => enable());

  it("a trigger delivered twice sends one text", async () => {
    expect(await send("confirmed")).toBe("sent");
    expect(await send("confirmed")).toBe("duplicate");
    expect(sent).toHaveLength(1);
  });

  it("two at the same moment send one", async () => {
    const results = await Promise.all([send("reminder"), send("reminder"), send("reminder")]);
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(results.filter((r) => r === "duplicate")).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  it("each kind is its own text: a request, then its confirmation, then its reminder", async () => {
    expect(await send("received")).toBe("sent");
    expect(await send("confirmed")).toBe("sent");
    expect(await send("reminder")).toBe("sent");
    expect(sent.map((s) => s.reference)).toEqual(["b1_received", "b1_confirmed", "b1_reminder"]);
  });

  it("records what happened without keeping the message or the full number", async () => {
    await send("confirmed");
    const log = (await logOf("b1_confirmed"))!;
    expect(log).toMatchObject({
      bookingId: "b1",
      bookingRef: "SUA-TEST",
      kind: "confirmed",
      status: "sent",
      toEnding: "001",
      encoding: "GSM-7",
      providerId: "msg-1",
    });
    expect(JSON.stringify(log)).not.toContain(PHONE);
    expect(JSON.stringify(log)).not.toContain("Test Person");
    expect(JSON.stringify(log)).not.toContain("Ladies Cut");
  });
});

describe("when the provider fails", () => {
  beforeEach(() => enable());

  it("never throws, and records the failure", async () => {
    expect(await send("confirmed", "b1", booking(), broken)).toBe("failed");
    const log = (await logOf("b1_confirmed"))!;
    expect(log.status).toBe("failed");
    expect(log.error).toContain("boom");
  });

  it("does not send the same text a second time on a retry (the failure is recorded, not repeated)", async () => {
    await send("confirmed", "b1", booking(), broken);
    expect(await send("confirmed", "b1", booking(), recorder)).toBe("duplicate");
    expect(sent).toHaveLength(0);
  });
});

describe("daily caps", () => {
  beforeEach(() => enable());

  it("one number gets a handful a day, then the rest are recorded as capped, not sent", async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < LIMITS.smsPerPhone.max + 2; i += 1) outcomes.push(await send("confirmed", `b${i}`));
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(LIMITS.smsPerPhone.max);
    expect(outcomes.filter((o) => o === "capped")).toHaveLength(2);
    expect(sent).toHaveLength(LIMITS.smsPerPhone.max);
    expect((await logOf(`b${LIMITS.smsPerPhone.max}_confirmed`))!.status).toBe("capped");
  });

  it("another number is not affected", async () => {
    for (let i = 0; i < LIMITS.smsPerPhone.max; i += 1) await send("confirmed", `b${i}`);
    expect(await send("confirmed", "other", booking({ customerPhone: "0400000002" }))).toBe("sent");
  });
});

describe("the owner's test text", () => {
  const test = (raw: unknown, transport = recorder) => sendTestSmsCore(db, transport, raw, "owner-uid", NOW);

  it("works before texts are switched on, with the saved wording and a made-up booking", async () => {
    await db.doc("privateSettings/sms").set({
      enabled: false,
      senderName: "SuaHair",
      kinds: {},
      templates: { reminder: "Reminder for {name}: {service} at {time}" },
    });
    const r = await test({ kind: "reminder", to: "0400 000 009" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "+61400000009", from: "SuaHair" });
    expect(sent[0].body).toBe("TEST: Reminder for Jane: Cut & Blow Dry at 10:30 AM");
    expect(r).toEqual({ segments: 1, encoding: "GSM-7" });
    expect((await db.collection("smsLog").get()).size).toBe(0);
  });

  it("refuses an unknown message or a number that is not an Australian mobile", async () => {
    await expect(test({ kind: "nope", to: "0400000009" })).rejects.toBeInstanceOf(CommandError);
    await expect(test({ kind: "reminder", to: "0395690840" })).rejects.toMatchObject({ code: "invalid" });
    await expect(test({ kind: "reminder" })).rejects.toMatchObject({ code: "invalid" });
    await expect(test(null)).rejects.toBeInstanceOf(CommandError);
    expect(sent).toHaveLength(0);
  });

  it("is limited per hour", async () => {
    for (let i = 0; i < LIMITS.smsTestPerHour.max; i += 1) await test({ kind: "confirmed", to: "0400000009" });
    await expect(test({ kind: "confirmed", to: "0400000009" })).rejects.toMatchObject({ code: "rate-limited" });
  });

  it("says so, in words for the owner, when the provider refuses", async () => {
    await expect(test({ kind: "confirmed", to: "0400000009" }, broken)).rejects.toMatchObject({
      code: "precondition",
      message: expect.stringContaining("sender name"),
    });
  });
});

describe("the emulator stand-in", () => {
  it("writes the message to smsOutbox instead of sending it", async () => {
    await enable();
    await send("confirmed", "b1", booking(), outboxTransport(db));
    const outbox = await db.collection("smsOutbox").get();
    expect(outbox.size).toBe(1);
    expect(outbox.docs[0].data()).toMatchObject({ to: "+61400000001", from: "SuaHair", reference: "b1_confirmed" });
    expect((await logOf("b1_confirmed"))!.status).toBe("sent");
  });
});
