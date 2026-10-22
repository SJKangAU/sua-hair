// tests/functions/guards.test.ts
// Who a callable lets in (FR-026, DEC-052): the owner always; a stylist only for what the owner
// has granted them, read from their users/{uid} record so that taking it away works at once
// (not when their sign-in token next refreshes). Against the Firestore emulator.
import { beforeEach, describe, expect, it } from "vitest";
import { requireCapability, requireOwner } from "../../functions/src/guards";
import { adminDb, resetEmulators } from "./adminEnv";

const db = adminDb();
const as = (uid: string) => ({ auth: { uid, token: {} as never } });

const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    // an HttpsError (firebase-functions is not importable from here): it carries a code
    return (err as { code: string }).code;
  }
  throw new Error("expected a refusal");
};

beforeEach(async () => {
  await resetEmulators();
  await db.doc("users/owner").set({ role: "owner" });
  await db.doc("users/editor").set({ role: "stylist", stylistId: "steve", effectiveCaps: ["editMessages"] });
  await db.doc("users/plain").set({ role: "stylist", stylistId: "yuto", effectiveCaps: [] });
  await db.doc("users/other").set({ role: "stylist", stylistId: "elly", effectiveCaps: ["sendWinBack"] });
});

describe("requireCapability", () => {
  it("lets the owner do anything", async () => {
    await expect(requireCapability(db, as("owner"), "editMessages")).resolves.toMatchObject({ role: "owner" });
    await expect(requireCapability(db, as("owner"), "approveTimeOff")).resolves.toMatchObject({ role: "owner" });
  });

  it("lets a stylist do only what they hold", async () => {
    await expect(requireCapability(db, as("editor"), "editMessages")).resolves.toMatchObject({ role: "stylist", stylistId: "steve" });
    expect(await codeOf(requireCapability(db, as("editor"), "sendWinBack", "send win-back messages"))).toBe("permission-denied");
    expect(await codeOf(requireCapability(db, as("plain"), "editMessages"))).toBe("permission-denied");
    expect(await codeOf(requireCapability(db, as("other"), "editMessages"))).toBe("permission-denied");
  });

  it("says what they cannot do, in words", async () => {
    try {
      await requireCapability(db, as("plain"), "editMessages", "send a test text");
    } catch (err) {
      expect((err as Error).message).toBe("You do not have permission to send a test text.");
    }
  });

  it("refuses someone signed out, someone with no role record, and a record with a malformed list", async () => {
    expect(await codeOf(requireCapability(db, { auth: undefined }, "editMessages"))).toBe("unauthenticated");
    expect(await codeOf(requireCapability(db, as("nobody"), "editMessages"))).toBe("permission-denied");
    await db.doc("users/odd").set({ role: "stylist", stylistId: "harry", effectiveCaps: "editMessages" });
    expect(await codeOf(requireCapability(db, as("odd"), "editMessages"))).toBe("permission-denied");
  });

  it("is read from the record, so taking it away works at once", async () => {
    await expect(requireCapability(db, as("editor"), "editMessages")).resolves.toBeDefined();
    await db.doc("users/editor").update({ effectiveCaps: [] }); // the token would still carry it for up to an hour
    expect(await codeOf(requireCapability(db, as("editor"), "editMessages"))).toBe("permission-denied");
  });

  it("requireOwner is still only the owner", async () => {
    expect(await codeOf(requireOwner(db, as("editor"), "do that"))).toBe("permission-denied");
    await expect(requireOwner(db, as("owner"), "do that")).resolves.toBeDefined();
  });
});
