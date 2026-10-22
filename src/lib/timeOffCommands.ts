// timeOffCommands.ts
// The browser's side of stylist time off (functions/src/timeOff.ts). A stylist asks for their
// own days off and blocked times; the owner, or a stylist trusted with "approve time off",
// decides; the owner's own entries apply at once. Every refusal comes back as a TimeOffError
// whose message is written to be shown as it is.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { Clash, TimeOffInput, TimeOffStatus } from "./timeOff";

export class TimeOffError extends Error {}

const call = async <In, Out>(name: string, data: In): Promise<Out> => {
  try {
    return (await httpsCallable<In, Out>(functions, name)(data)).data;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new TimeOffError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new TimeOffError("Something went wrong on our side. Please try again.");
    }
    throw new TimeOffError(e.message);
  }
};

/** What the person is asking for (everything else is decided by the server). */
export type TimeOffAsk = Pick<TimeOffInput, "stylistId" | "kind" | "startDate" | "endDate" | "startTime" | "endTime" | "reason">;

export interface RequestOutcome {
  id: string;
  status: TimeOffStatus;
  /** The time is already blocked for customers */
  blocked: boolean;
  auto: boolean;
  cancelled: Clash[];
}

export const previewTimeOff = (ask: TimeOffAsk) => call<TimeOffAsk, { clashes: Clash[] }>("previewTimeOff", ask);

/** `cancelBookingIds`: only an owner or approver's own entry can cancel bookings to make room. */
export const requestTimeOff = (ask: TimeOffAsk & { cancelBookingIds?: string[] }) =>
  call<TimeOffAsk & { cancelBookingIds?: string[] }, RequestOutcome>("requestTimeOff", ask);

export const decideTimeOff = (input: { id: string; decision: "approve" | "decline"; cancelBookingIds?: string[]; note?: string }) =>
  call<typeof input, { status: TimeOffStatus; cancelled: Clash[] }>("decideTimeOff", input);

export const withdrawTimeOff = (id: string) => call<{ id: string }, { status: TimeOffStatus }>("withdrawTimeOff", { id });
