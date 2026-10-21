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
  setStylistDefaults,
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


describe("whose clients a stylist may open (FR-025, DEC-051)", () => {
  const seedColleagues = async () => {
    await db.doc("stylists/yuto").set({ name: "Yuto", level: "senior", status: "active" });
    await db.doc("stylists/elly").set({ name: "Elly", level: "senior", status: "active" });
  };

  it("a stylist starts with their own clients only: no extra claim, an empty record", async () => {
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve" });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve" });
    expect((await db.doc(`users/${uid}`).get()).get("clientAccess")).toEqual({ all: false, stylistIds: [] });
  });

  it("named colleagues become a claim and a record that agree, and verify", async () => {
    await seedColleagues();
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, {
      role: "stylist",
      stylistId: "steve",
      clientAccess: { all: false, stylistIds: ["yuto", "elly"] },
    });
    const check = await verifyRole(auth, db, uid, { role: "stylist" });
    expect(check.ok).toBe(true);
    expect(check.claims).toEqual({ role: "stylist", stylistId: "steve", clientStylists: ["yuto", "elly"] });
    expect(check.record).toMatchObject({ clientAccess: { all: false, stylistIds: ["yuto", "elly"] } });
  });

  it("'every client' is one flag, and the named list is dropped", async () => {
    await seedColleagues();
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: true, stylistIds: ["yuto"] } });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve", clientsAll: true });
    expect((await db.doc(`users/${uid}`).get()).get("clientAccess")).toEqual({ all: true, stylistIds: [] });
    expect((await verifyRole(auth, db, uid)).ok).toBe(true);
  });

  it("cleans the list: duplicates, the stylist's own id and malformed ids are dropped; unknown stylists are refused", async () => {
    await seedColleagues();
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, {
      role: "stylist",
      stylistId: "steve",
      clientAccess: { all: false, stylistIds: ["yuto", "yuto", "steve", "bad id!", 7 as never] },
    });
    expect((await auth.getUser(uid)).customClaims?.clientStylists).toEqual(["yuto"]);
    await expect(
      grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: ["ghost"] } }),
    ).rejects.toMatchObject({ code: "no-stylist" });
    expect((await auth.getUser(uid)).customClaims?.clientStylists).toEqual(["yuto"]); // the refusal changed nothing
  });

  it("caps the list so the claim stays small", async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `s${i}`);
    for (const id of ids) await db.doc(`stylists/${id}`).set({ name: id, level: "junior", status: "active" });
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: ids } });
    expect((await auth.getUser(uid)).customClaims?.clientStylists).toHaveLength(12);
  });

  it("re-granting the role without saying keeps what they had; changing the stylist or role resets it", async () => {
    await seedColleagues();
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: ["yuto"] } });
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve" }); // e.g. the provisioning script again
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve", clientStylists: ["yuto"] });

    await grantRole(auth, db, uid, { role: "stylist", stylistId: "elly" }); // now a different person
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "elly" });

    await grantRole(auth, db, uid, { role: "stylist", stylistId: "elly", clientAccess: { all: true, stylistIds: [] } });
    await grantRole(auth, db, uid, { role: "owner" }); // an owner needs no extra access
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "owner" });
  });

  it("an owner cannot be given extra access, and narrowing back to own clients removes the claim", async () => {
    await seedColleagues();
    const owner = await makeUser("owner@example.test");
    await expect(
      grantRole(auth, db, owner, { role: "owner", clientAccess: { all: true, stylistIds: [] } }),
    ).rejects.toBeInstanceOf(RoleError);

    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: true, stylistIds: [] } });
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: [] } });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve" });
    expect((await verifyRole(auth, db, uid)).ok).toBe(true);
  });

  it("verify catches a claim and a record that disagree about access", async () => {
    await seedColleagues();
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: ["yuto"] } });
    await auth.setCustomUserClaims(uid, { role: "stylist", stylistId: "steve", clientsAll: true }); // widened behind the record's back
    const check = await verifyRole(auth, db, uid);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/client access differ/);
  });
});


