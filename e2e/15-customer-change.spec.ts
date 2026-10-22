// e2e/15-customer-change.spec.ts
// A customer changing or cancelling their own booking from the link in their email or text
// (FR-028, DEC-054), and the owner's policy for it, through the real UI against the Firebase
// emulators (Auth + Firestore + Functions): the page, cancel, a request to move (the
// original stays until the owner approves), the policy editor, the cutoff message and an
// instant move. Fake people only. TC-128 .. TC-133.
import { expect, test } from "@playwright/test";
import { insertBooking, readCollection, seedEmulator } from "./seed";
import { addDaysIso, upcoming } from "./helpers";
import { newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1300 } });
test.describe.configure({ mode: "serial" });

const DAY = upcoming(3, 4); // a Wednesday, at least 4 days out: well before any cutoff
const NEXT = addDaysIso(DAY, 1); // the Thursday after
const ID = "e2e-booking-0001";
const TOKEN = "e2e-manage-token-0123456789";
const PHONE = "0411000111";

const booking = (over: Record<string, unknown> = {}) => ({
  bookingType: "customer",
  status: "confirmed",
  customerName: "Cara Customer",
  customerNameLower: "cara customer",
  customerPhone: PHONE,
  clientId: PHONE,
  stylistId: "steve",
  stylistName: "Steve Hwang",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  services: [{ id: "mens-cut", name: "Men's Cut", price: 75, activeTime: 45, restTime: 0, totalTime: 45 }],
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  date: DAY,
  time: "10:00 AM",
  bookingRef: "BK-E2E",
  manageToken: TOKEN,
  createdAt: new Date().toISOString(),
  ...over,
});

const link = (id = ID, token = TOKEN) => `/manage?b=${id}&t=${token}`;
const bookings = async () => await readCollection("bookings");
const byId = async (id: string) => (await bookings()).find((b) => b.id === id) as Record<string, unknown> | undefined;

test.beforeEach(async () => {
  await seedEmulator();
  await insertBooking(ID, booking());
});

test("TC-128 the link shows the booking and what can be done; a wrong secret shows nothing", async ({ page }) => {
  await page.goto(link());
  await expect(page.getByTestId("manage-status")).toHaveText("Your booking is confirmed.");
  await expect(page.getByTestId("manage-details")).toContainText("Men's Cut");
  await expect(page.getByTestId("manage-details")).toContainText("Steve Hwang");
  await expect(page.getByTestId("manage-details")).toContainText("10:00 AM");
  await expect(page.getByTestId("manage-change")).toBeVisible();
  await expect(page.getByTestId("manage-cancel")).toBeVisible();
  // nothing private on the page
  await expect(page.locator("body")).not.toContainText(PHONE);
  await expect(page.locator("body")).not.toContainText(TOKEN);

  for (const url of [link(ID, "x".repeat(24)), link("no-such-booking-id"), "/manage", `/manage?b=${ID}`]) {
    await page.goto(url);
    await expect(page.getByTestId("manage-gone")).toBeVisible();
    await expect(page.getByTestId("manage-details")).toHaveCount(0);
  }
});

