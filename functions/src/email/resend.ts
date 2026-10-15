// functions/src/email/resend.ts
// Minimal Resend client over fetch (Node 20 has it built in — no SDK needed).
// Throws on any non-2xx so callers decide how to handle failure; every caller
// in index.ts catches and logs, so email trouble can never fail a booking.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface OutboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  // Resend de-duplicates requests carrying the same key for 24 hours, which
  // protects against Firestore triggers' at-least-once delivery.
  idempotencyKey?: string;
}

export const sendEmail = async (
  apiKey: string,
  email: OutboundEmail,
): Promise<void> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (email.idempotencyKey) headers["Idempotency-Key"] = email.idempotencyKey;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${body}`);
  }
};
