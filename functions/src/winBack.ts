// functions/src/winBack.ts
// Inviting lapsed clients back (FR-030, DEC-056). This is MARKETING, so unlike a booking message it
// goes only to clients who have agreed to hear from the salon (the optional box on the booking
// form, the owner's walk-in form, or the owner's own record) and every message carries a link that
// stops it. The rules, in order, for every client, re-checked at the moment of sending:
//
//   consent       they agreed, and have not unsubscribed since (src/lib/marketing.ts)
//   lapsed        their last visit is more than N days ago, and nothing is booked
//   not blocked   (or anonymised)
//   not recently  not already invited in the last 60 days
//   in scope      the owner sees everyone; a stylist allowed to send sees only the clients they may open
//   a way to reach them   a valid email, and/or a mobile that has not opted out of texts
//
// Texts go through the same once-only, capped path as booking texts; emails through Resend with a
// List-Unsubscribe header. The public unsubscribe checks a secret kept on the client record.
// Pure of firebase-functions (CommandError), tested on the emulator with stand-in senders.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { addDaysToDate, businessToday } from "../../src/lib/businessTime";
import type { ClientAccess } from "../../src/lib/clientAccess";
import { clientIdFromPhone, LAPSED_DAYS } from "../../src/lib/clients";
import { effectiveEmailSettings, renderEmail, type EmailBookingData } from "../../src/lib/emailRender";
import { WIN_BACK_COOLDOWN_DAYS, hasMarketingConsent } from "../../src/lib/marketing";
import { effectiveSettings, renderSms, smsLength, smsValuesFor } from "../../src/lib/sms";
import { validateEmail } from "../../src/lib/validation";
import type { Client } from "../../src/types";
import { CommandError } from "./commandErrors";
import { SALON_FOR_EMAIL } from "./email/templates";
import { LIMITS, consumeRateLimit } from "./limits";
import { SALON } from "./salon";
import type { SmsTransport } from "./sms/provider";

export interface WinBackActor {
  uid: string;
  name: string;
  role: "owner" | "stylist";
  stylistId?: string;
  /** The owner, or a stylist with the "send win-back messages" permission */
  canSend: boolean;
  /** Whose clients a stylist may open beyond their own */
  access: ClientAccess;
}

export const MIN_DAYS = 30;
export const MAX_DAYS = 730;
export const MAX_PER_SEND = 100;

const iso = (ms: number): string => new Date(ms).toISOString();
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const assertMaySend = (actor: WinBackActor): void => {
  if (!actor.canSend) throw new CommandError("forbidden", "You don't have permission to invite clients back.");
};

const parseDays = (raw: unknown): number => {
  const v = (typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).days : undefined) ?? LAPSED_DAYS;
  if (typeof v !== "number" || !Number.isInteger(v) || v < MIN_DAYS || v > MAX_DAYS) {
    throw new CommandError("invalid", `Choose between ${MIN_DAYS} and ${MAX_DAYS} days.`);
  }
  return v;
};

/** Is this client one this person may invite (the owner: everyone; a stylist: those they may open)? */
const inScope = (actor: WinBackActor, c: Client): boolean => {
  if (actor.role === "owner" || actor.access.all) return true;
  const mine = actor.stylistId ? [actor.stylistId, ...actor.access.stylistIds] : actor.access.stylistIds;
  return (c.stylistIds ?? []).some((s) => mine.includes(s));
};

export type SkipReason = "no-consent" | "not-lapsed" | "upcoming" | "blocked" | "recently-invited" | "out-of-scope" | "no-contact" | "not-found";

/** Why this client should NOT be invited right now (null = they are fine). Pure given the clock. */
export const winBackBlocker = (c: Client | undefined, actor: WinBackActor, days: number, now: number): SkipReason | null => {
  if (!c) return "not-found";
  if (c.anonymised || c.blocked) return "blocked";
  if (!inScope(actor, c)) return "out-of-scope";
  if (!hasMarketingConsent(c)) return "no-consent";
  if (c.hasUpcoming) return "upcoming";
  const cutoff = addDaysToDate(businessToday(now), -days);
  if (!c.lastVisit || c.lastVisit >= cutoff) return "not-lapsed";
  if (c.winBackSentAt && c.winBackSentAt > iso(now - WIN_BACK_COOLDOWN_DAYS * 86_400_000)) return "recently-invited";
  return null;
};

