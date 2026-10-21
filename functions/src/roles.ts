// functions/src/roles.ts
// Role grants: who is the owner, who is a stylist, and whose clients a stylist
// may open beyond their own (DEC-033, DEC-051), and what else they may do (DEC-052).
//
// A grant is TWO writes made together by the Admin SDK and nothing else:
//   - custom claims on the Auth user  { role, stylistId?, clientsAll? | clientStylists?, caps? }
//                                                           -> what firestore.rules reads
//   - users/{uid}  { role, stylistId?, clientAccess?, permissions?, effectiveCaps?, email, grantedAt }
//                                                           -> the readable record, and what
//                                                              the functions check
// Neither can be written by a client (rules: users is write:false; claims are
// Admin-only), so a role can only come from the provisioning script or the
// owner-only setUserRole function.
//
// Nothing here imports firebase-functions, so the provisioning script and the
// emulator tests can use it directly.

import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  accessFromClaims,
  claimsForAccess,
  hasExtraAccess,
  normaliseAccess,
  type ClientAccess,
} from "../../src/lib/clientAccess";
import {
  NO_PERMISSIONS,
  capabilitiesFromClaims,
  claimsForCapabilities,
  effectiveCapabilities,
  normaliseDefaults,
  normalisePermissions,
  type Capability,
  type Permissions,
} from "../../src/lib/permissions";

export type Role = "owner" | "stylist";

export interface RoleGrant {
  role: Role;
  stylistId?: string;
  /**
   * Whose clients a stylist may open beyond their own. Left out, a stylist who already
   * has the role keeps what they had (re-granting never silently narrows or widens it).
   */
  clientAccess?: ClientAccess;
  /**
   * Capabilities granted to / denied this stylist on top of the role defaults (FR-026).
   * Left out, a stylist who already has the role keeps theirs.
   */
  permissions?: Permissions;
}

export class RoleError extends Error {
  constructor(
    readonly code: "invalid" | "last-owner" | "self-demotion" | "no-stylist",
    message: string,
  ) {
    super(message);
    this.name = "RoleError";
  }
}

const claimsFor = (grant: RoleGrant, access: ClientAccess, caps: Capability[]): Record<string, unknown> =>
  grant.role === "stylist" && grant.stylistId
    ? { role: "stylist", stylistId: grant.stylistId, ...claimsForAccess(access), ...claimsForCapabilities(caps) }
    : { role: grant.role };

const DEFAULTS_PATH = "privateSettings/permissions";

/** The capabilities every stylist has (the owner's role defaults). */
export const stylistDefaults = async (db: Firestore): Promise<Capability[]> =>
  normaliseDefaults((await db.doc(DEFAULTS_PATH).get()).get("stylistDefaults"));

/** The owners currently on record. */
export const ownerUids = async (db: Firestore): Promise<string[]> => {
  const snap = await db.collection("users").where("role", "==", "owner").get();
  return snap.docs.map((d) => d.id);
};

export const validateGrant = (grant: RoleGrant): void => {
  if (grant.role !== "owner" && grant.role !== "stylist") {
    throw new RoleError("invalid", "Role must be owner or stylist.");
  }
  if (grant.role === "stylist" && !(grant.stylistId && grant.stylistId.trim())) {
    throw new RoleError("invalid", "A stylist role needs a stylistId.");
  }
  if (grant.role === "owner" && grant.stylistId) {
    throw new RoleError("invalid", "An owner has no stylistId.");
  }
  if (grant.role === "owner" && grant.clientAccess && hasExtraAccess(grant.clientAccess)) {
    throw new RoleError("invalid", "An owner already sees every client.");
  }
};

/**
 * Give `uid` a role. Refuses to take the owner role away from the last owner
 * (it would lock everyone out of the admin) and an owner demoting themselves.
 */
export const grantRole = async (
  auth: Auth,
  db: Firestore,
  uid: string,
  grant: RoleGrant,
  options: { actingUid?: string } = {},
): Promise<void> => {
  validateGrant(grant);
  if (grant.role === "stylist") {
    const stylist = await db.doc(`stylists/${grant.stylistId}`).get();
    if (!stylist.exists) {
      throw new RoleError("no-stylist", "That stylist does not exist.");
    }
  }
  const user = await auth.getUser(uid);
  const current = user.customClaims?.role;

  // Whose clients a stylist may open: what the owner chose, else what they already had
  let access: ClientAccess = { all: false, stylistIds: [] };
  if (grant.role === "stylist") {
    access =
      grant.clientAccess !== undefined
        ? normaliseAccess(grant.clientAccess, grant.stylistId)
        : user.customClaims?.stylistId === grant.stylistId
          ? accessFromClaims(user.customClaims ?? {}, grant.stylistId)
          : access;
    for (const id of access.stylistIds) {
      if (!(await db.doc(`stylists/${id}`).get()).exists) {
        throw new RoleError("no-stylist", "One of the stylists chosen does not exist.");
      }
    }
  }

  // What else they may do: the owner's choice, else what they already had; plus the role defaults
  let permissions: Permissions = NO_PERMISSIONS;
  let caps: Capability[] = [];
  if (grant.role === "stylist") {
    const record = (await db.doc(`users/${uid}`).get()).data();
    permissions =
      grant.permissions !== undefined
        ? normalisePermissions(grant.permissions)
        : record?.stylistId === grant.stylistId
          ? normalisePermissions(record?.permissions)
          : NO_PERMISSIONS;
    caps = effectiveCapabilities(await stylistDefaults(db), permissions);
  }

  if (current === "owner" && grant.role !== "owner") {
    if (options.actingUid === uid) {
      throw new RoleError("self-demotion", "You cannot remove your own owner access.");
    }
    const owners = await ownerUids(db);
    if (owners.filter((o) => o !== uid).length === 0) {
      throw new RoleError("last-owner", "That is the last owner; add another first.");
    }
  }
  await auth.setCustomUserClaims(uid, claimsFor(grant, access, caps));
  await db.doc(`users/${uid}`).set({
    role: grant.role,
    ...(grant.stylistId ? { stylistId: grant.stylistId } : {}),
    ...(grant.role === "stylist" ? { clientAccess: access, permissions, effectiveCaps: caps } : {}),
    ...(user.email ? { email: user.email } : {}),
    grantedAt: new Date().toISOString(),
  });
};

