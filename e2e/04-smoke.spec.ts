// e2e/04-smoke.spec.ts
// The pilot's core promise, end to end in a real browser: a client books online,
// the owner approves it, and an overlapping admin walk-in is then blocked.
import { expect, test } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import { bookOnline, upcoming } from "./helpers";
import { dialog, fillWalkin, gotoToday, newAdminPage, openNewBooking, submitWalkin } from "./admin";

const DAY = upcoming(2, 3);

test("SMOKE client books online -> owner approves -> overlapping admin walk-in is blocked", async ({ page, browser }) => {
  await seedEmulator();

  // 1. a client books (public page, no login)
  await bookOnline(page, {
    services: ["Ladies Cut"],
    stylist: "Yuto",
    date: DAY,
    time: "11:00 AM",
    phone: "0466 777 888",
    name: "Smoke Client",
  });
  const [created] = await readCollection("bookings");
  expect(created).toMatchObject({ status: "pending", customerName: "Smoke Client", stylistId: "yuto", date: DAY, time: "11:00 AM" });

  // 2. the owner sees it waiting and approves it
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/approvals");
  await expect(owner.getByText("Smoke Client")).toBeVisible();
  await owner.getByRole("button", { name: /^(Approve|Confirm)/ }).first().click();
  await expect.poll(async () => (await readCollection("bookings"))[0].status).toBe("confirmed");

  // 3. an admin tries to book Yuto over the top of it: blocked, clearly
  await gotoToday(owner, DAY);
  await expect(owner.getByText("Smoke Client").first()).toBeVisible();
  await openNewBooking(owner);
  await fillWalkin(owner, {
    name: "Overlap Walkin",
    stylistId: "yuto",
    services: ["Men's Cut"],
    date: DAY,
    time: "11:30 AM",
  });
  await submitWalkin(owner);
  await expect(dialog(owner).getByRole("alert")).toContainText("Yuto Hirakawa is already booked at that time");
  await expect(dialog(owner).getByRole("alert")).toContainText("Smoke Client");
  expect(await readCollection("bookings")).toHaveLength(1);

  // ...but the same stylist is bookable straight after it ends
  await dialog(owner).locator("select").nth(1).selectOption({ label: "12:00 PM" });
  await submitWalkin(owner);
  await expect(owner.getByText("Walk-in booking created for Overlap Walkin")).toBeVisible();
  expect(await readCollection("bookings")).toHaveLength(2);
  await owner.context().close();
});