const channelsOf = (c: Client): { email: boolean; sms: boolean } => ({
  email: !!c.email && validateEmail(c.email) && c.email.length <= 254,
  sms: !!clientIdFromPhone(c.phone) && c.smsOptOut !== true,
});

// ── The list ─────────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
  lastVisit: string;
  totalVisits: number;
  canEmail: boolean;
  canText: boolean;
}

export interface CandidatesResult {
  days: number;
  candidates: Candidate[];
  /** Of the lapsed clients who agreed to hear from you: how many were left out, and why */
  skipped: Partial<Record<SkipReason, number>>;
  /** Owner only: lapsed clients who have NOT agreed (so you know what you are not reaching) */
  notAgreed: number | null;
}

export const winBackCandidatesCore = async (
  db: Firestore,
  raw: unknown,
  actor: WinBackActor,
  now: number,
): Promise<CandidatesResult> => {
  assertMaySend(actor);
  await consumeRateLimit(db, "winback-list", actor.uid, LIMITS.winBackListPerHour, now);
  const days = parseDays(raw);
  const cutoff = addDaysToDate(businessToday(now), -days);
  const snap = await db
    .collection("clients")
    .where("marketingOptIn", "==", true)
    .where("lastVisit", ">", "")
    .where("lastVisit", "<", cutoff)
    .orderBy("lastVisit", "desc")
    .limit(500)
    .get();

  const candidates: Candidate[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  for (const d of snap.docs) {
    const c = { ...(d.data() as Client), id: d.id };
    const why = winBackBlocker(c, actor, days, now);
    if (why) {
      if (why !== "out-of-scope") skipped[why] = (skipped[why] ?? 0) + 1;
      continue;
    }
    const ch = channelsOf(c);
    if (!ch.email && !ch.sms) {
      skipped["no-contact"] = (skipped["no-contact"] ?? 0) + 1;
      continue;
    }
    candidates.push({ id: c.id, name: c.name, lastVisit: c.lastVisit, totalVisits: c.totalVisits, canEmail: ch.email, canText: ch.sms });
  }

  let notAgreed: number | null = null;
  if (actor.role === "owner") {
    const [lapsed, agreed] = await Promise.all([
      db.collection("clients").where("lastVisit", ">", "").where("lastVisit", "<", cutoff).count().get(),
      db.collection("clients").where("marketingOptIn", "==", true).where("lastVisit", ">", "").where("lastVisit", "<", cutoff).count().get(),
    ]);
    notAgreed = Math.max(0, lapsed.data().count - agreed.data().count);
  }
  return { days, candidates, skipped, notAgreed };
};

// ── Sending ──────────────────────────────────────────────────────────────────

export interface WinBackDeps {
  smsTransport: SmsTransport;
  sendEmail: (email: { to: string; subject: string; html: string; text: string; unsubscribeLink: string; idempotencyKey: string }) => Promise<void>;
  /** The site's public address (no trailing slash): the booking page, and the unsubscribe page under it */
  siteUrl: string;
}

export type SendOutcome = "email" | "text" | "both" | "none";

export interface SendResult {
  campaignId: string;
  requested: number;
  /** Clients who got at least one message */
  invited: number;
  emailsSent: number;
  textsSent: number;
  skipped: Partial<Record<SkipReason | "failed" | "channel-off", number>>;
  results: { id: string; outcome: SendOutcome; skipped?: SkipReason | "failed" | "channel-off" }[];
}

export const newMarketingToken = (): string => randomBytes(16).toString("base64url");

const ensureToken = async (db: Firestore, c: Client): Promise<string> => {
  if (c.marketingToken) return c.marketingToken;
  const token = newMarketingToken();
  await db.doc(`clients/${c.id}`).update({ marketingToken: token });
  return token;
};

const SERVICE_NAMES = async (db: Firestore, ids: string[]): Promise<string> => {
  if (ids.length === 0) return "";
  const s = await db.doc(`services/${ids[0]}`).get();
  return (s.get("name") as string | undefined) ?? "";
};

export const sendWinBackCore = async (
  db: Firestore,
  raw: unknown,
  actor: WinBackActor,
  now: number,
  deps: WinBackDeps,
): Promise<SendResult> => {
  assertMaySend(actor);
  await consumeRateLimit(db, "winback-send", actor.uid, LIMITS.winBackSendPerDay, now);
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const days = parseDays(raw);
  const ids = Array.isArray(r.clientIds) ? [...new Set(r.clientIds.filter((v): v is string => typeof v === "string" && ID_PATTERN.test(v)))] : [];
  if (ids.length === 0) throw new CommandError("invalid", "Choose at least one client.");
  if (ids.length > MAX_PER_SEND) throw new CommandError("invalid", `Invite up to ${MAX_PER_SEND} clients at a time.`);
  const channels = (r.channels && typeof r.channels === "object" ? r.channels : {}) as { email?: unknown; sms?: unknown };
  const wantEmail = channels.email === true;
  const wantSms = channels.sms === true;
  if (!wantEmail && !wantSms) throw new CommandError("invalid", "Choose email, text, or both.");

  const [smsSettings, emailSettings] = await Promise.all([
    db.doc("privateSettings/sms").get().then((s) => effectiveSettings(s.data())),
    db.doc("privateSettings/email").get().then((s) => effectiveEmailSettings(s.data())),
  ]);
  const smsOn = wantSms && smsSettings.enabled && smsSettings.kinds.winback;
  const emailOn = wantEmail && emailSettings.templates.winback.enabled;
  if (!smsOn && !emailOn) {
    throw new CommandError("precondition", "Those messages are switched off. Turn on the invitation in Manage (Emails or Text messages) first.");
  }

  const campaignId = db.collection("winBackLog").doc().id;
  const result: SendResult = { campaignId, requested: ids.length, invited: 0, emailsSent: 0, textsSent: 0, skipped: {}, results: [] };
  const skip = (id: string, why: SkipReason | "failed" | "channel-off") => {
    result.skipped[why] = (result.skipped[why] ?? 0) + 1;
    result.results.push({ id, outcome: "none", skipped: why });
  };

  const snaps = await db.getAll(...ids.map((id) => db.doc(`clients/${id}`)));
  for (const snap of snaps) {
    const c = snap.exists ? ({ ...(snap.data() as Client), id: snap.id } as Client) : undefined;
    const why = winBackBlocker(c, actor, days, now);
    if (why || !c) {
      skip(snap.id, why ?? "not-found");
      continue;
    }
    const ch = channelsOf(c);
    const doEmail = emailOn && ch.email;
    const doSms = smsOn && ch.sms;
    if (!doEmail && !doSms) {
      skip(c.id, wantEmail || wantSms ? (ch.email || ch.sms ? "channel-off" : "no-contact") : "channel-off");
      continue;
    }

    const token = await ensureToken(db, c);
    const base = deps.siteUrl.replace(/\/+$/, "");
    const unsubscribeLink = `${base}/unsubscribe?c=${encodeURIComponent(c.id)}&t=${encodeURIComponent(token)}`;
    const favouriteStylist = c.favouriteStylistId ? ((await db.doc(`stylists/${c.favouriteStylistId}`).get()).get("name") as string | undefined) ?? "" : "";
    const invite: EmailBookingData = {
      customerName: c.name,
      stylistName: favouriteStylist,
      serviceName: await SERVICE_NAMES(db, c.favouriteServiceIds ?? []),
      lastVisit: c.lastVisit,
      bookingLink: base,
      unsubscribeLink,
    };

    let sentEmail = false;
    let sentText = false;
    if (doEmail && c.email) {
      try {
        const built = renderEmail(emailSettings.templates.winback, invite, SALON_FOR_EMAIL);
        await deps.sendEmail({ to: c.email, subject: built.subject, html: built.html, text: built.text, unsubscribeLink, idempotencyKey: `winback-${c.id}-${campaignId}` });
        sentEmail = true;
      } catch (err) {
        console.error("Win-back email failed:", err instanceof Error ? err.message : "error");
      }
    }
    if (doSms) sentText = (await sendInviteText(db, deps.smsTransport, c, campaignId, invite, now)) === "sent";

    if (!sentEmail && !sentText) {
      skip(c.id, "failed");
      continue;
    }
    result.invited += 1;
    if (sentEmail) result.emailsSent += 1;
    if (sentText) result.textsSent += 1;
    result.results.push({ id: c.id, outcome: sentEmail && sentText ? "both" : sentEmail ? "email" : "text" });
    await db.doc(`clients/${c.id}`).update({ winBackSentAt: iso(now) });
    await db.collection(`clients/${c.id}/audit`).add({
      action: "edit",
      byUid: actor.uid,
      byName: actor.name,
      at: iso(now),
      detail: `invited back by ${sentEmail && sentText ? "email and text" : sentEmail ? "email" : "text"}`,
    });
  }

  await db.doc(`winBackLog/${campaignId}`).set({
    byUid: actor.uid,
    byName: actor.name,
    at: iso(now),
    days,
    channels: { email: emailOn, sms: smsOn },
    requested: result.requested,
    invited: result.invited,
    emailsSent: result.emailsSent,
    textsSent: result.textsSent,
    skipped: result.skipped,
  });
  return result;
};

/** One invitation text: once per client per campaign, capped, from the owner's sender name and wording. */
const sendInviteText = async (
  db: Firestore,
  transport: SmsTransport,
  c: Client,
  campaignId: string,
  invite: EmailBookingData,
  now: number,
): Promise<"sent" | "capped" | "duplicate" | "failed"> => {
  const settings = effectiveSettings((await db.doc("privateSettings/sms").get()).data());
  const local = clientIdFromPhone(c.phone);
  const to = local ? `+61${local.slice(1)}` : null;
  if (!local || !to) return "failed";
  const body = renderSms(settings.templates.winback, smsValuesFor({ ...invite, customerName: c.name }, SALON));
  const log = db.doc(`smsLog/winback_${c.id}_${campaignId}`);
  const length = smsLength(body);
  try {
    await log.create({ kind: "winback", clientId: c.id, status: "sending", toEnding: local.slice(-3), segments: length.segments, encoding: length.encoding, createdAt: iso(now) });
  } catch (err) {
    if ((err as { code?: number }).code === 6) return "duplicate";
    return "failed";
  }
  try {
    await consumeRateLimit(db, "sms-phone", local, LIMITS.smsPerPhone, now);
    await consumeRateLimit(db, "sms-all", "salon", LIMITS.smsPerDay, now);
  } catch (err) {
    if (err instanceof CommandError && err.code === "rate-limited") {
      await log.update({ status: "capped" });
      return "capped";
    }
    return "failed";
  }
  try {
    const { id } = await transport.send({ to, from: settings.senderName, body, reference: `winback_${campaignId}` });
    await log.update({ status: "sent", sentAt: iso(Date.now()), providerId: id });
    return "sent";
  } catch (err) {
    console.error("Win-back text failed:", err instanceof Error ? err.message : "error");
    await log.update({ status: "failed" }).catch(() => undefined);
    return "failed";
  }
};

// ── Unsubscribing (public) ───────────────────────────────────────────────────

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const unsubscribeMarketingCore = async (
  db: Firestore,
  raw: unknown,
  ctx: { now: number; ip?: string },
): Promise<{ ok: true }> => {
  if (ctx.ip) await consumeRateLimit(db, "unsubscribe-ip", ctx.ip, LIMITS.unsubscribePerIp, ctx.now);
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = r.clientId;
  const token = r.token;
  const NOT_FOUND = new CommandError("not-found", "That link is out of date. Please call the salon and we'll take you off the list.");
  if (typeof id !== "string" || !ID_PATTERN.test(id) || typeof token !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw NOT_FOUND;
  const ref = db.doc(`clients/${id}`);
  const snap = await ref.get();
  const stored = snap.get("marketingToken");
  if (!snap.exists || typeof stored !== "string" || !sameToken(stored, token)) throw NOT_FOUND;
  await ref.update({ marketingOptOutAt: iso(ctx.now), marketingOptIn: FieldValue.delete() });
  await db.collection(`clients/${id}/audit`).add({ action: "edit", byUid: "client", byName: "The client", at: iso(ctx.now), detail: "unsubscribed from invitations" });
  return { ok: true };
};