/**
 * Take every role away from `uid` (claims, document) and sign them out
 * everywhere. Same last-owner protection as grantRole.
 */
export const revokeRole = async (
  auth: Auth,
  db: Firestore,
  uid: string,
  options: { actingUid?: string } = {},
): Promise<void> => {
  const user = await auth.getUser(uid);
  if (user.customClaims?.role === "owner") {
    if (options.actingUid === uid) {
      throw new RoleError("self-demotion", "You cannot remove your own owner access.");
    }
    const owners = await ownerUids(db);
    if (owners.filter((o) => o !== uid).length === 0) {
      throw new RoleError("last-owner", "That is the last owner; add another first.");
    }
  }
  await auth.setCustomUserClaims(uid, null);
  await db.doc(`users/${uid}`).delete();
  await auth.revokeRefreshTokens(uid);
};

const effectiveCapabilitiesOfRecord = (record: Record<string, unknown>): Capability[] =>
  normaliseDefaults(record.effectiveCaps);

/**
 * Work out one stylist's capabilities again - after the role defaults changed - and write
 * them to their token claims and their record. Nothing else about their grant changes.
 * Writing `grantedAt` is what tells their open screens to fetch the new token.
 */
export const reapplyCapabilities = async (auth: Auth, db: Firestore, uid: string): Promise<boolean> => {
  const ref = db.doc(`users/${uid}`);
  const record = (await ref.get()).data();
  if (!record || record.role !== "stylist") return false;
  const user = await auth.getUser(uid);
  const caps = effectiveCapabilities(await stylistDefaults(db), normalisePermissions(record.permissions));
  const { caps: _old, ...rest } = (user.customClaims ?? {}) as Record<string, unknown>;
  void _old;
  const same = JSON.stringify(capabilitiesFromClaims(user.customClaims ?? {})) === JSON.stringify(caps);
  if (same && JSON.stringify(effectiveCapabilitiesOfRecord(record)) === JSON.stringify(caps)) return false;
  await auth.setCustomUserClaims(uid, { ...rest, ...claimsForCapabilities(caps) });
  await ref.update({ effectiveCaps: caps, grantedAt: new Date().toISOString() });
  return true;
};

/** Set what every stylist can do, and bring every stylist's claims in line. Returns how many changed. */
export const setStylistDefaults = async (auth: Auth, db: Firestore, raw: unknown): Promise<number> => {
  const defaults = normaliseDefaults(raw);
  await db.doc(DEFAULTS_PATH).set({ stylistDefaults: defaults, updatedAt: new Date().toISOString() });
  const stylists = await db.collection("users").where("role", "==", "stylist").get();
  let changed = 0;
  for (const d of stylists.docs) if (await reapplyCapabilities(auth, db, d.id)) changed += 1;
  return changed;
};

export interface RoleCheck {
  ok: boolean;
  problems: string[];
  claims: Record<string, unknown>;
  record: Record<string, unknown> | null;
}

/**
 * Does `uid` have a role, and do the claim and the record agree? Run this on the
 * owner's account BEFORE deploying the rules - it is the lock-out check.
 */
export const verifyRole = async (
  auth: Auth,
  db: Firestore,
  uid: string,
  expect?: RoleGrant,
): Promise<RoleCheck> => {
  const user = await auth.getUser(uid);
  const claims = (user.customClaims ?? {}) as Record<string, unknown>;
  const snap = await db.doc(`users/${uid}`).get();
  const record = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  const problems: string[] = [];
  if (claims.role !== "owner" && claims.role !== "stylist") {
    problems.push("The Auth user has no role claim.");
  }
  if (!record) problems.push("There is no users/{uid} record.");
  else if (record.role !== claims.role) {
    problems.push(`Claim role (${String(claims.role)}) and record role (${String(record.role)}) differ.`);
  }
  if (claims.role === "stylist" && !claims.stylistId) {
    problems.push("A stylist claim needs a stylistId.");
  }
  if (record && claims.stylistId !== record.stylistId) {
    problems.push("Claim and record stylistId differ.");
  }
  if (record && claims.role === "stylist") {
    const fromClaims = accessFromClaims(claims, String(claims.stylistId ?? ""));
    const fromRecord = normaliseAccess(record.clientAccess, String(record.stylistId ?? ""));
    if (JSON.stringify(fromClaims) !== JSON.stringify(fromRecord)) {
      problems.push("Claim and record client access differ.");
    }
  }
  if (record && claims.role === "stylist") {
    const fromClaims = capabilitiesFromClaims(claims);
    const fromRecord = effectiveCapabilitiesOfRecord(record);
    if (JSON.stringify(fromClaims) !== JSON.stringify(fromRecord)) {
      problems.push("Claim and record permissions differ.");
    }
  }
  if (expect && claims.role !== expect.role) {
    problems.push(`Expected role ${expect.role}.`);
  }
  if (user.disabled) problems.push("The account is disabled.");
  return { ok: problems.length === 0, problems, claims, record };
};
