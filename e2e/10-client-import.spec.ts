// e2e/10-client-import.spec.ts
// The owner-only client-list import (Manage -> Import clients), through the real
// UI against the Firebase emulators. Synthetic fixtures only (fake people, see
// tests/fixtures/make-clients-fixture.py): upload a .csv or .xlsx, dry run
// counts, confirm, imported clients are recognised as returning clients in the
// walk-in form, importing again adds nobody, rollback removes them, and a
// stylist account never sees the section. TC-078 .. TC-084.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator, setClaims } from "./seed";
import { BASE_URL, dialog, newAdminPage, openNewBooking } from "./admin";
import { submitDetails, toDetailsStep, upcoming } from "./helpers";

test.use({ viewport: { width: 1400, height: 1400 } });

const CSV = "tests/fixtures/clients-synthetic.csv";
const XLSX = "tests/fixtures/clients-synthetic.xlsx";
const lookups = async () => await readCollection("customerLookups");
const phones = async () => (await lookups()).map((l) => l.id).sort();

test.beforeEach(async () => {
  await seedEmulator();
  // one client already has a record with visit history: the import must leave them alone
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("customerLookups/0400000009").set({ name: "Existing Client", lastVisit: "2026-09-01", visitCount: 5 });
  });
  await env.cleanup();
});

async function openImport(page: Page) {
  await page.goto("/admin/manage");
  await expect(page.getByTestId("client-import")).toBeVisible();
}

async function dryRunWith(page: Page, file: string) {
  await page.getByTestId("client-import-file").setInputFiles(file);
  await expect(page.getByTestId("client-import-dryrun")).toBeVisible();
}

const count = (page: Page, key: string) => page.getByTestId(`dryrun-${key}`);

