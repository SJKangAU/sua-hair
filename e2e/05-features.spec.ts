// e2e/05-features.spec.ts
// Features that shipped after docs/08 was written: waitlist (TC-034),
// owner notifications (TC-035) and configurable opening hours (TC-036).
import { expect, test } from "@playwright/test";
import { insertBooking, readCollection, seedEmulator } from "./seed";
import { bookOnline, chooseSlotOnline, pickDate, tap, upcoming } from "./helpers";
import { newAdminPage } from "./admin";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedEmulator();
});

test("TC-034 a client can join the waitlist for a full day and the owner sees them", async ({ page, browser }) => {
  const day = upcoming(4, 3);
  // Fill Steve's whole day with back-to-back hour bookings (10:00 .. 5:00)
  for (let h = 10; h < 18; h++) {
    const time = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
    await insertBooking(`full-${h}`, {
      bookingType: "customer", status: "confirmed", customerName: `Filler ${h}`, customerPhone: "0400000000",
      stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director",
      serviceId: "ladies-cut", serviceName: "Ladies Cut", servicePrice: 95,
      activeTime: 60, restTime: 0, totalTime: 60, date: day, time, createdAt: new Date().toISOString(),
    });
  }
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Steve", date: day });
  await expect(page.getByText(/No appointments available for this day/)).toBeVisible();
  await tap(page.getByRole("button", { name: "Join Waitlist" }).first());
  await page.getByPlaceholder("Full name").fill("Wanda Waitlist");
  await page.getByPlaceholder("Mobile number").fill("0477 888 999");
  await tap(page.getByRole("button", { name: /Join Waitlist|Notify/ }).last());
  await expect(page.getByText("You're on the waitlist")).toBeVisible();

  const entries = await readCollection("waitlist");
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ requestedDate: day, status: "pending" });

  // the owner sees it on the Bookings page's waitlist panel
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/bookings");
  await expect(owner.getByText("Wanda Waitlist")).toBeVisible();
  await owner.context().close();
});

test("TC-035 the owner is notified of a new online booking, and the notification opens it", async ({ page, browser }) => {
  const day = upcoming(2, 3);
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/today");
  await bookOnline(page, {
    services: ["Men's Cut"], stylist: "Elly", date: day, time: "1:00 PM",
    phone: "0455 000 111", name: "Nora Notify",
  });
  // the bell badge shows an unread notification without a refresh
  const bell = owner.getByTitle(/unread notifications/).first();
  await expect(bell).toBeVisible();
  await bell.click();
  const item = owner.getByText(/New booking request: Nora Notify/);
  await expect(item).toBeVisible();
  await item.click();
  await expect(owner).toHaveURL(/booking=/);
  await expect(owner.locator('[role="dialog"]')).toContainText("Nora Notify");
  await owner.context().close();
});

test("TC-036 closing a date in Manage -> Opening hours makes it unbookable for customers", async ({ page, browser }) => {
  const day = upcoming(5, 10);
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage?section=hours");
  await owner.locator('input[type="date"]').fill(day);
  // the new-override type defaults to Closed
  await owner.getByRole("button", { name: "+ Add", exact: true }).click();
  await owner.getByRole("button", { name: "Save Hours" }).first().click();
  await expect.poll(async () => {
    const s = (await readCollection("salonSettings"))[0] as unknown as { dateOverrides?: Record<string, { closed?: boolean }> };
    return s?.dateOverrides?.[day]?.closed;
  }).toBe(true);

  // customer: that date is unavailable
  await page.goto("/");
  await tap(page.getByRole("button", { name: /Men's Cut/ }).first());
  await tap(page.getByRole("button", { name: "Continue" }));
  await tap(page.getByRole("button", { name: /Steve/ }).first());
  const label = await page.evaluate((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  }, day);
  for (let i = 0; i < 4 && (await page.getByRole("button", { name: new RegExp(`^${label}`) }).count()) === 0; i++) {
    await tap(page.getByRole("button", { name: "Next month" }));
  }
  await expect(page.getByRole("button", { name: new RegExp(`^${label}`) })).toBeDisabled();
  void pickDate;
  await owner.context().close();
});
