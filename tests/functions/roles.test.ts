// tests/functions/roles.test.ts
// Role provisioning with the Admin SDK against the Auth + Firestore emulators:
// the owner is provisioned and VERIFIED before the new rules go live, a grant can
// be rolled back, and the last owner can never be removed. DEC-033.
import { beforeEach, describe, expect, it } from "vitest";
import {
  RoleError,
  grantRole,
  ownerUids,
  revokeRole,
  verifyRole,
} from "../../functions/src/roles";
import { adminAuth, adminDb, resetEmulators } from "./adminEnv";

const auth = adminAuth();
const db = adminDb();

const makeUser = async (email: string) =>
  (await auth.createUser({ email, password: "Test-pass-12345" })).uid;

beforeEach(async () => {
  await resetEmulators();
  await db.doc("stylists/steve").set({ name: "Steve", level: "director", status: "active" });
});

describe("granting roles", () => {
  it("an owner grant sets the claim and the users record together, and verifies", async () => {
    const uid = await makeUser("owner@example.test");
    expect((await verifyRole(auth, db, uid)).ok).toBe(false); // before: no role

    await grantRole(auth, db, uid, { role: "owner" });

    const check = await verifyRole(auth, db, uid, { role: "owner" });
    expect(check.ok).toBe(true);
    expect(check.claims).toEqual({ role: "owner" });
    expect(check.record).toMatchObject({ role: "owner", email: "owner@example.test" });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "owner" });
  });

  it("a stylist grant carries the stylistId in both places", async () => {
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve" });
    const check = await verifyRole(auth, db, uid, { role: "stylist" });
    expect(check.ok).toBe(true);
    expect(check.claims).toEqual({ role: "stylist", stylistId: "steve" });
    expect(check.record).toMatchObject({ role: "stylist", stylistId: "steve" });
  });

  it("refuses an invalid role, a stylist without an id, an owner with one and an unknown stylist", async () => {
    const uid = await makeUser("x@example.test");
    await expect(grantRole(auth, db, uid, { role: "admin" as never })).rejects.toBeInstanceOf(RoleError);
    await expect(grantRole(auth, db, uid, { role: "stylist" })).rejects.toBeInstanceOf(RoleError);
    await expect(grantRole(auth, db, uid, { role: "owner", stylistId: "steve" })).rejects.toBeInstanceOf(RoleError);
    await expect(grantRole(auth, db, uid, { role: "stylist", stylistId: "ghost" })).rejects.toMatchObject({ code: "no-stylist" });
    expect((await verifyRole(auth, db, uid)).ok).toBe(false);
  });

  it("verify reports a claim and a record that disagree", async () => {
    const uid = await makeUser("odd@example.test");
    await auth.setCustomUserClaims(uid, { role: "owner" }); // claim but no record
    const check = await verifyRole(auth, db, uid);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/no users/i);
  });
});

describe("protecting the owner role (no lock-out)", () => {
  it("the last owner cannot be demoted or revoked, even by someone else's request", async () => {
    const owner = await makeUser("owner@example.test");
    await grantRole(auth, db, owner, { role: "owner" });
    await expect(grantRole(auth, db, owner, { role: "stylist", stylistId: "steve" })).rejects.toMatchObject({ code: "last-owner" });
    await expect(revokeRole(auth, db, owner)).rejects.toMatchObject({ code: "last-owner" });
    expect(await ownerUids(db)).toEqual([owner]);
  });

  it("an owner cannot remove their own access", async () => {
    const a = await makeUser("a@example.test");
    const b = await makeUser("b@example.test");
    await grantRole(auth, db, a, { role: "owner" });
    await grantRole(auth, db, b, { role: "owner" });
    await expect(revokeRole(auth, db, a, { actingUid: a })).rejects.toMatchObject({ code: "self-demotion" });
    await expect(grantRole(auth, db, a, { role: "stylist", stylistId: "steve" }, { actingUid: a })).rejects.toMatchObject({ code: "self-demotion" });
  });

  it("with two owners one can remove the other", async () => {
    const a = await makeUser("a@example.test");
    const b = await makeUser("b@example.test");
    await grantRole(auth, db, a, { role: "owner" });
    await grantRole(auth, db, b, { role: "owner" });
    await revokeRole(auth, db, b, { actingUid: a });
    expect(await ownerUids(db)).toEqual([a]);
    expect((await auth.getUser(b)).customClaims ?? {}).toEqual({});
    expect((await db.doc(`users/${b}`).get()).exists).toBe(false);
  });
});

describe("rollback", () => {
  it("clearing the claims leaves the users record, so the previous rules (which read users/{uid}) still work", async () => {
    const uid = await makeUser("owner@example.test");
    await grantRole(auth, db, uid, { role: "owner" });
    await auth.setCustomUserClaims(uid, null); // what `provision-roles rollback` does
    expect((await auth.getUser(uid)).customClaims ?? {}).toEqual({});
    expect((await db.doc(`users/${uid}`).get()).data()).toMatchObject({ role: "owner" });
  });
});