test("TC-078 the owner sees Import clients in Manage; a stylist account does not", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await expect(page.getByRole("heading", { name: "Import clients" })).toBeVisible();
  await page.context().close();

  // a stylist account: signed in, role "stylist"
  const signUp = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "stylist@suahair.test", password: "E2e-stylist-pass-1", returnSecureToken: true }),
  });
  const uid = ((await signUp.json()) as { localId: string }).localId;
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${uid}`).set({ role: "stylist", stylistId: "steve" });
  });
  await env.cleanup();
  await setClaims(uid, { role: "stylist", stylistId: "steve" });

  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1400, height: 1400 } });
  const stylist = await context.newPage();
  await stylist.goto("/admin/login");
  await stylist.getByPlaceholder("admin@suahair.com.au").fill("stylist@suahair.test");
  await stylist.getByPlaceholder("••••••••").fill("E2e-stylist-pass-1");
  await stylist.locator('button[type="submit"]').click();
  await stylist.waitForURL(/\/stylist\//); // stylist accounts get their own area
  await stylist.goto("/admin/manage");
  await expect(stylist).toHaveURL(/\/stylist\//); // the admin Manage page sends them back to their own area
  await expect(stylist.getByText("Import clients")).toHaveCount(0);
  await expect(stylist.getByTestId("client-import")).toHaveCount(0);
  await expect(stylist.getByTestId("client-import-file")).toHaveCount(0);
  await context.close();
});

test("TC-079 the dry run reports counts and the error report has row numbers only", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await expect(count(page, "rows")).toHaveText("14");
  await expect(count(page, "new")).toHaveText("8"); // 9 distinct numbers, one already has a record
  await expect(count(page, "exist")).toHaveText("1");
  await expect(count(page, "skipped")).toHaveText("4");
  await expect(count(page, "merged")).toHaveText("1");
  await expect(page.getByTestId("client-import-dryrun")).toContainText("1 emails");
  // blocked clients are no longer "left out" (DEC-039): they are counted, with a warning
  await expect(count(page, "blocked")).toHaveText("1");
  await expect(page.getByTestId("dryrun-blocked-warning")).toContainText("1 blocked client in this file");
  await expect(page.getByTestId("dryrun-blocked-warning")).toContainText("imported as BLOCKED");
  await expect(page.getByTestId("client-import-dryrun")).not.toContainText("blocked clients (nothing");
  await expect(page.getByTestId("client-import-dryrun")).toContainText(/nothing has been written yet/i);
  expect(await phones()).toEqual(["0400000009"]); // a dry run writes nothing

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download error report" }).click();
  const file = await (await download).path();
  const report = readFileSync(file!, "utf8");
  expect(report.trim().split(/\r?\n/)).toEqual([
    "row,reason",
    "9,No mobile number",
    "10,Not an Australian mobile number",
    "11,No name",
    "13,Not an Australian mobile number",
  ]);
  expect(report).not.toMatch(/Overseas|Landline|0400|7700/); // no names or numbers
  await page.context().close();
});

test("TC-080 confirming imports the clients as name + phone only; an existing client is untouched", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toContainText("Imported 8 clients");

  expect(await phones()).toEqual(
    ["0400000001", "0400000002", "0400000003", "0400000004", "0400000005", "0400000006", "0400000008", "0400000009", "0400000010"],
  );
  const by = Object.fromEntries((await lookups()).map((l) => [l.id, l]));
  // exactly the three public-rule fields, nothing from the ignored columns
  expect(by["0400000001"]).toEqual({ id: "0400000001", name: "Test Client 1", lastVisit: "", visitCount: 0 });
  expect(JSON.stringify(by["0400000004"])).not.toMatch(/example\.test|Female|Test reason|staff alert/i);
  expect(by["0400000005"].name).toBe("Shared Newer"); // the later-added of two sharing a number
  expect(by["0400000006"].name).toBe("Test Split"); // first + last when Full Name is empty
  expect(by["0400000008"].name).toBe("Test Ünïcöde Client"); // spaces collapsed, any script kept
  expect(by["0400000009"]).toEqual({ id: "0400000009", name: "Existing Client", lastVisit: "2026-09-01", visitCount: 5 });
  // the one client Fresha has Blocked is imported as blocked (and only that field is extra)
  expect(by["0400000004"]).toEqual({ id: "0400000004", name: "Test Client 4", lastVisit: "", visitCount: 0, blocked: true });
  await expect(page.getByTestId("client-import-batch")).toContainText("8 clients added, 1 marked blocked");
  await page.context().close();
});

test("TC-081 an imported client is recognised as a returning client in the walk-in form", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toBeVisible();

  await page.goto("/admin/today");
  await openNewBooking(page);
  const d = dialog(page);
  await d.getByRole("button", { name: "Walk-in", exact: true }).click();
  await d.getByPlaceholder("e.g. 0412 345 678").fill("0400 000 001");
  await expect(d.getByRole("status")).toHaveText("Returning client"); // not labelled "imported"
  await expect(d.getByPlaceholder("e.g. Jane Smith")).toHaveValue("Test Client 1");
  // a client with real visits shows their count
  await d.getByPlaceholder("e.g. 0412 345 678").fill("0400 000 009");
  await expect(d.getByRole("status")).toContainText("Returning client · 5 visits");
  await page.context().close();
});

test("TC-082 importing the same file again, as csv or xlsx, adds nobody", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  const before = await lookups();

  await dryRunWith(page, XLSX); // the same people, as an xlsx
  await expect(count(page, "rows")).toHaveText("14");
  await expect(count(page, "new")).toHaveText("0");
  await expect(count(page, "exist")).toHaveText("9");
  await expect(page.getByRole("button", { name: /^Import 0 clients/ })).toBeDisabled();
  expect(await lookups()).toEqual(before);
  await page.context().close();
});

test("TC-083 the xlsx gives the same dry run as the csv", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, XLSX);
  await expect(count(page, "rows")).toHaveText("14");
  await expect(count(page, "new")).toHaveText("8");
  await expect(count(page, "exist")).toHaveText("1");
  await expect(count(page, "skipped")).toHaveText("4");
  await expect(count(page, "merged")).toHaveText("1");
  await page.context().close();
});

test("TC-084 rolling back removes only what that import created", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toBeVisible();
  expect((await phones()).length).toBe(9);

  await page.getByRole("button", { name: "Roll back" }).click();
  await expect(page.getByText("Remove the clients this import added?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, roll back" }).click();
  await expect(page.getByTestId("client-import-batch")).toContainText("rolled back (8 removed)");
  expect(await phones()).toEqual(["0400000009"]); // the existing client stays
  expect((await lookups())[0]).toMatchObject({ name: "Existing Client", visitCount: 5 });
  await expect(page.getByRole("button", { name: "Roll back" })).toHaveCount(0);
  // the ledger keeps no phone numbers afterwards
  const chunks = (await readCollection("importBatches")).length;
  expect(chunks).toBe(1);
  await page.context().close();
});

test("TC-085 a wrong file is refused with a message, nothing is written", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await page.getByTestId("client-import-file").setInputFiles({ name: "other.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Phone\nA,0400000001\n") });
  await expect(page.getByText(/doesn't look like a client list: missing Full Name and Mobile Number/)).toBeVisible();
  await expect(page.getByTestId("client-import-dryrun")).toHaveCount(0);
  expect(await phones()).toEqual(["0400000009"]);
  await page.context().close();
});

test("TC-095 a client Fresha has blocked cannot book online; rolling the import back lets them book again", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toContainText("1 marked blocked");

  // the blocked client (0400 000 004) tries to book online
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1200, height: 1000 } });
  const customer = await context.newPage();
  const day = upcoming(3, 4);
  const who = { services: ["Men's Cut"], stylist: "Steve", date: day, time: "11:00 AM", phone: "0400 000 004", name: "Test Client" };
  await toDetailsStep(customer, who);
  await submitDetails(customer, who);
  await expect(customer.getByText("Please call the salon to book")).toBeVisible();
  expect(await readCollection("bookings")).toHaveLength(0);
  // an ordinary imported client (not blocked) can
  await toDetailsStep(customer, { ...who, phone: "0400 000 001" });
  await submitDetails(customer, { ...who, phone: "0400 000 001", name: "Test Client" });
  await expect(customer.getByRole("heading", { name: /Request received/ })).toBeVisible();

  // rolling the import back removes the blocked flag it set (the created record goes entirely)
  await page.getByRole("button", { name: "Roll back" }).click();
  await page.getByRole("button", { name: "Yes, roll back" }).click();
  await expect(page.getByTestId("client-import-batch")).toContainText("rolled back");
  expect((await lookups()).find((l) => l.id === "0400000004")).toBeUndefined();
  // (the ordinary client's request holds 11:00, so the formerly blocked client takes 1:00 PM)
  const again = { ...who, time: "1:00 PM" };
  await toDetailsStep(customer, again);
  await submitDetails(customer, again);
  await expect(customer.getByRole("heading", { name: /Request received/ })).toBeVisible();
  await context.close();
  await page.context().close();
});

test("TC-096 the walk-in form warns about a blocked client instead of calling them a returning client", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openImport(page);
  await dryRunWith(page, CSV);
  await page.getByRole("button", { name: "Import 8 clients" }).click();
  await expect(page.getByTestId("client-import-done")).toBeVisible();

  await page.goto("/admin/today");
  await openNewBooking(page);
  const d = dialog(page);
  await d.getByRole("button", { name: "Walk-in", exact: true }).click();
  await d.getByPlaceholder("e.g. 0412 345 678").fill("0400 000 004");
  await expect(d.getByTestId("blocked-client-warning")).toContainText("BLOCKED CLIENT");
  await expect(d.getByText("Returning client")).toHaveCount(0);
  // a blocked client's name is not filled in as if they were an ordinary returning client
  await expect(d.getByPlaceholder("e.g. Jane Smith")).toHaveValue("");
  await page.context().close();
});
