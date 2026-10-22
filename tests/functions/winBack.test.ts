// tests/functions/winBack.test.ts
// Inviting lapsed clients back (FR-030, DEC-056) against the Firestore emulator, with recording
// stand-ins for the email and text services: only clients who agreed (and have not unsubscribed),
// the lapsed / upcoming / blocked / cool-down rules, who a stylist may invite, the once-only text,
// the caps, the unsubscribe link, and that consent is captured by the booking form's tick-box.
// Fake people only; nothing here can reach a real inbox or phone.
import { beforeEach, describe, expect, it } from "vitest";
import { createBookingRequestCore } from "../../functions/src/bookingCommands";
import { recomputeClient, mergeClientsCore } from "../../functions/src/clients";
import { CommandError } from "../../functions/src/commandErrors";
import { LIMITS } from "../../functions/src/limits";
import type { OutboundSms, SmsTransport } from "../../functions/src/sms/provider";
import {
  MAX_PER_SEND,
  sendWinBackCore,
  unsubscribeMarketingCore,
  winBackCandidatesCore,
  type WinBackActor,
  type WinBackDeps,
} from "../../functions/src/winBack";
import { addDaysToDate, businessToday } from "../../src/lib/businessTime";
import { adminDb, resetEmulators } from "./adminEnv";
import { NOW, request, seedSalon } from "./fixtures";

const db = adminDb();
const TODAY = businessToday(NOW);
const ago = (days: number) => addDaysToDate(TODAY, -days);
const CONSENT = "2026-03-01T00:00:00.000Z";

const owner: WinBackActor = { uid: "owner-uid", name: "Owner", role: "owner", canSend: true, access: { all: false, stylistIds: [] } };
const steve: WinBackActor = { uid: "steve-uid", name: "Steve", role: "stylist", stylistId: "steve", canSend: true, access: { all: false, stylistIds: [] } };
const noPermission: WinBackActor = { ...steve, canSend: false };

const texts: OutboundSms[] = [];
const emails: { to: string; subject: string; html: string; text: string; unsubscribeLink: string; idempotencyKey: string }[] = [];
let failEmail = false;
let failSms = false;
const deps: WinBackDeps = {
  siteUrl: "https://salon.example.test/",
  smsTransport: {
    async send(sms) {
      if (failSms) throw new Error("provider down");
      texts.push(sms);
      return { id: `m${texts.length}` };
    },
  } satisfies SmsTransport,
  async sendEmail(email) {
    if (failEmail) throw new Error("mail down");
    emails.push(email);
  },
};

const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return (err as CommandError).code;
  }
  throw new Error("expected a refusal");
};

let n = 0;
/** A lapsed client who agreed to hear from the salon; override anything. */
const client = async (over: Record<string, unknown> = {}): Promise<string> => {
  n += 1;
  const phone = `04${String(20_000_000 + n).padStart(8, "0")}`;
  const id = (over.phone as string | undefined) ?? phone;
  const doc: Record<string, unknown> = {
    phone: id,
    name: `Test Person${n}`,
    nameLower: `test person${n}`,
    searchTokens: ["test"],
    aliases: [],
    tags: [],
    email: `person${n}@example.test`,
    blocked: false,
    source: "online",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    totalVisits: 3,
    totalSpend: 200,
    firstVisit: ago(400),
    lastVisit: ago(120),
    hasUpcoming: false,
    stylistIds: ["steve"],
    favouriteStylistId: "steve",
    favouriteServiceIds: ["mens-cut"],
    bookingCount: 3,
    marketingOptIn: true,
    marketingConsentAt: CONSENT,
    marketingSource: "booking-form",
    ...over,
  };
  for (const key of Object.keys(doc)) if (doc[key] === undefined) delete doc[key];
  await db.doc(`clients/${id}`).set(doc);
  return id;
};

const settingsOn = () =>
  db.doc("privateSettings/sms").set({ enabled: true, senderName: "SuaHair", kinds: {}, templates: {} });
