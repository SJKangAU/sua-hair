// functions/src/sms/provider.ts
// Sending one text. The rest of the SMS code only knows the SmsTransport shape, so
// the real provider (ClickSend) and the stand-ins used by tests are interchangeable:
//
//   clickSendTransport   POSTs to ClickSend. Throws on any failure; the caller logs it.
//   outboxTransport      Functions emulator only: writes the message to smsOutbox so
//                        a test (or a person running the app locally) can see what
//                        WOULD have been sent. Nothing can reach a real phone.
//
// ClickSend: https://developers.clicksend.com/docs/rest/v3/#send-sms
// Basic auth is "<username>:<api key>". A 200 can still carry a per-message failure
// (bad recipient, no credit...), so the message status is checked too.

import type { Firestore } from "firebase-admin/firestore";

export interface OutboundSms {
  to: string; //        "+61412345678"
  from: string; //      alphanumeric sender ID
  body: string;
  reference: string; // our own id, echoed back by the provider (never personal data)
}

export interface SmsTransport {
  send(sms: OutboundSms): Promise<{ id: string | null }>;
}

const CLICKSEND_ENDPOINT = "https://rest.clicksend.com/v3/sms/send";

export interface ClickSendCredentials {
  username: string;
  apiKey: string;
}

export const clickSendTransport = (creds: ClickSendCredentials): SmsTransport => ({
  async send(sms) {
    if (!creds.username || !creds.apiKey) throw new Error("ClickSend credentials are not set");
    const res = await fetch(CLICKSEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.apiKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ source: "sua-hair", from: sms.from, to: sms.to, body: sms.body, custom_string: sms.reference }],
      }),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`ClickSend responded ${res.status}: ${text.slice(0, 200)}`);
    let parsed: { data?: { messages?: { status?: string; message_id?: string }[] } } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("ClickSend returned something that was not JSON");
    }
    const message = parsed.data?.messages?.[0];
    if (!message || message.status !== "SUCCESS") {
      throw new Error(`ClickSend did not send it: ${message?.status ?? "no message status"}`);
    }
    return { id: message.message_id ?? null };
  },
});

export const outboxTransport = (db: Firestore): SmsTransport => ({
  async send(sms) {
    const ref = await db.collection("smsOutbox").add({ ...sms, createdAt: new Date().toISOString() });
    console.log(`[emulator] text not sent: ${sms.reference}`);
    return { id: ref.id };
  },
});

export const inEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === "true";
