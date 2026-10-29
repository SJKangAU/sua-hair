// e2e/23-colour-consultation.spec.ts
// A service that needs a phone consultation first (colour) through the real UI against the
// Firebase emulators: the client answers the colour questions when booking, the booking is
// HELD until the salon has rung (even if the service is set to confirm automatically), the
// owner sees "Call needed", the answers and the number to ring, can copy allergy notes onto
// the client's record, and a stylist reads the answers but cannot edit them. TC-157 .. TC-159.
import { expect, test, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator } from "./seed";
import { submitDetails, tap, toDetailsStep, upcoming } from "./helpers";
import { gotoToday, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const DAY = upcoming(3, 3); // a Wednesday
const PHONE = "0412 345 678";
const PHONE_CLEAN = "0412345678";

// Colour (Regrowth) needs a consultation, and is set to confirm automatically: the call still holds it
async function flagColourService(): Promise<void> {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("services/colour-regrowth").update({ requiresConsultation: true, requiresApproval: false });
    });
  } finally {
    await env.cleanup();
  }
}

test.beforeEach(async () => {
  await seedEmulator();
  await flagColourService();
});

const pick = (page: Page, id: string) => page.getByTestId(id).evaluate((el: HTMLInputElement) => el.click());

async function answerQuestions(page: Page, over: { dyeReaction?: "yes" | "no" | "unsure"; healthNotes?: string } = {}): Promise<void> {
  await pick(page, "consult-treatedBefore-yes");
  await pick(page, "consult-lastColoured-3to6months");
  await page.getByTestId("consult-currentColour").fill("Dark brown, coloured");
  await page.getByTestId("consult-desiredColour").fill("Soft caramel balayage");
  await pick(page, "consult-treatment-boxDye");
  await pick(page, `consult-dyeReaction-${over.dyeReaction ?? "no"}`);
  await pick(page, "consult-patchTest-yes");
  if (over.healthNotes) await page.getByTestId("consult-healthNotes").fill(over.healthNotes);
  await pick(page, "consult-callTime-afternoon");
}

const bookColour = (page: Page) =>
  toDetailsStep(page, {
    services: ["Colour (Regrowth)"],
    stylist: "Elly",
    date: DAY,
    time: "11:00 AM",
    phone: PHONE,
    name: "Tina Newcustomer",
  });

test("TC-157 a colour service asks the colour questions, is not bookable until they are answered, and is held for a call", async ({ page }) => {
  await bookColour(page);
  const form = page.getByTestId("consultation-questionnaire");
  await expect(form).toBeVisible();
  await page.getByPlaceholder("e.g. 0412 345 678").fill(PHONE);
  await expect(page.getByTestId("consult-call-note")).toContainText(`We'll call you on ${PHONE}`);

  // contact details and consent given, questions not answered: cannot send yet
  await page.getByPlaceholder("Your full name").fill("Tina Newcustomer");
  await page.locator("#booking-consent").evaluate((el: HTMLInputElement) => el.click());
  const send = page.getByRole("button", { name: "Request Booking" });
  await expect(send).toBeDisabled();

  await answerQuestions(page, { dyeReaction: "yes", healthNotes: "Sensitive scalp" });
  await expect(send).toBeEnabled();
  await tap(send);

  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible(); // not "Booked", though the service confirms automatically
  await expect(page.getByText("We will call you to talk through your colour")).toBeVisible();

  const bookings = await readCollection("bookings");
  expect(bookings).toHaveLength(1);
  expect(bookings[0]).toMatchObject({
    status: "pending",
    needsConsultation: true,
    customerPhone: PHONE_CLEAN,
    consultation: {
      treatedBefore: "yes",
      lastColoured: "3to6months",
      desiredColour: "Soft caramel balayage",
      treatments: ["boxDye"],
      dyeReaction: "yes",
      healthNotes: "Sensitive scalp",
      callTime: "afternoon",
    },
  });
  // the public availability projection never carries the answers
  const slots = JSON.stringify(await readCollection("slotBlocks"));
  expect(slots).not.toMatch(/caramel|Sensitive|consultation/);
});

test("TC-158 a service with no consultation shows no questions", async ({ page }) => {
  await page.goto("/");
  await toDetailsStep(page, { services: ["Ladies Cut"], stylist: "Elly", date: DAY, time: "11:00 AM", phone: PHONE, name: "Tina Newcustomer" });
  await expect(page.getByTestId("consultation-questionnaire")).toHaveCount(0);
  await submitDetails(page, { phone: PHONE, name: "Tina Newcustomer" });
  await expect(page.getByRole("heading", { name: /Request received|Booked/ })).toBeVisible();
  expect((await readCollection("bookings"))[0].consultation).toBeUndefined();
});

test("TC-159 the owner sees 'Call needed', the answers and the number; allergy notes copy to the client record; the approvals switch is locked", async ({ browser }) => {
  // a customer books through the real flow first
  const customer = await browser.newContext({ baseURL: "http://127.0.0.1:5174", locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1300, height: 1500 } });
  const cp = await customer.newPage();
  await bookColour(cp);
  await cp.getByPlaceholder("e.g. 0412 345 678").fill(PHONE);
  await cp.getByPlaceholder("Your full name").fill("Tina Newcustomer");
  await cp.locator("#booking-consent").evaluate((el: HTMLInputElement) => el.click());
  await answerQuestions(cp, { dyeReaction: "yes", healthNotes: "Sensitive scalp" });
  await tap(cp.getByRole("button", { name: "Request Booking" }));
  await expect(cp.getByRole("heading", { name: /Request received/ })).toBeVisible();
  await customer.close();

  const { page } = await newAdminPage(browser);
  await page.goto("/admin/approvals");
  await expect(page.getByTestId("call-needed")).toBeVisible();

  // the Approvals panel: this service is always held, so its switch is locked
  await page.getByTestId("service-approval-toggle").click();
  await expect(page.getByTestId("service-approval-colour-regrowth")).toBeDisabled();
  await expect(page.getByTestId("service-approval-row").filter({ hasText: "Colour (Regrowth)" })).toContainText("call the client first");

  // the booking drawer: ring first, the answers, the alerts
  await gotoToday(page, DAY);
  await page.getByText("Tina Newcustomer").first().click();
  await page.getByRole("button", { name: "View details" }).click();
  const section = page.getByTestId("consultation-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("consultation-call")).toHaveAttribute("href", `tel:${PHONE_CLEAN}`);
  await expect(section).toContainText("Ring the client, then confirm this booking");
  await expect(section).toContainText("Soft caramel balayage");
  await expect(section).toContainText("Afternoon");
  await expect(section).toContainText("Sensitive scalp");

  // copy allergy notes to the client record (the stylists read these)
  await page.getByTestId("consultation-copy").click();
  await expect(page.getByText("Added to the client's allergies.")).toBeVisible();
  await expect
    .poll(async () => (await readCollection("clients")).find((c) => c.id === PHONE_CLEAN)?.allergies)
    .toBe("Has reacted to hair dye before; Sensitive scalp");
  await expect
    .poll(async () => (await readCollection("clientCards")).find((c) => c.id === PHONE_CLEAN)?.allergies)
    .toBe("Has reacted to hair dye before; Sensitive scalp");
  // pressing it again adds nothing
  await page.getByTestId("consultation-copy").click();
  await expect(page.getByText("That is already on the client's record.")).toBeVisible();
  await page.context().close();
});