const list = (a: WinBackActor = owner, raw: unknown = {}) => winBackCandidatesCore(db, raw, a, NOW);
const send = (clientIds: string[], channels = { email: true, sms: true }, a: WinBackActor = owner, extra: Record<string, unknown> = {}) =>
  sendWinBackCore(db, { clientIds, channels, ...extra }, a, NOW, deps);

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
  await settingsOn();
  texts.length = 0;
  emails.length = 0;
  failEmail = false;
  failSms = false;
});

describe("who is on the list", () => {
  it("only lapsed clients who agreed, with what channels they can be reached on", async () => {
    const good = await client();
    await client({ lastVisit: ago(30) }); //                       not lapsed
    await client({ marketingOptIn: false }); //                    never agreed (an imported client)
    await client({ marketingOptIn: undefined, marketingConsentAt: undefined, marketingSource: undefined });
    const r = await list();
    expect(r.candidates.map((c) => c.id)).toEqual([good]);
    expect(r.candidates[0]).toMatchObject({ totalVisits: 3, lastVisit: ago(120), canEmail: true, canText: true });
    expect(r.days).toBe(90);
  });

  it("is oldest-lapsed last: the most recent lapse first", async () => {
    const a = await client({ lastVisit: ago(100) });
    const b = await client({ lastVisit: ago(300) });
    const c = await client({ lastVisit: ago(200) });
    expect((await list()).candidates.map((x) => x.id)).toEqual([a, c, b]);
  });

  it("leaves out, and counts, those with something booked, those blocked, those just invited and those who have since unsubscribed", async () => {
    await client({ hasUpcoming: true, nextBookingDate: ago(-5) });
    await client({ blocked: true });
    await client({ winBackSentAt: new Date(NOW - 10 * 86_400_000).toISOString() });
    await client({ marketingOptOutAt: "2026-04-01T00:00:00.000Z" }); // unsubscribed after agreeing
    const ok = await client({ winBackSentAt: new Date(NOW - 90 * 86_400_000).toISOString() }); // long enough ago
    const r = await list();
    expect(r.candidates.map((c) => c.id)).toEqual([ok]);
    expect(r.skipped).toEqual({ upcoming: 1, blocked: 1, "recently-invited": 1, "no-consent": 1 });
  });

  it("a client with an anonymised record is never listed", async () => {
    await client({ anonymised: true });
    expect((await list()).candidates).toEqual([]);
  });

  it("says which channels work: no valid email, a text opt-out, no mobile", async () => {
    const noEmail = await client({ email: "not an email" });
    const noText = await client({ smsOptOut: true });
    const neither = await client({ email: undefined, smsOptOut: true });
    const r = await list();
    const by = Object.fromEntries(r.candidates.map((c) => [c.id, c]));
    expect(by[noEmail]).toMatchObject({ canEmail: false, canText: true });
    expect(by[noText]).toMatchObject({ canEmail: true, canText: false });
    expect(by[neither]).toBeUndefined(); // no way to reach them
    expect(r.skipped).toEqual({ "no-contact": 1 });
  });

  it("'lapsed' is the owner's choice of days, 30 to 730", async () => {
    const mid = await client({ lastVisit: ago(150) });
    expect((await list(owner, { days: 180 })).candidates).toEqual([]);
    expect((await list(owner, { days: 120 })).candidates.map((c) => c.id)).toEqual([mid]);
    for (const days of [29, 731, 90.5, "90"]) {
      expect(await codeOf(list(owner, { days }))).toBe("invalid");
    }
  });

  it("tells the owner how many lapsed clients have NOT agreed; nobody else", async () => {
    await client();
    await client({ marketingOptIn: false });
    await client({ marketingOptIn: undefined, marketingConsentAt: undefined });
    await client({ lastVisit: ago(10) });
    expect((await list()).notAgreed).toBe(2);
    expect((await list(steve)).notAgreed).toBeNull();
  });
});

