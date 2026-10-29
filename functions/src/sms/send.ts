// functions/src/sms/send.ts
// Sending a booking text (FR-024, DEC-050). Given a booking and the message kind
// (the same kinds the emails use - emailEvents.ts decides WHEN), this decides
// whether a text goes out and, if so, sends it. It never throws: a text is a
// courtesy and must not be able to fail a booking.
//
// Safeguards, in order:
//   1. The owner's switches (privateSettings/sms): texts on, this message on.
//   2. A valid Australian mobile on the booking.
//   3. The client has not asked not to be texted (clients/{id}.smsOptOut).
//   4. Exactly once: smsLog/{bookingId}_{kind} is created before sending, and
//      create() fails if it exists, so a trigger delivered twice, or a reminder
//      run overlapping the next, cannot send a second text.
//   5. Caps (limits.ts): per number per day, and for the whole salon per day.
//
// smsLog holds no message text and no full number - the last three digits, so the
// owner can tell which text it was - and is readable only by the owner.

import type { Firestore } from "firebase-admin/firestore";
import {
  CONSULTATION_SMS_NOTE,
  SMS_KINDS,
  effectiveSettings,
  renderSms,
  smsLength,
  smsValuesFor,
  toInternationalMobile,
  SAMPLE_BOOKING,
  type SmsBookingFields,
  type SmsKind,
} from "../../../src/lib/sms";
import { normaliseMobile } from "../../../src/lib/clientImport";
import { CommandError } from "../commandErrors";
import { LIMITS, consumeRateLimit } from "../limits";
import { SALON } from "../salon";
import type { SmsTransport } from "./provider";

export type SmsOutcome =
  | "sent"
  | "disabled" //  texts, or this message, switched off
  | "no-phone" //  no usable mobile number on the booking
  | "opted-out" // the client asked not to be texted
  | "duplicate" // already sent (or being sent) for this booking
  | "capped" //    a daily cap was reached
  | "failed"; //   the provider refused or was unreachable

export interface SmsBooking extends SmsBookingFields {
  bookingType?: string;
  customerPhone?: string | null;
}

const SETTINGS_PATH = "privateSettings/sms";

const errorText = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 300);

const ALREADY_EXISTS = 6;

export const sendBookingSmsCore = async (
  db: Firestore,
  transport: SmsTransport,
  kind: SmsKind,
  bookingId: string,
  booking: SmsBooking,
  now: number,
): Promise<SmsOutcome> => {
  try {
    const settings = effectiveSettings((await db.doc(SETTINGS_PATH).get()).data());
    if (!settings.enabled || !settings.kinds[kind]) return "disabled";

    const local = normaliseMobile(booking.customerPhone ?? "");
    const to = local ? toInternationalMobile(local) : null;
    if (!local || !to) return "no-phone";

    const client = await db.doc(`clients/${local}`).get();
    if (client.get("smsOptOut") === true) return "opted-out";

    const log = db.doc(`smsLog/${bookingId}_${kind}`);
    const body =
      renderSms(settings.templates[kind], smsValuesFor(booking, SALON)) +
      (kind === "received" && booking.consultationCall ? CONSULTATION_SMS_NOTE : "");
    const length = smsLength(body);
    try {
      await log.create({
        bookingId,
        bookingRef: booking.bookingRef ?? null,
        kind,
        status: "sending",
        toEnding: local.slice(-3),
        segments: length.segments,
        encoding: length.encoding,
        createdAt: new Date(now).toISOString(),
      });
    } catch (err) {
      if ((err as { code?: number }).code === ALREADY_EXISTS) return "duplicate";
      throw err;
    }

    try {
      await consumeRateLimit(db, "sms-phone", local, LIMITS.smsPerPhone, now);
      await consumeRateLimit(db, "sms-all", "salon", LIMITS.smsPerDay, now);
    } catch (err) {
      if (err instanceof CommandError && err.code === "rate-limited") {
        await log.update({ status: "capped" });
        return "capped";
      }
      throw err;
    }

    try {
      const { id } = await transport.send({
        to,
        from: settings.senderName,
        body,
        reference: `${bookingId}_${kind}`,
      });
      await log.update({ status: "sent", sentAt: new Date().toISOString(), providerId: id });
      return "sent";
    } catch (err) {
      console.error(`${kind} text failed for booking ${bookingId}:`, errorText(err));
      await log.update({ status: "failed", error: errorText(err) }).catch(() => undefined);
      return "failed";
    }
  } catch (err) {
    console.error(`${kind} text could not be started for booking ${bookingId}:`, errorText(err));
    return "failed";
  }
};

// ── Owner's test text ────────────────────────────────────────────────────────

export interface TestSmsResult {
  segments: number;
  encoding: "GSM-7" | "UCS-2";
}

/**
 * { kind, to }: sends the owner's current wording for `kind`, filled in with a
 * sample booking, to the number they give. Works before texts are switched on (that
 * is the point), but still counts against the daily caps.
 */
export const sendTestSmsCore = async (
  db: Firestore,
  transport: SmsTransport,
  raw: unknown,
  ownerUid: string,
  now: number,
): Promise<TestSmsResult> => {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const kind = data.kind;
  if (typeof kind !== "string" || !(SMS_KINDS as readonly string[]).includes(kind)) {
    throw new CommandError("invalid", "Choose which message to test.");
  }
  const local = typeof data.to === "string" ? normaliseMobile(data.to) : null;
  const to = local ? toInternationalMobile(local) : null;
  if (!to) throw new CommandError("invalid", "Enter a mobile number like 0412 345 678.");

  await consumeRateLimit(db, "sms-test", ownerUid, LIMITS.smsTestPerHour, now);
  await consumeRateLimit(db, "sms-all", "salon", LIMITS.smsPerDay, now);

  const settings = effectiveSettings((await db.doc(SETTINGS_PATH).get()).data());
  const body = `TEST: ${renderSms(settings.templates[kind as SmsKind], smsValuesFor(SAMPLE_BOOKING, SALON))}`;
  try {
    await transport.send({ to, from: settings.senderName, body, reference: `test_${ownerUid.slice(0, 8)}_${now}` });
  } catch (err) {
    console.error("Test text failed:", errorText(err));
    throw new CommandError("precondition", "The text message service didn't accept that. Check the sender name and your account.");
  }
  const { segments, encoding } = smsLength(body);
  return { segments, encoding };
};
