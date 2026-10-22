// functions/src/email/testEmail.ts
// The "send me a test" button for the email wording (FR-027): the saved wording for one
// email, filled in with a made-up booking, to an address the editor gives. Works while an
// email is switched off (that is the point), is limited per hour, and never touches a real
// booking. The transport is a parameter so it is testable without a network.

import type { Firestore } from "firebase-admin/firestore";
import { SAMPLE_BOOKING, SMS_KINDS, type SmsKind } from "../../../src/lib/sms";
import { effectiveEmailSettings } from "../../../src/lib/emailRender";
import { CommandError } from "../commandErrors";
import { LIMITS, consumeRateLimit } from "../limits";
import { buildEmail } from "./templates";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface TestEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export const sendTestEmailCore = async (
  db: Firestore,
  send: (email: TestEmail) => Promise<void>,
  raw: unknown,
  actorUid: string,
  now: number,
): Promise<{ subject: string }> => {
  const data = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const kind = data.kind;
  if (typeof kind !== "string" || !(SMS_KINDS as readonly string[]).includes(kind)) {
    throw new CommandError("invalid", "Choose which email to test.");
  }
  const to = typeof data.to === "string" ? data.to.trim() : "";
  if (to.length > 254 || !EMAIL_PATTERN.test(to)) {
    throw new CommandError("invalid", "Enter a valid email address.");
  }
  await consumeRateLimit(db, "email-test", actorUid, LIMITS.emailTestPerHour, now);

  const settings = effectiveEmailSettings((await db.doc("privateSettings/email").get()).data());
  const built = buildEmail(
    kind as SmsKind,
    {
      customerName: SAMPLE_BOOKING.customerName ?? "",
      stylistId: SAMPLE_BOOKING.stylistId,
      stylistName: SAMPLE_BOOKING.stylistName ?? "",
      serviceName: SAMPLE_BOOKING.serviceName ?? "",
      servicePrice: 95,
      date: SAMPLE_BOOKING.date ?? "",
      time: SAMPLE_BOOKING.time ?? "",
      bookingRef: SAMPLE_BOOKING.bookingRef,
    },
    settings.templates[kind as SmsKind],
  );
  const subject = `TEST: ${built.subject}`;
  try {
    await send({ to, subject, html: built.html, text: built.text });
  } catch (err) {
    console.error("Test email failed:", err instanceof Error ? err.message : "error");
    throw new CommandError("precondition", "The email service didn't accept that. Check the sending address and the email account.");
  }
  return { subject };
};