describe("what a stylist may invite", () => {
  it("needs the permission", async () => {
    await client();
    expect(await codeOf(list(noPermission))).toBe("forbidden");
    expect(await codeOf(send(["x"], undefined, noPermission))).toBe("forbidden");
  });

  it("only their own clients, plus a colleague's or everyone's if the owner allowed it", async () => {
    const mine = await client({ stylistIds: ["steve"] });
    const yutos = await client({ stylistIds: ["yuto"] });
    expect((await list(steve)).candidates.map((c) => c.id)).toEqual([mine]);
    const withYuto = { ...steve, access: { all: false, stylistIds: ["yuto"] } };
    expect((await list(withYuto)).candidates.map((c) => c.id).sort()).toEqual([mine, yutos].sort());
    const all = { ...steve, access: { all: true, stylistIds: [] } };
    expect((await list(all)).candidates).toHaveLength(2);
    expect((await list(owner)).candidates).toHaveLength(2);
  });

  it("out-of-scope clients are not counted as skipped (that would reveal they exist), and cannot be invited by id", async () => {
    const yutos = await client({ stylistIds: ["yuto"] });
    expect((await list(steve)).skipped).toEqual({});
    const r = await send([yutos], undefined, steve);
    expect(r).toMatchObject({ invited: 0, skipped: { "out-of-scope": 1 } });
    expect(emails).toHaveLength(0);
  });
});

