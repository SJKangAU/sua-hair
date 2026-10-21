// functions/src/guards.ts
// Who is calling a callable. The role is read from users/{uid} - the Admin-only
// record roles.ts writes together with the claim - rather than from the token, so
// a role that has been revoked stops working in functions immediately instead of
// when the token expires.

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { normaliseDefaults, type Capability } from "../../src/lib/permissions";

export interface Caller {
  uid: string;
  role: "owner" | "stylist";
  stylistId?: string;
}

export const callerRole = async (
  db: Firestore,
  request: Pick<CallableRequest, "auth">,
): Promise<Caller | null> => {
  const uid = request.auth?.uid;
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  const role = snap.get("role");
  if (role !== "owner" && role !== "stylist") return null;
  return { uid, role, stylistId: snap.get("stylistId") };
};

export const requireOwner = async (
  db: Firestore,
  request: Pick<CallableRequest, "auth">,
  action = "do that",
): Promise<Caller> => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const caller = await callerRole(db, request);
  if (!caller || caller.role !== "owner") {
    throw new HttpsError("permission-denied", `Only the salon owner can ${action}.`);
  }
  return caller;
};

/**
 * The owner, or a stylist the owner has given `capability` (FR-026). Read from the
 * users/{uid} record, like the role, so a permission taken away stops working at once
 * rather than when the sign-in token is next refreshed.
 */
export const requireCapability = async (
  db: Firestore,
  request: Pick<CallableRequest, "auth">,
  capability: Capability,
  action = "do that",
): Promise<Caller> => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const caller = await callerRole(db, request);
  if (caller?.role === "owner") return caller;
  if (caller?.role === "stylist") {
    const record = await db.doc(`users/${caller.uid}`).get();
    if (normaliseDefaults(record.get("effectiveCaps")).includes(capability)) return caller;
  }
  throw new HttpsError("permission-denied", `You do not have permission to ${action}.`);
};
