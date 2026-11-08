// e2e/24-manage-reaches-public.spec.ts
// A service edited in Manage must show on the public booking page: the new price
// and duration, both on a page that is already open and after a reload in the
// same browser session (the page used to keep a per-session copy forever).
// Runs against the Firestore + Auth emulators.
import { expect, test, type Page } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import { BASE_URL, newAdminPage } from "./admin";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1300, height: 1400 } });

let admin: Page;
let customer: Page;

test.beforeAll(async ({ browser }) => {
  await seedEmulator();
  ({ page: admin } = await newAdminPage(browser));
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
  });
  customer = await ctx.newPage();
});
test.afterAll(async () => {
  await admin.context().close();
  await customer.context().close();
});

const card = (p: Page) => p.getByRole("button", { name: /Fringe Trim/ }).first();

test("the public page starts with the seeded price and duration", async () => {
  await customer.goto("/");
  await expect(card(customer)).toContainText("from $15");
  await expect(card(customer)).toContainText("15 min");
});

test("owner edits price and duration in Manage", async () => {
  await admin.goto("/admin/manage");
  // the deepest div holding both the name and its Edit button is the service's row
  const row = admin
    .locator("div")
    .filter({ has: admin.getByText("Fringe Trim", { exact: true }) })
    .filter({ has: admin.getByRole("button", { name: "Edit", exact: true }) })
    .last();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await admin.getByText("Director ($)").locator("input").fill("99");
  await admin.getByText("Senior ($)").locator("input").fill("88");
  await admin.getByText("Junior ($)").locator("input").fill("77");
  await admin.getByRole("spinbutton", { name: /minutes$/ }).first().fill("30");
  await admin.getByRole("button", { name: "Save Changes" }).click();
  await expect
    .poll(async () => (await readCollection("services")).find((s) => s.id === "fringe-trim"))
    .toMatchObject({ totalTime: 30, price: { director: 99, senior: 88, junior: 77 } });
});

test("a public page that is already open shows the new price and duration", async () => {
  await expect(card(customer)).toContainText("from $77");
  await expect(card(customer)).toContainText("30 min");
});

test("reloading in the same session shows them too", async () => {
  await customer.reload();
  await expect(card(customer)).toContainText("from $77");
  await expect(card(customer)).toContainText("30 min");
});
