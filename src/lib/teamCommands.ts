// teamCommands.ts
// The browser's side of role management (functions/src/index.ts setUserRole, owner
// only): give someone a role, change whose clients a stylist may open, or take a
// role away. The role and the claim are written together by the Admin SDK.

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { ClientAccess } from "./clientAccess";
import type { Capability, Permissions } from "./permissions";

export class TeamCommandError extends Error {}

export type TeamChange =
  | { email: string; role: "owner" }
  | { email: string; role: "stylist"; stylistId: string; clientAccess?: ClientAccess; permissions?: Permissions }
  | { email: string; role: "none" };

export const setUserRole = async (change: TeamChange): Promise<void> => {
  try {
    await httpsCallable<TeamChange, { ok: boolean }>(functions, "setUserRole")(change);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new TeamCommandError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new TeamCommandError("Something went wrong on our side. Please try again.");
    }
    // not-found ("create the login first"), failed-precondition (last owner...), invalid-argument
    throw new TeamCommandError(e.message);
  }
};

/** What EVERY stylist may do (the role defaults); each stylist's own overrides are kept. */
export const setPermissionDefaults = async (capabilities: Capability[]): Promise<void> => {
  try {
    await httpsCallable<{ capabilities: Capability[] }, { ok: boolean; changed: number }>(
      functions,
      "setPermissionDefaults",
    )({ capabilities });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = (e.code ?? "").replace(/^functions\//, "");
    if (code === "unavailable" || code === "deadline-exceeded") {
      throw new TeamCommandError("We couldn't reach the server. Please check your connection and try again.");
    }
    if (code === "internal" || code === "unknown" || code === "unauthenticated" || !e.message) {
      throw new TeamCommandError("Something went wrong on our side. Please try again.");
    }
    throw new TeamCommandError(e.message);
  }
};