test("TC-129 cancelling: asks first, then cancels, frees the time and tells the salon", async ({ page }) => {
  await page.goto(link());
  await page.getByTestId("manage-cancel").click();
  await expect(page.getByTestId("manage-confirm-cancel")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  expect((await byId(ID))?.status).toBe("confirmed"); // asking is not cancelling

  await page.getByTestId("manage-cancel").click();
  await page.getByTestId("manage-cancel-confirm").click();
  await expect(page.getByTestId("manage-done")).toContainText("Your booking has been cancelled.");
  await expect.poll(async () => (await byId(ID))?.status).toBe("cancelled");
  expect(await byId(ID)).toMatchObject({ cancelledBy: "customer" });
  const notes = (await readCollection("notifications")).map((n) => String(n.message));
  expect(notes.some((m) => /cancelled their booking/.test(m))).toBe(true);

  // the link now describes a cancelled booking and offers nothing
  await page.goto(link());
  await expect(page.getByTestId("manage-status")).toHaveText("This booking has been cancelled.");
  await expect(page.getByTestId("manage-cancel")).toHaveCount(0);
  await expect(page.getByTestId("manage-change")).toHaveCount(0);
});

test("TC-130 moving (the default): the original stays until the owner approves, then it moves", async ({ page, browser }) => {
  await page.goto(link());
  await page.getByTestId("manage-change").click();
  await page.getByTestId("manage-date").fill(NEXT);
  await expect(page.getByTestId("manage-times")).toBeVisible();
  const times = await page.getByTestId("manage-time").allTextContents();
  expect(times).toContain("2:00 PM");
  await page.getByTestId("manage-time").filter({ hasText: /^2:00 PM$/ }).click();
  await expect(page.getByTestId("manage-done")).toContainText("asked the salon to move your booking");
  await expect(page.getByTestId("manage-done")).toContainText("Your original time stays");

  // the original is untouched; a pending request holds the new time
  expect(await byId(ID)).toMatchObject({ status: "confirmed", date: DAY, time: "10:00 AM" });
  const request = (await bookings()).find((b) => b.replacesBookingId === ID) as Record<string, unknown>;
  expect(request).toMatchObject({ status: "pending", date: NEXT, time: "2:00 PM", servicePrice: 75 });

  // the link now says a request is waiting, and offers no second change
  await page.goto(link());
  await expect(page.getByTestId("manage-pending-change")).toContainText("2:00 PM");
  await expect(page.getByTestId("manage-change")).toHaveCount(0);
  await expect(page.getByTestId("manage-reason")).toContainText("waiting for the salon");

  // the owner sees it for what it is, and approving it moves the booking
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/approvals");
  await expect(owner.getByTestId("move-request")).toContainText(`now ${DAY} 10:00 AM`);
  await owner.getByRole("button", { name: /Confirm/i }).first().click();
  await expect.poll(async () => (await byId(ID))?.status).toBe("cancelled");
  expect(await byId(ID)).toMatchObject({ cancelReason: "rescheduled" });
  expect(await byId(String(request.id))).toMatchObject({ status: "confirmed", date: NEXT, time: "2:00 PM" });
  await owner.context().close();
});

test("TC-131 the owner's policy: cutoff and message, switches, and what the page then offers", async ({ page, browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  await expect(owner.getByTestId("policy-settings")).toBeVisible();
  await expect(owner.getByTestId("policy-cutoff")).toHaveValue("24");
  await expect(owner.getByTestId("policy-mode-request")).toBeChecked();
  await expect(owner.getByTestId("policy-save")).toBeDisabled();

  // a bad cutoff is named and cannot be saved
  await owner.getByTestId("policy-cutoff").fill("soon");
  await expect(owner.getByTestId("policy-problem-cutoff")).toContainText("whole number");
  await expect(owner.getByTestId("policy-save")).toBeDisabled();
  await owner.getByTestId("policy-cutoff").fill("9999");
  await expect(owner.getByTestId("policy-problem-cutoff")).toBeVisible();

  // a cutoff longer than the time left: the page shows the owner's message instead of buttons
  await owner.getByTestId("policy-cutoff").fill("720");
  await owner.getByTestId("policy-message").fill("Too late to change this online - please ring us.");
  await owner.getByTestId("policy-save").click();
  await expect(owner.getByText("Cancellation policy saved.")).toBeVisible();
  await expect.poll(async () => (await readCollection("salonSettings")).find((d) => d.id === "policy")?.cutoffHours).toBe(720);

  await page.goto(link());
  await expect(page.getByTestId("manage-reason")).toContainText("Too late to change this online - please ring us.");
  await expect(page.getByTestId("manage-reason")).toContainText("(03) 9569 0840");
  await expect(page.getByTestId("manage-cancel")).toHaveCount(0);
  await expect(page.getByTestId("manage-change")).toHaveCount(0);

  // cancelling switched off on its own: moving still offered
  await owner.getByTestId("policy-cutoff").fill("24");
  await owner.getByTestId("policy-allow-cancel").uncheck();
  await owner.getByTestId("policy-save").click();
  await expect(owner.getByText("Cancellation policy saved.").last()).toBeVisible();
  await expect.poll(async () => (await readCollection("salonSettings")).find((d) => d.id === "policy")?.allowCancel).toBe(false);
  await page.goto(link());
  await expect(page.getByTestId("manage-change")).toBeVisible();
  await expect(page.getByTestId("manage-cancel")).toHaveCount(0);
  await expect(page.getByTestId("manage-reason")).toContainText("To cancel this booking, please call the salon.");
  await owner.context().close();
});

test("TC-132 'moves straight away': the booking moves at once and the old time is freed", async ({ page, browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage");
  await owner.getByTestId("policy-mode-instant").check();
  await owner.getByTestId("policy-save").click();
  await expect(owner.getByText("Cancellation policy saved.")).toBeVisible();
  await expect.poll(async () => (await readCollection("salonSettings")).find((d) => d.id === "policy")?.rescheduleMode).toBe("instant");

  await page.goto(link());
  await expect(page.getByTestId("manage-change")).toBeVisible();
  await page.getByTestId("manage-change").click();
  await expect(page.getByText("Your booking moves as soon as you choose a time.")).toBeVisible();
  await page.getByTestId("manage-date").fill(NEXT);
  await page.getByTestId("manage-time").filter({ hasText: /^3:00 PM$/ }).click();
  await expect(page.getByTestId("manage-done")).toContainText("has moved to");
  const moved = (await bookings()).find((b) => b.replacesBookingId === ID) as Record<string, unknown>;
  expect(moved).toMatchObject({ status: "confirmed", date: NEXT, time: "3:00 PM" });
  expect(await byId(ID)).toMatchObject({ status: "cancelled", cancelReason: "rescheduled" });
  await owner.context().close();
});

test("TC-133 a time that is taken is not offered", async ({ page }) => {
  await insertBooking("e2e-other", booking({ customerPhone: "0411000222", clientId: "0411000222", date: NEXT, time: "2:00 PM", manageToken: "e2e-other-token-0123456789" }));
  await page.goto(link());
  await page.getByTestId("manage-change").click();
  await page.getByTestId("manage-date").fill(NEXT);
  await expect(page.getByTestId("manage-times")).toBeVisible();
  const times = await page.getByTestId("manage-time").allTextContents();
  expect(times).not.toContain("2:00 PM");
  expect(times).not.toContain("2:15 PM");
  expect(times).toContain("1:00 PM");
  // and a closed day offers nothing
  const monday = addDaysIso(DAY, 5);
  await page.getByTestId("manage-date").fill(monday);
  await expect(page.getByTestId("manage-no-times")).toBeVisible();
});
