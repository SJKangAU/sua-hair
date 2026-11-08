// e2e/26-your-hair.spec.ts
// The "Your hair" step, owner-editable hair options and service pictures, through the real UI
// against the Firestore + Auth + Functions + Storage emulators. TC-170 .. TC-175.
//   - a service set to ask about hair adds a Your Hair step with current and desired hair
//   - answers are stored as a label snapshot, never reach the public availability data, and
//     show for the owner in the booking drawer (with the call advice for a flagged answer)
//   - the owner edits the options in Manage and customers see the change
//   - each service shows a built-in illustration, or the owner's own picture (uploaded to Storage)
import { expect, test, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator } from "./seed";
import { pickDate, slotButton, tap, upcoming } from "./helpers";
import { gotoToday, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const DAY = upcoming(3, 3); // a Wednesday
const PHONE = "0412 345 678";

async function updateService(id: string, data: Record<string, unknown>): Promise<void> {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`services/${id}`).update(data);
    });
  } finally {
    await env.cleanup();
  }
}

test.beforeEach(async () => {
  await seedEmulator();
  await updateService("ladies-cut", { askHairDetails: true });
});

const opt = (page: Page, section: string, q: string, o: string) => page.getByTestId(`hair-opt-${section}-${q}-${o}`);

async function chooseServiceAndOpenHairStep(page: Page, service = "Ladies Cut"): Promise<void> {
  await page.goto("/");
  await tap(page.getByRole("button", { name: new RegExp(service) }).first());
  await tap(page.getByRole("button", { name: "Continue" }));
}

async function finishBooking(page: Page): Promise<void> {
  await tap(page.getByRole("button", { name: /Elly/ }).first());
  await pickDate(page, DAY);
  await tap(slotButton(page, "11:00 AM"));
  await tap(page.getByRole("button", { name: "Review Booking" }));
  await tap(page.getByRole("button", { name: /Confirm & Continue/ }));
  await page.getByPlaceholder("e.g. 0412 345 678").fill(PHONE);
  await page.getByPlaceholder("Your full name").fill("Hana Hairdetails");
  await page.locator("#booking-consent").evaluate((el: HTMLInputElement) => el.click());
  await tap(page.getByRole("button", { name: "Request Booking" }));
  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible();
  // item 15: the total is a starting price, and the note says the final price comes later
  await expect(page.getByTestId("confirmation-total")).toHaveText(/^from \$/);
  await expect(page.getByTestId("final-price-note")).toHaveText("Final price is confirmed at your appointment.");
}

test("TC-170 a service that asks about hair adds a Your Hair step, with picture choices, and Continue waits for the required answer", async ({ page }) => {
  await chooseServiceAndOpenHairStep(page);
  await expect(page.getByTestId("hair-step")).toBeVisible();
  await expect(page.getByTestId("hair-section-current")).toContainText("Current hair");
  await expect(page.getByTestId("hair-section-desired")).toContainText("Desired hair");

  // the indicator now has four steps
  await expect(page.getByText("Your Hair", { exact: true })).toBeVisible();

  // colour swatches and icons are shown
  await expect(page.getByTestId("hair-section-desired").getByTestId("hair-swatch").first()).toBeVisible();
  await expect(page.getByTestId("hair-section-current").locator("svg").first()).toBeVisible();

  // hair history is required
  await expect(page.getByTestId("hair-continue")).toBeDisabled();
  await tap(opt(page, "current", "history", "never"));
  await expect(opt(page, "current", "history", "never")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("hair-continue")).toBeEnabled();

  // a single-choice question swaps its answer; a multi-choice one adds
  await tap(opt(page, "current", "length", "short"));
  await tap(opt(page, "current", "length", "long"));
  await expect(opt(page, "current", "length", "short")).toHaveAttribute("aria-pressed", "false");
  await expect(opt(page, "current", "length", "long")).toHaveAttribute("aria-pressed", "true");
  await tap(opt(page, "current", "history", "permed"));
  await expect(opt(page, "current", "history", "never")).toHaveAttribute("aria-pressed", "true");
  await expect(opt(page, "current", "history", "permed")).toHaveAttribute("aria-pressed", "true");

  // Back returns to the services
  await tap(page.getByRole("button", { name: "← Back" }));
  await expect(page.getByRole("heading", { name: "Select Services" })).toBeVisible();
});

