// e2e/21-approval-settings.spec.ts
// The Approvals page's "How each service is booked" panel: the owner chooses, per
// service, whether an online booking is confirmed on the spot or waits for approval
// (FR-033, DEC-059), through the real UI against the Firebase emulators. TC-153.
import { expect, test } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import { newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1300 } });

test.beforeEach(async () => {
  await seedEmulator();
});

const held = async (id: string) =>
  (await readCollection("services")).find((s) => s.id === id)?.requiresApproval;

test("TC-153 the owner switches a service between confirming automatically and holding for approval", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/approvals");
  const panel = page.getByTestId("service-approval-panel");
  await expect(panel).toBeVisible();
  // every seeded service starts held, and the summary says so
  await expect(panel).toContainText("wait for your approval");
  expect(await held("mens-cut")).toBe(true);

  await page.getByTestId("service-approval-toggle").click();
  const rows = page.getByTestId("service-approval-row");
  await expect(rows.first()).toBeVisible();
  const mens = page.getByTestId("service-approval-mens-cut");
  await expect(mens).toBeChecked();
  await expect(rows.filter({ hasText: "Men's Cut" })).toContainText("Hold for my approval");

  // confirm automatically: written to the service, label and message follow
  await mens.uncheck();
  await expect(rows.filter({ hasText: "Men's Cut" })).toContainText("Confirm automatically");
  await expect(page.getByText("online bookings are now confirmed straight away")).toBeVisible();
  await expect.poll(() => held("mens-cut")).toBe(false);

  // and back
  await mens.check();
  await expect(rows.filter({ hasText: "Men's Cut" })).toContainText("Hold for my approval");
  await expect.poll(() => held("mens-cut")).toBe(true);
  await page.context().close();
});