describe("sending", () => {
  it("emails and texts each client once: with the book link, a personal unsubscribe link, and the owner's sender name", async () => {
    const id = await client({ name: "Jane Citizen", email: "jane@example.test" });
    const r = await send([id]);
    expect(r).toMatchObject({ requested: 1, invited: 1, emailsSent: 1, textsSent: 1, skipped: {}, results: [{ id, outcome: "both" }] });

    const token = (await db.doc(`clients/${id}`).get()).get("marketingToken") as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const link = `https://salon.example.test/unsubscribe?c=${id}&t=${token}`;

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "jane@example.test", unsubscribeLink: link, idempotencyKey: `winback-${id}-${r.campaignId}` });
    expect(emails[0].subject).toBe("We'd love to see you again — Sua Hair Studio");
    expect(emails[0].html).toContain("We miss you, Jane");
    expect(emails[0].html).toContain("https://salon.example.test");
    expect(emails[0].text).toContain(link);

    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: `+61${id.slice(1)}`, from: "SuaHair" });
    expect(texts[0].body).toContain("Hi Jane,");
    expect(texts[0].body).toContain("https://salon.example.test");
    expect(texts[0].body).toContain(link);
  });

  it("records the invitation: when, in the client's history, in the campaign log and the once-only text log", async () => {
    const id = await client();
    const r = await send([id]);
    const c = (await db.doc(`clients/${id}`).get()).data()!;
    expect(c.winBackSentAt).toBe(new Date(NOW).toISOString());
    const audit = (await db.collection(`clients/${id}/audit`).get()).docs.map((d) => d.data());
    expect(audit).toMatchObject([{ action: "edit", byName: "Owner", detail: "invited back by email and text" }]);
    expect((await db.doc(`winBackLog/${r.campaignId}`).get()).data()).toMatchObject({ byName: "Owner", requested: 1, invited: 1, emailsSent: 1, textsSent: 1, channels: { email: true, sms: true } });
    expect((await db.doc(`smsLog/winback_${id}_${r.campaignId}`).get()).data()).toMatchObject({ kind: "winback", status: "sent", toEnding: id.slice(-3) });
    // no message text and no phone number in what is kept
    const kept = JSON.stringify((await db.doc(`smsLog/winback_${id}_${r.campaignId}`).get()).data());
    expect(kept).not.toContain("+61");
    expect(kept).not.toContain('"body"');
  });

  it("only the channel chosen, and only where it works", async () => {
    const both = await client();
    const emailOnly = await client({ smsOptOut: true });
    await send([both, emailOnly], { email: true, sms: false });
    expect(texts).toHaveLength(0);
    expect(emails).toHaveLength(2);

    emails.length = 0;
    const third = await client();
    const fourth = await client({ smsOptOut: true });
    const r = await send([third, fourth], { email: false, sms: true });
    expect(texts).toHaveLength(1);
    expect(emails).toHaveLength(0);
    expect(r).toMatchObject({ invited: 1, skipped: { "channel-off": 1 } });
  });

  it("re-checks everyone as it sends: who unsubscribed, was just invited, booked, was blocked or never agreed since the list was made", async () => {
    const unsub = await client({ marketingOptOutAt: "2026-04-01T00:00:00.000Z" });
    const recent = await client({ winBackSentAt: new Date(NOW - 5 * 86_400_000).toISOString() });
    const booked = await client({ hasUpcoming: true });
    const blocked = await client({ blocked: true });
    const never = await client({ marketingOptIn: false });
    const fine = await client();
    const r = await send([unsub, recent, booked, blocked, never, fine, "04999999999"]);
    expect(r.invited).toBe(1);
    expect(r.skipped).toEqual({ "no-consent": 2, "recently-invited": 1, upcoming: 1, blocked: 1, "not-found": 1 });
    expect(emails).toHaveLength(1);
    expect(texts).toHaveLength(1);
  });

  it("is once per cool-down: a second send straight away reaches nobody", async () => {
    const id = await client();
    await send([id]);
    const again = await send([id]);
    expect(again).toMatchObject({ invited: 0, skipped: { "recently-invited": 1 } });
    expect(emails).toHaveLength(1);
    expect(texts).toHaveLength(1);
  });

  it("an email that fails does not stop the text, and a client who got neither is reported as failed", async () => {
    const a = await client();
    failEmail = true;
    const r = await send([a]);
    expect(r).toMatchObject({ invited: 1, emailsSent: 0, textsSent: 1, results: [{ id: a, outcome: "text" }] });

    const b = await client();
    failSms = true;
    const r2 = await send([b]);
    expect(r2).toMatchObject({ invited: 0, skipped: { failed: 1 } });
    expect((await db.doc(`clients/${b}`).get()).get("winBackSentAt")).toBeUndefined(); // not marked as invited
  });

  it("texts are capped like every other text: past a number's daily limit it is not sent", async () => {
    const id = await client();
    for (let i = 0; i < LIMITS.smsPerPhone.max; i += 1) await db.doc(`rateLimits/sms-phone-fill-${i}`).set({ x: 1 });
    const key = (await import("../../functions/src/limits")).hashKey(id);
    const window = Math.floor(NOW / LIMITS.smsPerPhone.windowMs);
    await db.doc(`rateLimits/sms-phone-${key}-${window}`).set({ count: LIMITS.smsPerPhone.max, scope: "sms-phone" });
    const r = await send([id], { email: false, sms: true });
    expect(r).toMatchObject({ invited: 0, skipped: { failed: 1 } });
    expect(texts).toHaveLength(0);
    expect((await db.doc(`smsLog/winback_${id}_${r.campaignId}`).get()).get("status")).toBe("capped");
  });

  it("refuses an empty or over-long list, and no channel", async () => {
    expect(await codeOf(send([]))).toBe("invalid");
    expect(await codeOf(send(Array.from({ length: MAX_PER_SEND + 1 }, (_, i) => `c${i}`)))).toBe("invalid");
    expect(await codeOf(send(["x"], { email: false, sms: false }))).toBe("invalid");
    expect(await codeOf(sendWinBackCore(db, { clientIds: "x", channels: { email: true } }, owner, NOW, deps))).toBe("invalid");
    expect(await codeOf(send(["bad id!"]))).toBe("invalid");
  });

  it("refuses when the owner has switched those messages off", async () => {
    const id = await client();
    await db.doc("privateSettings/sms").set({ enabled: false, senderName: "SuaHair", kinds: {}, templates: {} });
    await db.doc("privateSettings/email").set({ templates: { winback: { ...(await import("../../src/lib/emailRender")).DEFAULT_EMAIL_TEMPLATES.winback, enabled: false } } });
    expect(await codeOf(send([id]))).toBe("precondition");
    // email on, texts off: it goes by email only
    await db.doc("privateSettings/email").set({ templates: {} });
    const r = await send([id]);
    expect(r).toMatchObject({ invited: 1, emailsSent: 1, textsSent: 0 });
  });

  it("is limited per person per day", async () => {
    for (let i = 0; i < LIMITS.winBackSendPerDay.max; i += 1) await send([`c${i}`]).catch(() => undefined);
    expect(await codeOf(send(["x"]))).toBe("rate-limited");
  });

  it("uses the owner's own wording, and the unsubscribe line is there whatever it says", async () => {
    await db.doc("privateSettings/sms").set({ enabled: true, senderName: "SuaHair", kinds: {}, templates: { winback: "Missing you {name}! {bookingLink} Stop: {unsubscribeLink}" } });
    const id = await client({ name: "Jane Citizen" });
    await send([id]);
    expect(texts[0].body).toBe(`Missing you Jane! https://salon.example.test Stop: https://salon.example.test/unsubscribe?c=${id}&t=${(await db.doc(`clients/${id}`).get()).get("marketingToken")}`);
    // a stored wording with no way to stop is ignored in favour of the default
    texts.length = 0;
    await db.doc("privateSettings/sms").set({ enabled: true, senderName: "SuaHair", kinds: {}, templates: { winback: "Come back {name}!" } });
    const id2 = await client({ name: "Jo Bloggs" });
    await send([id2]);
    expect(texts[0].body).toContain("unsubscribe?c=");
  });
});

