// e2e/19-client-records.spec.ts
// Colour formulas and patch tests (FR-031, DEC-057) through the real UI against the Firebase
// emulators (Auth + Firestore): the owner records a formula and a patch test, the page says
// whether the client is covered today, the last formula can be repeated, a reaction stands out
// and an old test reads as expired; a stylist with the permission can add (and delete their own),
// one without can read but not add. Fake people only. TC-147 .. TC-149.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator, setClaims } from "./seed";
import { addDaysIso, todayIso } from "./helpers";
import { BASE_URL, newAdminPage } from "./admin";
import { buildClient, clientCardOf } from "../src/lib/clients";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const PASSWORD = "E2e-stylist-pass-6";
const PHONE = "0411000777";

async function seedClient() {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const booking = {
        bookingType: "customer",
        status: "completed",
        customerName: "Rosa Record",
        customerPhone: PHONE,
        clientId: PHONE,
        stylistId: "steve",
        stylistName: "Steve Hwang",
        serviceId: "mens-cut",
        serviceName: "Men's Cut",
        servicePrice: 75,
        date: addDaysIso(todayIso(), -30),
        time: "11:00 AM",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      const client = buildClient(
        PHONE,
        [{ id: "b-rosa", ...booking }] as never,
        { tags: [], blocked: false, name: "Rosa Record", source: "online", createdAt: "2025-01-01T00:00:00.000Z" },
        todayIso(),
        new Date().toISOString(),
      );
      await db.doc(`clients/${PHONE}`).set(client);
      await db.doc(`clientCards/${PHONE}`).set(clientCardOf(client, PHONE));
    });
  } finally {
    await env.cleanup();
  }
}

/** Writes an entry straight into the emulator (rules bypassed), as if made on an earlier day. */
async function seedRecord(id: string, data: Record<string, unknown>) {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`clients/${PHONE}/records/${id}`).set({ authorUid: "someone", authorName: "Elly Lee", createdAt: new Date().toISOString(), ...data });
    });
  } finally {
    await env.cleanup();
  }
}

const records = async () => await readCollection(`clients/${PHONE}/records`);

async function stylistPage(browser: Browser, email: string, caps: { code: string; cap: string }[] = []): Promise<Page> {
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const uid = ((await res.json()) as { localId: string }).localId;
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${uid}`).set({ role: "stylist", stylistId: "steve", email, effectiveCaps: caps.map((c) => c.cap) });
    });
  } finally {
    await env.cleanup();
  }
  await setClaims(uid, { role: "stylist", stylistId: "steve", ...(caps.length > 0 ? { caps: caps.map((c) => c.code) } : {}) } as unknown as Record<string, string>);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1300, height: 1500 } });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/stylist\//);
  return page;
}

test.beforeEach(async () => {
  await seedEmulator();
  await seedClient();
});

test("TC-147 the owner records a formula and a patch test; the page says the client is covered, and the formula can be repeated", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto(`/admin/clients/${PHONE}`);
  const section = page.getByTestId("client-records");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("patch-status")).toHaveAttribute("data-state", "none");
  await expect(section).toContainText("Nothing recorded yet");

  // a formula needs some text
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("record-problem")).toContainText("Write the formula");
  await section.getByTestId("record-text").fill("Roots 6.1 + 20vol 1:1.5, 35 min");
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("last-formula")).toContainText("Roots 6.1 + 20vol 1:1.5, 35 min");
  await expect(section.getByTestId("record")).toHaveCount(1);

  // a patch test needs the product and the result
  await section.getByTestId("record-kind-patch").check();
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("record-problem")).toContainText("product");
  await section.getByTestId("record-product").fill("Brand X permanent");
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("record-problem")).toContainText("skin");
  await section.getByTestId("record-result-clear").check();
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("patch-status")).toHaveAttribute("data-state", "clear");
  await expect(section.getByTestId("patch-status")).toContainText("Brand X permanent");
  await expect(section.getByTestId("record")).toHaveCount(2);
  await expect.poll(async () => (await records()).length).toBe(2);

  // repeat the last formula: the form is filled from it
  await section.getByTestId("record-kind-formula").check();
  await expect(section.getByTestId("record-text")).toHaveValue("");
  await section.getByTestId("formula-repeat").click();
  await expect(section.getByTestId("record-text")).toHaveValue("Roots 6.1 + 20vol 1:1.5, 35 min");
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("record").filter({ hasText: "Colour formula" })).toHaveCount(2);

  // the owner can delete an entry
  await section.getByTestId("record").first().getByTestId("record-delete").click();
  await expect(section.getByTestId("record")).toHaveCount(2);
  await page.context().close();
});

test("TC-148 a reaction stands out until a later clear test; an old clear test reads as expired", async ({ browser }) => {
  await seedRecord("old-clear", { kind: "patch", date: addDaysIso(todayIso(), -300), text: "", product: "Brand X permanent", result: "clear" });
  const { page } = await newAdminPage(browser);
  await page.goto(`/admin/clients/${PHONE}`);
  const status = page.getByTestId("patch-status");
  await expect(status).toHaveAttribute("data-state", "expired");
  await expect(status).toContainText("Test again before colour");

  await seedRecord("reaction", { kind: "patch", date: addDaysIso(todayIso(), -20), text: "Red and itchy", product: "Brand Y gloss", result: "reaction" });
  await page.reload();
  await expect(status).toHaveAttribute("data-state", "reaction");
  await expect(status).toContainText("Reacted to Brand Y gloss");
  await expect(status).toContainText("Do not use it");

  // a later clear test (of another product) takes over
  const section = page.getByTestId("client-records");
  await section.getByTestId("record-kind-patch").check();
  await section.getByTestId("record-product").fill("Brand Z demi");
  await section.getByTestId("record-result-clear").check();
  await section.getByTestId("record-save").click();
  await expect(status).toHaveAttribute("data-state", "clear");
  await page.context().close();
});

test("TC-149 a stylist with the permission adds and deletes their own entries; without it they can read but not add", async ({ browser }) => {
  await seedRecord("from-elly", { kind: "formula", date: addDaysIso(todayIso(), -40), text: "Lengths 7.0 + 9vol", product: "", result: "" });

  const plain = await stylistPage(browser, "plain@suahair.test");
  await plain.goto(`/stylist/clients/${PHONE}`);
  const readOnly = plain.getByTestId("client-records");
  await expect(readOnly).toBeVisible();
  await expect(readOnly).toContainText("Lengths 7.0 + 9vol");
  await expect(readOnly.getByTestId("record-save")).toHaveCount(0);
  await expect(readOnly.getByTestId("formula-repeat")).toHaveCount(0);
  await expect(readOnly.getByTestId("record-delete")).toHaveCount(0);
  await plain.context().close();

  const steve = await stylistPage(browser, "recorder@suahair.test", [{ code: "records", cap: "editClientRecords" }]);
  await steve.goto(`/stylist/clients/${PHONE}`);
  const section = steve.getByTestId("client-records");
  await section.getByTestId("record-text").fill("Toner 9.1 + 9.3, 10 min");
  await section.getByTestId("record-save").click();
  await expect(section.getByTestId("record")).toHaveCount(2);
  await expect.poll(async () => (await records()).filter((r) => r.authorName !== "Elly Lee").length).toBe(1);
  // they delete their own, not Elly's
  await expect(section.getByTestId("record-delete")).toHaveCount(1);
  await section.getByTestId("record-delete").click();
  await expect(section.getByTestId("record")).toHaveCount(1);
  await expect(section).toContainText("Lengths 7.0 + 9vol");
  await steve.context().close();
});
