// tests/storage/storageRules.test.ts
// storage.rules: the owner's pictures (site-images/) are public to read and owner-only to
// write, small JPEG/PNG/WebP only; customers' photos (client-photos/) are closed for now;
// everything else is denied. Run via `npm run test:storage` (Storage emulator).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sua-hair-rules-test",
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(async () => { await env?.cleanup(); });

const owner = () => env.authenticatedContext("owner-uid", { role: "owner" }).storage();
const stylist = () => env.authenticatedContext("s-uid", { role: "stylist", stylistId: "s1" }).storage();
const nobody = () => env.authenticatedContext("n-uid").storage();
const anon = () => env.unauthenticatedContext().storage();

const bytes = (n: number) => new Uint8Array(n).fill(1);
const png = { contentType: "image/png" };

describe("site-images/", () => {
  it("the owner can upload a small image and anyone can read it", async () => {
    await assertSucceeds(uploadBytes(ref(owner(), "site-images/cut.png"), bytes(1000), png));
    await assertSucceeds(getBytes(ref(anon(), "site-images/cut.png")));
  });
  it("nobody but the owner can write or delete", async () => {
    for (const s of [anon(), nobody(), stylist()]) {
      await assertFails(uploadBytes(ref(s, "site-images/x.png"), bytes(10), png));
      await assertFails(deleteObject(ref(s, "site-images/cut.png")));
    }
  });
  it("refuses a file over 2 MB and a type that is not JPEG, PNG or WebP", async () => {
    await assertFails(uploadBytes(ref(owner(), "site-images/big.png"), bytes(2 * 1024 * 1024 + 1), png));
    await assertFails(uploadBytes(ref(owner(), "site-images/x.svg"), bytes(10), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(owner(), "site-images/x.html"), bytes(10), { contentType: "text/html" }));
    await assertSucceeds(uploadBytes(ref(owner(), "site-images/ok.webp"), bytes(10), { contentType: "image/webp" }));
  });
  it("the owner can delete", async () => {
    await assertSucceeds(deleteObject(ref(owner(), "site-images/cut.png")));
  });
});

describe("everything else is closed", () => {
  it("client-photos/ cannot be read or written by anyone, even the owner, until that phase exists", async () => {
    for (const s of [anon(), nobody(), stylist(), owner()]) {
      await assertFails(uploadBytes(ref(s, "client-photos/b1/a.png"), bytes(10), png));
      await assertFails(getBytes(ref(s, "client-photos/b1/a.png")));
    }
  });
  it("any other path is denied", async () => {
    await assertFails(uploadBytes(ref(owner(), "elsewhere/a.png"), bytes(10), png));
    await assertFails(getBytes(ref(anon(), "elsewhere/a.png")));
  });
});
