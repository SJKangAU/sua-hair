// smsCommands.ts
// The browser's side of the owner's text-message tools (functions/src/sms/send.ts).

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { SmsKind } from "./sms";

export class SmsCommandError extends Error {}

export interface TestSmsResult {
  segments: number;
  encoding: "GSM-7" | "UCS-2";
}

/** Texts the owner's current (saved) wording for `kind`, with a sample booking, to `to`. */
export const sendTestSms = async (kind: SmsKind, to: string): Promise<TestSmsResult> => {
  try {
    const res = await httpsCallable<{ kind: SmsKind; to: string }, TestSmsResult>(functions, "sendTestSms")({ kind, to });
    return res.data;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new SmsCommandError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new SmsCommandError("Something went wrong on our side. Please try again.");
    }
    throw new SmsCommandError(e.message);
  }
};