test("TC-171 a service that does not ask about hair has no Your Hair step", async ({ page }) => {
  await chooseServiceAndOpenHairStep(page, "Men's Cut");
  await expect(page.getByTestId("hair-step")).toHaveCount(0);
  await expect(page.getByText("Your Hair", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Date & Stylist" })).toBeVisible();
});

test("TC-172 the answers are stored as labels, kept off the public data, and the owner sees them with the call advice", async ({ browser, page }) => {
  await chooseServiceAndOpenHairStep(page);
  await tap(opt(page, "current", "history", "bleached"));
  await tap(opt(page, "current", "colour-now", "now-blonde"));
  await tap(opt(page, "desired", "colour-want", "ash"));
  await tap(opt(page, "desired", "texture", "light-wave"));
  await page.getByTestId("hair-notes-desired").fill("Cool and soft, not purple");
  await tap(page.getByTestId("hair-continue"));
  await finishBooking(page);

  const [booking] = await readCollection("bookings");
  expect(booking.hair.callFlagged).toBe(true);
  const current = booking.hair.sections.find((s: { id: string }) => s.id === "current");
  expect(JSON.stringify(current.items)).toContain("Bleached");
  const desired = booking.hair.sections.find((s: { id: string }) => s.id === "desired");
  expect(desired.notes).toBe("Cool and soft, not purple");
  expect(JSON.stringify(desired.items)).toContain("Ash");
  // never in what the public calendar can read
  expect(JSON.stringify(await readCollection("slotBlocks"))).not.toMatch(/Bleached|Cool and soft|callFlagged/);

  const { page: owner } = await newAdminPage(browser);
  await gotoToday(owner, DAY);
  // the new-booking popup (batch 1) sits over the drawer: dismiss it
  await owner.getByRole("button", { name: "Got it" }).click();
  await owner.getByText("Hana Hairdetails").first().click();
  await owner.getByRole("button", { name: "View details" }).click();
  const answers = owner.getByTestId("hair-answers");
  await expect(answers).toContainText("Current hair");
  await expect(answers).toContainText("Desired hair");
  await expect(answers).toContainText("Bleached");
  await expect(answers).toContainText("Ash");
  await expect(answers).toContainText("Cool and soft, not purple");
  await expect(owner.getByTestId("hair-call-flag")).toBeVisible();
  await owner.context().close();
});

test("TC-173 the owner edits the hair options in Manage and customers see the change", async ({ browser, page }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage?section=hair");
  await expect(owner.getByTestId("hair-options-editor")).toBeVisible();

  // rename one option, hide another, add a new one, flag one for a call
  await owner.getByTestId("hair-edit-opt-current-length-short").getByRole("textbox", { name: /^Name of/ }).fill("Above the shoulder");
  await owner.getByLabel("Hide Dry", { exact: true }).check();
  const add = owner.getByLabel("New option for Colour family", { exact: true });
  await add.fill("Rose gold");
  await add.press("Enter");
  await expect(owner.getByLabel("Name of Rose gold", { exact: true })).toBeVisible();
  await owner.getByLabel("Needs a call: Not sure", { exact: true }).check();
  await owner.getByTestId("hair-save").click();
  await expect
    .poll(async () => {
      const settings = (await readCollection("salonSettings")).find((d) => d.id === "hairOptions");
      return JSON.stringify(settings?.config ?? "");
    })
    .toContain("Rose gold");

  // a customer now sees the owner's wording, without the hidden option, with the new one
  await chooseServiceAndOpenHairStep(page);
  await expect(opt(page, "current", "length", "short")).toContainText("Above the shoulder");
  await expect(opt(page, "current", "condition", "dry")).toHaveCount(0);
  await expect(opt(page, "current", "condition", "healthy")).toBeVisible();
  await expect(opt(page, "desired", "colour-want", "rose-gold")).toContainText("Rose gold");

  // and the newly flagged answer raises the call advice on the booking
  await tap(opt(page, "current", "history", "not-sure"));
  await tap(page.getByTestId("hair-continue"));
  await finishBooking(page);
  expect((await readCollection("bookings"))[0].hair.callFlagged).toBe(true);
  await owner.context().close();
});

test("TC-174 each service shows a built-in illustration, or the owner's own picture", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("service-art").first()).toHaveAttribute("data-art", "default");
  await updateService("mens-cut", { imageUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" });
  await page.reload();
  const art = page.getByRole("button", { name: /Men's Cut/ }).first().getByTestId("service-art");
  await expect(art).toHaveAttribute("data-art", "custom");
  await expect(page.getByRole("button", { name: /Ladies Cut/ }).first().getByTestId("service-art")).toHaveAttribute("data-art", "default");
});

// A 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("TC-175 the owner uploads a picture for a service (to Storage) and customers see it", async ({ browser, page }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  const row = owner
    .locator("div")
    .filter({ has: owner.getByText("Fringe Trim", { exact: true }) })
    .filter({ has: owner.getByRole("button", { name: "Edit", exact: true }) })
    .last();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await owner.getByTestId("service-image-file").setInputFiles({ name: "fringe.png", mimeType: "image/png", buffer: PNG });
  await expect(owner.getByText("Replace picture")).toBeVisible({ timeout: 20_000 });
  await owner.getByRole("button", { name: "Save Changes" }).click();
  await expect
    .poll(async () => (await readCollection("services")).find((x) => x.id === "fringe-trim")?.imageUrl as string)
    .toMatch(/^http.*site-images/);

  await page.goto("/");
  const art = page.getByRole("button", { name: /Fringe Trim/ }).first().getByTestId("service-art");
  await expect(art).toHaveAttribute("data-art", "custom");
  // the picture really loads from Storage
  await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await owner.context().close();
});