describe("unsubscribing", () => {
  const unsub = (raw: unknown, ip?: string) => unsubscribeMarketingCore(db, raw, { now: NOW, ...(ip ? { ip } : {}) });

  it("the link stops the invitations: recorded, and they leave the list", async () => {
    const id = await client();
    await send([id]);
    const token = (await db.doc(`clients/${id}`).get()).get("marketingToken") as string;
    expect(await unsub({ clientId: id, token })).toEqual({ ok: true });
    const c = (await db.doc(`clients/${id}`).get()).data()!;
    expect(c.marketingOptOutAt).toBe(new Date(NOW).toISOString());
    expect(c.marketingOptIn).toBeUndefined();
    const audit = (await db.collection(`clients/${id}/audit`).get()).docs.map((d) => d.data().detail);
    expect(audit).toContain("unsubscribed from invitations");
    expect((await list()).candidates.map((x) => x.id)).not.toContain(id);
    // and a send to them is skipped, not made
    expect(await send([id])).toMatchObject({ invited: 0, skipped: { "no-consent": 1 } });
    expect(emails).toHaveLength(1);
  });

  it("is safe to click twice, and survives the figures being recomputed", async () => {
    const id = await client();
    await send([id]);
    const token = (await db.doc(`clients/${id}`).get()).get("marketingToken") as string;
    await unsub({ clientId: id, token });
    await unsub({ clientId: id, token });
    await db.doc(`clients/${id}`).update({ marketingOptIn: true }); // a stale write the next recompute must not honour
    await recomputeClient(db, id, NOW);
    const c = (await db.doc(`clients/${id}`).get()).data()!;
    expect(c.marketingOptOutAt).toBeDefined();
    expect(c.marketingToken).toBe(token); // the link still works
    expect(c.winBackSentAt).toBeDefined();
  });

  it("a wrong secret, a wrong id and a malformed link all get the same answer, and change nothing", async () => {
    const id = await client();
    await send([id]);
    const msgs: string[] = [];
    for (const input of [{ clientId: id, token: "x".repeat(22) }, { clientId: "0499999999", token: "x".repeat(22) }, { clientId: id }, null, { clientId: "bad id", token: "x".repeat(22) }]) {
      try {
        await unsub(input);
      } catch (err) {
        expect((err as CommandError).code).toBe("not-found");
        msgs.push((err as CommandError).message);
      }
    }
    expect(msgs).toHaveLength(5);
    expect(new Set(msgs).size).toBe(1);
    expect((await db.doc(`clients/${id}`).get()).get("marketingOptOutAt")).toBeUndefined();
  });

  it("a client who never got a link (no secret on file) cannot be reached by one", async () => {
    const id = await client();
    expect(await codeOf(unsub({ clientId: id, token: "a".repeat(22) }))).toBe("not-found");
  });

  it("is rate limited by address", async () => {
    for (let i = 0; i < LIMITS.unsubscribePerIp.max; i += 1) await unsub({ clientId: "x", token: "y" }, "203.0.113.9").catch(() => undefined);
    expect(await codeOf(unsub({ clientId: "x", token: "y" }, "203.0.113.9"))).toBe("rate-limited");
  });
});

