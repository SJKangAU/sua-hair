// e2e/22-processing-visibility.spec.ts
// While a client is processing the stylist is free to take another client, and the
// admin screens say so: a "Stylist free" chip on each booking in the Bookings list with
// a legend, a callout in the booking drawer, and a button that opens the new-booking form
// for that gap (DEC-026 phases). The customer is told the same: in the service list, on the
// review sheet with the clock times, and on the confirmation. TC-154 .. TC-156.
import { expect, test } from "@playwright/test";
import { insertPhasedBooking, seedEmulator } from "./seed";
import { submitDetails, toDetailsStep, upcoming } from "./helpers";
import { gotoToday, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });

const DAY = upcoming(3, 3); // a Wednesday
const A = (minutes: number) => ({ type: "active" as const, minutes });
const R = (minutes: number) => ({ type: "rest" as const, minutes });
const h = (hour: number, min = 0) => hour * 60 + min;

const perm = {
  bookingType: "customer",
  status: "confirmed",
  customerName: "Pam Perm",
  customerPhone: "0411111111",
  stylistId: "steve",
  stylistName: "Steve Hwang",
  stylistLevel: "director",
  serviceId: "digital-perm",
  serviceName: "Digital Perm",
  servicePrice: 300,
  date: DAY,
  time: "10:00 AM",
  createdAt: new Date().toISOString(),
};

test.beforeEach(async () => {
  await seedEmulator();
  await insertPhasedBooking("pam", perm, h(10), [A(60), R(30), A(30)]);
  await insertPhasedBooking(
    "cara",
    { ...perm, customerName: "Cara Cut", serviceId: "ladies-cut", serviceName: "Ladies Cut", servicePrice: 90, time: "1:00 PM" },
    h(13),
    [A(45)],
  );
});

test("TC-154 the Bookings list marks processing time as the stylist being free, with a legend; a plain cut has none", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/bookings");
  await expect(page.getByText("Pam Perm").first()).toBeVisible();
  const pam = page.getByTestId("free-window");
  await expect(pam).toHaveCount(1); // only the perm has a processing stretch
  await expect(pam).toContainText("Stylist free 11:00 AM – 11:30 AM (30 min)");
  await expect(page.getByTestId("free-window-legend")).toContainText("the stylist is free and can take another client");
  await page.context().close();
});

test("TC-155 the booking drawer says the stylist is free and 'Book someone into this gap' opens the form for that window", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await page.getByText("Pam Perm").first().click();
  await page.getByRole("button", { name: "View details" }).click();
  const callout = page.getByTestId("drawer-free-window");
  await expect(callout).toContainText("Processing 11:00 AM – 11:30 AM");
  await expect(callout).toContainText("free to take another client");

  await page.getByTestId("book-into-gap").click();
  await expect(page.getByTestId("drawer-free-window")).toHaveCount(0); // the drawer closed
  await expect(page.getByText("Add booking to gap")).toBeVisible();
  await page.context().close();
});

test("TC-156 the customer is told that the stylist looks after someone else while their colour sets", async ({ page }) => {
  await page.goto("/");
  // a service with setting time says so right in the list; one without does not
  const colour = page.getByRole("button", { name: /Colour \(Regrowth\)/ }).first();
  await expect(colour).toContainText("another client while it sets");
  await expect(page.getByRole("button", { name: /Ladies Cut/ }).first()).not.toContainText("another client");

  await toDetailsStep(page, {
    services: ["Colour (Regrowth)"],
    stylist: "Elly",
    date: DAY,
    time: "11:00 AM",
    phone: "0412 345 678",
    name: "Tina Newcustomer",
    email: "tina@example.com",
  });
  await submitDetails(page, { phone: "0412 345 678", name: "Tina Newcustomer", email: "tina@example.com" });
  // the confirmation explains it again, with the times: hands-on 11:00, setting 11:30 - 12:00
  await expect(page.getByRole("heading", { name: /Request received|Booked/ })).toBeVisible();
  const note = page.getByTestId("processing-explainer");
  await expect(note).toContainText("11:30 AM – 12:00 PM");
  await expect(note).toContainText("back with you at 12:00 PM");
});
