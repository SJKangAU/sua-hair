// clientCommands.ts
// The browser's side of the owner's client housekeeping (functions/src/clients.ts
// and clientBackfill.ts). These need the whole of a client's bookings, so they run on
// the server (Admin SDK); every one is owner-only there as well.
//
//   recomputeClients   repair one client's figures, or every client's
//   backfillClients    build clients from bookings and visit records: dry run,
//                      apply, rollback by batch
//   mergeClients       move one client's bookings and notes onto another
//   anonymiseClient    remove the personal data, keep bookings for the accounts
//   exportClientData   everything held about a client (JSON), for a privacy request

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export class ClientCommandError extends Error {}

const call = async <In, Out>(name: string, data: In): Promise<Out> => {
  try {
    const res = await httpsCallable<In, Out>(functions, name)(data);
    return res.data;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new ClientCommandError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new ClientCommandError("Something went wrong on our side. Please try again.");
    }
    throw new ClientCommandError(e.message);
  }
};

export interface BackfillCounts {
  bookingsScanned: number;
  bookingsToLink: number;
  clientsFound: number;
  clientsToCreate: number;
  clientsExisting: number;
  visitRecordsOnly: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  skippedAnonymised: number;
  legacyAnyStylist: number;
  breaksAndTraining: number;
}

export interface BackfillResult {
  mode: "dry" | "apply" | "rollback";
  counts?: BackfillCounts;
  report?: { row: number; reason: string }[];
  reportTruncated?: boolean;
  batchId?: string;
  created?: number;
  linked?: number;
  removed?: number;
  kept?: number;
  unlinked?: number;
}

export const backfillClients = (
  input: { mode: "dry" } | { mode: "apply" } | { mode: "rollback"; batchId: string },
) => call<typeof input, BackfillResult>("backfillClients", input);

export const recomputeClients = (clientId?: string) =>
  call<{ clientId?: string }, { checked: number; changed: number }>("recomputeClients", { clientId });

export const mergeClients = (keepId: string, mergeId: string) =>
  call<{ keepId: string; mergeId: string }, { moved: number; notesMoved: number }>("mergeClients", {
    keepId,
    mergeId,
  });

export const anonymiseClient = (clientId: string) =>
  call<{ clientId: string }, { anonymisedBookings: number }>("anonymiseClient", { clientId });

export const exportClientData = (clientId: string) =>
  call<{ clientId: string }, Record<string, unknown>>("exportClientData", { clientId });

/** The report a dry run produces, as a download: row numbers and reasons only. */
export const reportCsv = (rows: { row: number; reason: string }[]): string =>
  ["row,reason", ...rows.map((r) => `${r.row},${r.reason.replace(/,/g, ";")}`)].join("\r\n") + "\r\n";
