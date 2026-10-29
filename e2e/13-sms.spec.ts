// e2e/13-sms.spec.ts
// Text messages (FR-024, DEC-050) through the real UI against the Firebase
// emulators (Auth + Firestore + Functions): the owner's Manage -> Text messages
// section (switch, sender name, wording with live preview and length counter, reset,
// validation), the saved settings, the real booking trigger turning a walk-in into
// a text (written to smsOutbox, never to a phone), the owner's wording being what is
// sent, texts staying off until switched on, a client taken off the list, and the
// test text. Fake people only. TC-111 .. TC-115.
import { expect, test, type Page } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import { upcoming } from "./helpers";
import { fillWalkin, gotoToday, newAdminPage, openNewBooking, submitWalkin } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const DAY = upcoming(3); // a Wednesday, at least 3 days out

test.beforeEach(async () => {
  await seedEmulator();
});

const outbox = async () => await readCollection("smsOutbox");
const settingsDoc = async () => (await readCollection("privateSettings")).find((d) => d.id === "sms");

async function openSms(page: Page) {
  await page.goto("/admin/manage?section=messages");
  await expect(page.getByTestId("sms-settings")).toBeVisible();
  // the saved settings have loaded once the checkbox is usable
  await expect(page.locator("#sms-enabled")).toBeEnabled();
}

async function walkin(page: Page, name: string, phone: string, time: string) {
  await gotoToday(page, DAY);
  await openNewBooking(page);
  await fillWalkin(page, { name, phone, stylistId: "elly", services: ["Men's Cut"], date: DAY, time });
  await submitWalkin(page);
  await expect(page.getByText(`Walk-in booking created for ${name}`)).toBeVisible();
}

test("TC-111 Manage shows Text messages: off, with all four messages and a preview of each", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openSms(page);
  await expect(page.getByRole("heading", { name: "Text messages" })).toBeVisible();
  await expect(page.locator("#sms-enabled")).not.toBeChecked();
  await expect(page.locator("#sms-sender")).toHaveValue("SuaHair");
  for (const kind of ["received", "confirmed", "not_confirmed", "reminder"]) {
    await expect(page.getByTestId(`sms-on-${kind}`)).toBeChecked();
    await expect(page.getByTestId(`sms-preview-${kind}`)).toContainText("Jane");
    await expect(page.getByTestId(`sms-preview-${kind}`)).not.toContainText("{");
  }
  await expect(page.getByTestId("sms-preview-received")).toContainText("isn't confirmed yet");
  await expect(page.getByTestId("sms-length-confirmed")).toContainText("GSM-7");
  await expect(page.getByTestId("sms-save")).toBeDisabled(); // nothing changed yet
  await page.context().close();
});

test("TC-112 the wording editor: live preview, length, placeholders, validation and reset", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openSms(page);
  const box = page.getByTestId("sms-template-confirmed");

  // typing updates the preview and the counter at once
  await box.fill("Hi {name}, see you {date} at {time}.");
  await expect(page.getByTestId("sms-preview-confirmed")).toHaveText("Hi Jane, see you Friday 3 July at 10:30 AM.");
  await expect(page.getByTestId("sms-length-confirmed")).toContainText("1 text message");
  await expect(page.getByTestId("sms-save")).toBeEnabled();

  // a placeholder button inserts at the cursor
  await box.fill("Hi , bye");
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(3, 3));
  await page.getByTestId("sms-add-confirmed-name").click();
  await expect(box).toHaveValue("Hi {name}, bye");

  // an unknown placeholder is named and blocks saving
  await box.fill("Hi {nmae}, bye");
  await expect(page.getByTestId("sms-problem-confirmed")).toHaveText("Unknown placeholder: {nmae}");
  await page.getByTestId("sms-save").click();
  await expect(page.getByText("Fix the highlighted message wording first.")).toBeVisible();
  expect(await settingsDoc()).toBeUndefined();

  // a long message shows how many texts it will cost; a curly quote changes the encoding
  await box.fill("x".repeat(200));
  await expect(page.getByTestId("sms-length-confirmed")).toContainText("2 text messages");
  await box.fill("It’s done");
  await expect(page.getByTestId("sms-length-confirmed")).toContainText("UCS-2");

  // a bad sender name is refused
  await page.locator("#sms-sender").fill("ab");
  await expect(page.locator("#sms-sender-help")).toContainText("Use 3 to 11 letters or numbers");
  await expect(page.getByTestId("sms-test-confirmed")).toBeDisabled();

  // reset puts the default back
  await page.getByTestId("sms-reset-confirmed").click();
  await expect(box).toHaveValue(/^Hi \{name\}, you're booked in!/);
  await expect(page.getByTestId("sms-reset-confirmed")).toBeDisabled();
  await page.context().close();
});