describe("how consent is captured", () => {
  it("a booking made with the box ticked makes the client someone who agreed, with the date and source", async () => {
    const r = await createBookingRequestCore(db, request({ marketingConsent: true, customerPhone: "0400111222" }), { now: NOW });
    expect((await db.doc(`bookings/${r.bookingId}`).get()).get("marketingConsent")).toBe(true);
    const c = (await db.doc("clients/0400111222").get()).data()!;
    expect(c).toMatchObject({ marketingOptIn: true, marketingSource: "booking-form" });
    expect(c.marketingConsentAt).toBe(new Date(NOW).toISOString());
  });

  it("without the tick nothing is recorded, and nothing is assumed", async () => {
    const r = await createBookingRequestCore(db, request({ customerPhone: "0400111333" }), { now: NOW });
    expect((await db.doc(`bookings/${r.bookingId}`).get()).get("marketingConsent")).toBeUndefined();
    const c = (await db.doc("clients/0400111333").get()).data()!;
    expect(c.marketingOptIn).toBeUndefined();
    expect(c.marketingConsentAt).toBeUndefined();
  });

  it("only a real true counts, and a later booking without the tick does not take it back", async () => {
    const phone = "0400111444";
    const times = ["11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM"];
    for (const [i, bad] of (["true", 1, "yes", null] as unknown[]).entries()) {
      const other = request({ marketingConsent: bad, time: times[i] });
      await createBookingRequestCore(db, other, { now: NOW });
      expect((await db.doc(`clients/${other.customerPhone}`).get()).get("marketingOptIn")).toBeUndefined();
    }
    await createBookingRequestCore(db, request({ marketingConsent: true, customerPhone: phone, time: "3:00 PM" }), { now: NOW });
    await createBookingRequestCore(db, request({ customerPhone: phone, time: "4:00 PM" }), { now: NOW + 1000 });
    expect((await db.doc(`clients/${phone}`).get()).get("marketingOptIn")).toBe(true);
  });

  it("the owner's recorded consent survives the figures being recomputed, and an unsubscribe outranks an older tick", async () => {
    const id = await client({ marketingSource: "owner-recorded" });
    await recomputeClient(db, id, NOW);
    expect((await db.doc(`clients/${id}`).get()).data()).toMatchObject({ marketingOptIn: true, marketingSource: "owner-recorded", marketingConsentAt: CONSENT });
    await db.doc(`clients/${id}`).update({ marketingOptOutAt: "2026-05-01T00:00:00.000Z" });
    await recomputeClient(db, id, NOW);
    const c = (await db.doc(`clients/${id}`).get()).data()!;
    expect(c.marketingOptIn).toBeUndefined();
    expect(c.marketingOptOutAt).toBe("2026-05-01T00:00:00.000Z");
  });

  it("merging two records keeps the latest agreement and the latest unsubscribe", async () => {
    const a = await client({ phone: "0400222001", marketingConsentAt: "2026-02-01T00:00:00.000Z" });
    const b = await client({ phone: "0400222002", marketingOptIn: false, marketingConsentAt: undefined, marketingSource: undefined, marketingOptOutAt: "2026-06-01T00:00:00.000Z" });
    await db.doc(`customerLookups/${a}`).set({ name: "A" });
    await mergeClientsCore(db, { keepId: a, mergeId: b }, { uid: "owner-uid", name: "Owner" }, NOW);
    const c = (await db.doc(`clients/${a}`).get()).data()!;
    expect(c.marketingOptIn).toBeUndefined(); // they unsubscribed after agreeing
    expect(c.marketingOptOutAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