describe("what a stylist may do (FR-026, DEC-052)", () => {
  const caps = async (uid: string) => (await auth.getUser(uid)).customClaims?.caps;
  const record = async (uid: string) => (await db.doc(`users/${uid}`).get()).data()!;
  const defaultsDoc = () => db.doc("privateSettings/permissions");

  it("a stylist with nothing granted has no caps claim and an empty effective list", async () => {
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve" });
    expect(await caps(uid)).toBeUndefined();
    expect(await record(uid)).toMatchObject({ permissions: { grant: [], deny: [] }, effectiveCaps: [] });
  });

  it("an individual grant becomes a claim (short code) and a record that agree, and verifies", async () => {
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", permissions: { grant: ["editMessages", "approveTimeOff"], deny: [] } });
    expect(await caps(uid)).toEqual(["msg", "timeoff"]);
    expect(await record(uid)).toMatchObject({ effectiveCaps: ["editMessages", "approveTimeOff"] });
    expect((await verifyRole(auth, db, uid, { role: "stylist" })).ok).toBe(true);
  });

  it("the role defaults apply to a new stylist, and an individual denial beats them", async () => {
    await defaultsDoc().set({ stylistDefaults: ["editMessages", "sendWinBack"] });
    const a = await makeUser("a@example.test");
    const b = await makeUser("b@example.test");
    await db.doc("stylists/harry").set({ name: "Harry", level: "junior", status: "active" });
    await grantRole(auth, db, a, { role: "stylist", stylistId: "steve" });
    await grantRole(auth, db, b, { role: "stylist", stylistId: "harry", permissions: { grant: [], deny: ["sendWinBack"] } });
    expect(await caps(a)).toEqual(["msg", "winback"]);
    expect(await caps(b)).toEqual(["msg"]);
  });

  it("changing the role defaults re-works every stylist, keeps their overrides and tells their screens (grantedAt)", async () => {
    await db.doc("stylists/harry").set({ name: "Harry", level: "junior", status: "active" });
    const a = await makeUser("a@example.test");
    const b = await makeUser("b@example.test");
    await grantRole(auth, db, a, { role: "stylist", stylistId: "steve" });
    await grantRole(auth, db, b, { role: "stylist", stylistId: "harry", permissions: { grant: ["approveTimeOff"], deny: ["sendWinBack"] } });
    const before = (await record(b)).grantedAt;

    await new Promise((r) => setTimeout(r, 5));
    const changed = await setStylistDefaults(auth, db, ["editMessages", "sendWinBack"]);
    expect(changed).toBe(2);
    expect(await caps(a)).toEqual(["msg", "winback"]);
    expect(await caps(b)).toEqual(["msg", "timeoff"]); // the denial of win-back and the grant of time off survive
    expect((await record(b)).grantedAt > before).toBe(true);
    expect((await verifyRole(auth, db, a)).ok).toBe(true);
    expect((await verifyRole(auth, db, b)).ok).toBe(true);

    // a change that alters nothing for anyone rewrites nothing
    expect(await setStylistDefaults(auth, db, ["sendWinBack", "editMessages", "bogus"])).toBe(0);
  });

  it("re-granting the role without saying keeps their permissions; changing the stylist resets them", async () => {
    const uid = await makeUser("steve@example.test");
    await db.doc("stylists/elly").set({ name: "Elly", level: "senior", status: "active" });
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", permissions: { grant: ["editClientRecords"], deny: [] } });
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve" }); // e.g. the provisioning script again
    expect(await caps(uid)).toEqual(["records"]);
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "elly" }); // now a different person
    expect(await caps(uid)).toBeUndefined();
    await grantRole(auth, db, uid, { role: "owner" });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "owner" });
  });

  it("keeps the client access and the capabilities side by side in one claim set", async () => {
    await db.doc("stylists/yuto").set({ name: "Yuto", level: "senior", status: "active" });
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, {
      role: "stylist",
      stylistId: "steve",
      clientAccess: { all: false, stylistIds: ["yuto"] },
      permissions: { grant: ["editMessages"], deny: [] },
    });
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve", clientStylists: ["yuto"], caps: ["msg"] });
    await setStylistDefaults(auth, db, ["sendWinBack"]); // re-working capabilities leaves the access alone
    expect((await auth.getUser(uid)).customClaims).toEqual({ role: "stylist", stylistId: "steve", clientStylists: ["yuto"], caps: ["msg", "winback"] });
  });

  it("verify catches a claim and a record that disagree about permissions", async () => {
    const uid = await makeUser("steve@example.test");
    await grantRole(auth, db, uid, { role: "stylist", stylistId: "steve", permissions: { grant: ["editMessages"], deny: [] } });
    await auth.setCustomUserClaims(uid, { role: "stylist", stylistId: "steve", caps: ["msg", "winback", "timeoff"] }); // widened behind the record's back
    const check = await verifyRole(auth, db, uid);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/permissions differ/);
  });
});