test("TC-113 saving keeps the switches, sender name and wording across a reload", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openSms(page);
  await page.locator("#sms-enabled").check();
  await page.locator("#sms-sender").fill("Sua Hair");
  await page.getByTestId("sms-on-reminder").uncheck();
  await page.getByTestId("sms-template-confirmed").fill("Booked, {name}! {date} {time}. {salon}");
  await page.getByTestId("sms-save").click();
  await expect(page.getByText("Text message settings saved.")).toBeVisible();
  await expect(page.getByTestId("sms-save")).toHaveText("Saved");

  const doc = await settingsDoc();
  expect(doc).toMatchObject({
    enabled: true,
    senderName: "Sua Hair",
    kinds: { received: true, confirmed: true, not_confirmed: true, reminder: false },
  });
  expect((doc!.templates as Record<string, string>).confirmed).toBe("Booked, {name}! {date} {time}. {salon}");

  await page.reload();
  await expect(page.locator("#sms-enabled")).toBeChecked();
  await expect(page.locator("#sms-sender")).toHaveValue("Sua Hair");
  await expect(page.getByTestId("sms-on-reminder")).not.toBeChecked();
  await expect(page.getByTestId("sms-template-confirmed")).toHaveValue("Booked, {name}! {date} {time}. {salon}");
  await page.context().close();
});

test("TC-114 a booking becomes a text in the owner's wording; off means nothing; 'Stop texts' means nothing", async ({ browser }) => {
  const { page } = await newAdminPage(browser);

  // 1. texts are off by default: a confirmed walk-in sends nothing
  await walkin(page, "Wendy Walkin", "0455 111 222", "2:00 PM");
  await expect.poll(async () => (await readCollection("clients")).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(await outbox()).toHaveLength(0);

  // 2. switch on with the owner's own wording
  await openSms(page);
  await page.locator("#sms-enabled").check();
  await page.getByTestId("sms-template-confirmed").fill("Booked, {name}! {service} with {stylist}, {date} at {time}. {salon}");
  await page.getByTestId("sms-save").click();
  await expect(page.getByText("Text message settings saved.")).toBeVisible();

  // 3. take one client off the list from their page
  await page.goto("/admin/clients/0455111222");
  await expect(page.getByTestId("client-housekeeping")).toBeVisible();
  await page.getByTestId("hk-texts").click();
  await expect(page.getByTestId("no-texts-badge")).toBeVisible();
  await expect(page.getByTestId("hk-texts")).toHaveText(/Allow texts/);
  // the page shows the change at once; wait for the server to hold it before a booking relies on it
  await expect
    .poll(async () => (await readCollection("clients")).find((c) => c.id === "0455111222")?.smsOptOut)
    .toBe(true);

  // 4. a walk-in for that client sends nothing; one for someone else sends the owner's wording
  await walkin(page, "Wendy Walkin", "0455 111 222", "3:00 PM");
  await walkin(page, "Nina Nobody", "0455 333 444", "4:00 PM");
  await expect.poll(async () => (await outbox()).length, { timeout: 20_000 }).toBe(1);
  await page.waitForTimeout(1500);
  const texts = await outbox();
  expect(texts).toHaveLength(1);
  expect(texts[0]).toMatchObject({ to: "+61455333444", from: "SuaHair" });
  expect(texts[0].body).toMatch(/^Booked, Nina! Men's Cut with Elly Lee, \w+ \d+ \w+ at 4:00 PM\. Sua Hair Studio$/);

  // 5. the log the owner sees holds no message and no full number
  const log = await readCollection("smsLog");
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ kind: "confirmed", status: "sent", toEnding: "444" });
  expect(JSON.stringify(log)).not.toContain("0455333444");
  expect(JSON.stringify(log)).not.toContain("Nina");
  await page.goto("/admin/manage?section=messages");
  await expect(page.getByTestId("sms-log")).toContainText("Booking confirmed to …444");

  // 6. allowing texts again clears the flag
  await page.goto("/admin/clients/0455111222");
  await page.getByTestId("hk-texts").click();
  await expect(page.getByTestId("no-texts-badge")).toHaveCount(0);
  await expect
    .poll(async () => (await readCollection("clients")).find((c) => c.id === "0455111222")?.smsOptOut)
    .toBeUndefined();
  await page.context().close();
});

test("TC-115 'Send me a test' texts the saved wording with a made-up booking", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openSms(page);

  // unsaved changes: the test would send old wording, so it waits
  await page.getByTestId("sms-template-reminder").fill("Reminder for {name}: {service} at {time}");
  await expect(page.getByTestId("sms-test-reminder")).toBeDisabled();
  await page.getByTestId("sms-save").click();
  await expect(page.getByText("Text message settings saved.")).toBeVisible();

  await page.getByTestId("sms-test-reminder").click();
  await expect(page.getByText("Enter your mobile number first")).toBeVisible();

  await page.getByTestId("sms-test-to").fill("0400 000 009");
  await page.getByTestId("sms-test-reminder").click();
  await expect(page.getByText("Test text sent (1 message).")).toBeVisible();
  const texts = await outbox();
  expect(texts).toHaveLength(1);
  expect(texts[0]).toMatchObject({ to: "+61400000009", from: "SuaHair", body: "TEST: Reminder for Jane: Cut & Blow Dry at 10:30 AM" });
  // a test is not a booking text: it does not appear in the log
  expect(await readCollection("smsLog")).toHaveLength(0);

  // not a mobile number
  await page.getByTestId("sms-test-to").fill("03 9569 0840");
  await page.getByTestId("sms-test-reminder").click();
  await expect(page.getByText("Enter your mobile number first").last()).toBeVisible(); // the first toast may still be up
  expect(await outbox()).toHaveLength(1); // nothing more was sent
  await page.context().close();
});
