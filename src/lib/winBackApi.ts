// winBackApi.ts
// The browser's side of inviting lapsed clients back (FR-030, DEC-056): the list of who may be
// invited, the send (the server re-checks every client as it goes), and the public unsubscribe
// the link in each invitation leads to. The rules themselves live in functions/src/winBack.ts.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export class WinBackError extends Error {}

export type SkipReason =
  | "no-consent"
  | "not-lapsed"
  | "upcoming"
  | "blocked"
  | "recently-invited"
  | "out-of-scope"
  | "no-contact"
  | "not-found"
  | "failed"
  | "channel-off";

export const SKIP_WORDS: Record<SkipReason, string> = {
  "no-consent": "have not agreed to hear from us (or have unsubscribed)",
  "not-lapsed": "have been in recently",
  upcoming: "already have a booking",
  blocked: "are blocked",
  "recently-invited": "were invited back recently",
  "out-of-scope": "are not your clients",
  "no-contact": "have no email or mobile we can use",
  "not-found": "could not be found",
  failed: "could not be reached",
  "channel-off": "can't be reached the way you chose",
};

export interface WinBackCandidate {
  id: string;
  name: string;
  lastVisit: string;
  totalVisits: number;
  canEmail: boolean;
  canText: boolean;
}

export interface WinBackList {
  days: number;
  candidates: WinBackCandidate[];
  skipped: Partial<Record<SkipReason, number>>;
  /** Owner only: lapsed clients who have not agreed to hear from the salon */
  notAgreed: number | null;
}

export interface WinBackSent {
  campaignId: string;
  requested: number;
  invited: number;
  emailsSent: number;
  textsSent: number;
  skipped: Partial<Record<SkipReason, number>>;
  results: { id: string; outcome: "email" | "text" | "both" | "none"; skipped?: SkipReason }[];
}

const call = async <In, Out>(name: string, data: In): Promise<Out> => {
  try {
    return (await httpsCallable<In, Out>(functions, name)(data)).data;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new WinBackError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new WinBackError("Something went wrong on our side. Please try again.");
    }
    throw new WinBackError(e.message);
  }
};

export const listWinBackCandidates = (days: number) => call<{ days: number }, WinBackList>("winBackCandidates", { days });

export const sendWinBack = (clientIds: string[], channels: { email: boolean; sms: boolean }, days: number) =>
  call<{ clientIds: string[]; channels: { email: boolean; sms: boolean }; days: number }, WinBackSent>("sendWinBack", {
    clientIds,
    channels,
    days,
  });

export const unsubscribeMarketing = (clientId: string, token: string) =>
  call<{ clientId: string; token: string }, { ok: boolean }>("unsubscribeMarketing", { clientId, token });
