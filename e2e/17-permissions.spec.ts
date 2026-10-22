// e2e/17-permissions.spec.ts
// What a stylist may do beyond the day-to-day (FR-026, DEC-052) through the real UI against the
// Firebase emulators (Auth + Firestore + Functions): the owner grants a permission to every
// stylist or to one, a stylist with "edit message wording" gets the Messages page and can save
// wording, one without it gets nothing, and a change reaches an open screen without signing out.
// Fake people only. TC-139 .. TC-141.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import { BASE_URL, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1800 } });
test.describe.configure({ mode: "serial" });

const PASSWORD = "E2e-stylist-pass-5";
const STEVE = "steve@suahair.test";
const YUTO = "yuto@suahair.test";

async function login(email: string): Promise<void> {
  await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
}

const userOf = async (email: string) => (await readCollection("users")).find((u) => u.email === email);

async function ownerAdds(page: Page, email: string, stylistId: string): Promise<string> {
  await page.getByTestId("team-add-email").fill(email);
  await page.getByTestId("team-add-stylist").selectOption(stylistId);
  await page.getByTestId("team-add-submit").click();
  await expect(page.getByText("Stylist access given.").last()).toBeVisible();
  await expect.poll(async () => (await userOf(email))?.id).toBeTruthy();
  return (await userOf(email))!.id;
}

async function stylistSignsIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1300, height: 1800 } });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/stylist\//);
  return page;
}

const messagesLink = (page: Page) => page.getByRole("link", { name: "Messages" });

test.beforeEach(async () => {
  await seedEmulator();
  await login(STEVE);
  await login(YUTO);
});

test("TC-139 every stylist can edit message wording once the owner allows it", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  await expect(owner.getByTestId("team-defaults")).toBeVisible();
  await expect(owner.getByTestId("team-defaults-cap-editMessages")).not.toBeChecked();
  await expect(owner.getByTestId("team-defaults-save")).toBeDisabled();
  await ownerAdds(owner, STEVE, "steve");

  // before: no link, and the page itself refuses
  const steve = await stylistSignsIn(browser, STEVE);
  await expect(messagesLink(steve)).toHaveCount(0);
  await steve.goto("/stylist/messages");
  await expect(steve.getByTestId("messages-no-permission")).toBeVisible();

  // the owner allows every stylist; Steve's open screen follows without signing out
  await owner.getByTestId("team-defaults-cap-editMessages").check();
  await owner.getByTestId("team-defaults-save").click();
  await expect(owner.getByText("Saved. Every stylist's screens update in a moment.")).toBeVisible();
  await expect.poll(async () => (await readCollection("privateSettings")).find((d) => d.id === "permissions")?.stylistDefaults).toEqual(["editMessages"]);
  await expect(steve.getByTestId("email-settings")).toBeVisible({ timeout: 30_000 });
  await expect(steve.getByTestId("sms-settings")).toBeVisible();

  // and he can change the wording, which is saved for everyone
  await steve.getByTestId("sms-template-confirmed").fill("Booked, {name}! {date} at {time}. {salon}");
  await steve.getByTestId("sms-save").click();
  await expect(steve.getByText("Text message settings saved.")).toBeVisible();
  await expect.poll(async () => ((await readCollection("privateSettings")).find((d) => d.id === "sms")?.templates as Record<string, string> | undefined)?.confirmed).toBe(
    "Booked, {name}! {date} at {time}. {salon}",
  );
  await steve.getByTestId("email-toggle-received").click();
  await steve.getByTestId("email-headline-received").fill("We've got your request, {name}");
  await steve.getByTestId("email-save").click();
  await expect(steve.getByText("Email settings saved.")).toBeVisible();

  // from the schedule page the link is there
  await steve.goto("/stylist/schedule");
  await expect(messagesLink(steve)).toBeVisible();
  await steve.context().close();
  await owner.context().close();
});

test("TC-140 one stylist can be allowed, or stopped, on their own", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  const steveUid = await ownerAdds(owner, STEVE, "steve");
  const yutoUid = await ownerAdds(owner, YUTO, "yuto");

  // only Steve is allowed: the tick differs from the (empty) default
  await owner.getByTestId(`team-${steveUid}-cap-editMessages`).check();
  await expect(owner.getByTestId(`team-row-${steveUid}`)).toContainText("differs from every stylist");
  await owner.getByTestId(`team-save-${steveUid}`).click();
  await expect(owner.getByText("Saved. Their screens update in a moment.").last()).toBeVisible();
  await expect.poll(async () => (await userOf(STEVE))?.effectiveCaps).toEqual(["editMessages"]);
  expect((await userOf(STEVE))?.permissions).toEqual({ grant: ["editMessages"], deny: [] });
  expect((await userOf(YUTO))?.effectiveCaps).toEqual([]);

  const steve = await stylistSignsIn(browser, STEVE);
  const yuto = await stylistSignsIn(browser, YUTO);
  await expect(messagesLink(steve)).toBeVisible();
  await expect(messagesLink(yuto)).toHaveCount(0);
  await yuto.goto("/stylist/messages");
  await expect(yuto.getByTestId("messages-no-permission")).toBeVisible();

  // now everyone is allowed, but Yuto is stopped
  await owner.getByTestId("team-defaults-cap-editMessages").check();
  await owner.getByTestId("team-defaults-save").click();
  await expect(owner.getByText("Saved. Every stylist's screens update in a moment.")).toBeVisible();
  await expect.poll(async () => (await userOf(YUTO))?.effectiveCaps).toEqual(["editMessages"]);
  await owner.getByTestId(`team-${yutoUid}-cap-editMessages`).uncheck();
  await expect(owner.getByTestId(`team-row-${yutoUid}`)).toContainText("differs from every stylist");
  await owner.getByTestId(`team-save-${yutoUid}`).click();
  await expect.poll(async () => (await userOf(YUTO))?.effectiveCaps).toEqual([]);
  expect((await userOf(YUTO))?.permissions).toEqual({ grant: [], deny: ["editMessages"] });
  expect((await userOf(STEVE))?.effectiveCaps).toEqual(["editMessages"]);
  await yuto.reload();
  await yuto.goto("/stylist/messages");
  await expect(yuto.getByTestId("messages-no-permission")).toBeVisible();
  await steve.goto("/stylist/messages");
  await expect(steve.getByTestId("sms-settings")).toBeVisible();
  await steve.context().close();
  await yuto.context().close();
  await owner.context().close();
});

test("TC-141 taking a permission away reaches an open screen without signing out", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  await ownerAdds(owner, STEVE, "steve");
  await owner.getByTestId("team-defaults-cap-editMessages").check();
  await owner.getByTestId("team-defaults-save").click();
  await expect(owner.getByText("Saved. Every stylist's screens update in a moment.")).toBeVisible();

  const steve = await stylistSignsIn(browser, STEVE);
  await expect(messagesLink(steve)).toBeVisible({ timeout: 30_000 });

  await owner.getByTestId("team-defaults-cap-editMessages").uncheck();
  await owner.getByTestId("team-defaults-save").click();
  await expect(owner.getByText("Saved. Every stylist's screens update in a moment.").last()).toBeVisible();
  await expect(messagesLink(steve)).toHaveCount(0, { timeout: 30_000 });
  await steve.goto("/stylist/messages");
  await expect(steve.getByTestId("messages-no-permission")).toBeVisible();
  expect((await userOf(STEVE))?.effectiveCaps).toEqual([]);
  await steve.context().close();
  await owner.context().close();
});
