// e2e/01-customer.spec.ts
// docs/08-test-scenarios.md - Customer Booking Flow (TC-001 .. TC-008), driven
// through the real UI in a browser against the Firebase emulators.
import { expect, test } from "@playwright/test";
import { readCollection, seedEmulator } from "./seed";
import {
  addDaysIso,
  bookOnline,
  chooseSlotOnline,
  iso,
  pickDate,
  slotButton,
  tap,
  toDetailsStep,
  todayIso,
  upcoming,
  weekdayOf,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedEmulator();
});

const WED = upcoming(3); // a Wednesday at least 3 days out
const THU = upcoming(4);

test("TC-001 new customer booking is saved as pending and shows the confirmation screen", async ({
  page,
}) => {
  await bookOnline(page, {
    services: ["Ladies Cut"],
    stylist: "Elly",
    date: WED,
    time: "11:00 AM",
    phone: "0412 345 678",
    name: "Tina Newcustomer",
    email: "tina@example.com",
  });
  await expect(page.getByText("Tina").first()).toBeVisible();

  const bookings = await readCollection("bookings");
  expect(bookings).toHaveLength(1);
  expect(bookings[0]).toMatchObject({
    status: "pending",
    bookingType: "customer",
    customerName: "Tina Newcustomer",
    customerPhone: "0412345678",
    stylistId: "elly",
    date: WED,
    time: "11:00 AM",
    activeTime: 60,
    totalTime: 60,
  });
  expect(typeof bookings[0].consentGivenAt).toBe("string");
  const slots = await readCollection("slotBlocks");
  expect(slots.map((s) => s.id)).toEqual([bookings[0].id]);
  expect(JSON.stringify(slots[0])).not.toMatch(/Tina|0412345678|tina@/);
});

test("TC-002 (revised) a returning phone number is NOT recognised and nothing is pre-filled", async ({
  page,
}) => {
  // 0412345678 was used in TC-001. The public form deliberately no longer looks
  // customers up (customerLookups is staff-read-only, see firestore.rules).
  await toDetailsStep(page, {
    services: ["Men's Cut"],
    stylist: "Steve",
    date: WED,
    time: "2:00 PM",
    phone: "",
    name: "",
  });
  await page.getByPlaceholder("e.g. 0412 345 678").fill("0412 345 678");
  await page.getByPlaceholder("e.g. 0412 345 678").blur();
  await page.waitForTimeout(1500);
  await expect(page.getByPlaceholder("Your full name")).toHaveValue("");
  await expect(page.getByText(/welcome back|returning|visit/i)).toHaveCount(0);
});

test("TC-003 Monday cannot be selected", async ({ page }) => {
  const monday = upcoming(1);
  await chooseSlotOnline(page, {
    services: ["Men's Cut"],
    stylist: "Steve",
    date: WED,
  });
  const [y, m, d] = monday.split("-").map(Number);
  const label = await page.evaluate(
    ([yy, mm, dd]) =>
      new Date(yy, mm - 1, dd).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [y, m, d],
  );
  // The month shown contains the Wednesday; step forward if the Monday is later
  const btn = page.getByRole("button", { name: new RegExp(`^${label}`) });
  for (let i = 0; i < 3 && (await btn.count()) === 0; i++) {
    await tap(page.getByRole("button", { name: "Next month" }));
  }
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveAttribute("aria-label", /unavailable/);
  // control: the Wednesday is selectable
  await pickDate(page, WED);
  await expect(slotButton(page, "10:00 AM")).toBeVisible();
});

test("TC-004 after the 5pm cutoff, today is not selectable (tomorrow is the earliest)", async ({
  page,
}) => {
  const now = new Date();
  const sixPm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
  await page.clock.setFixedTime(sixPm);
  await page.goto("/");
  await tap(page.getByRole("button", { name: /Men's Cut/ }).first());
  await tap(page.getByRole("button", { name: "Continue" }));
  await tap(page.getByRole("button", { name: /Steve/ }).first());

  const labelFor = (dateIso: string) => {
    const [y, m, d] = dateIso.split("-").map(Number);
    return page.evaluate(
      ([yy, mm, dd]) =>
        new Date(yy, mm - 1, dd).toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
      [y, m, d],
    );
  };
  const today = todayIso();
  const todayBtn = page.getByRole("button", {
    name: new RegExp(`^${await labelFor(today)}`),
  });
  await expect(todayBtn).toBeDisabled();

  // The earliest selectable day is the next day the salon is open
  let next = addDaysIso(today, 1);
  if (weekdayOf(next) === 1) next = addDaysIso(next, 1);
  const nextBtn = page.getByRole("button", {
    name: new RegExp(`^${await labelFor(next)}`),
  });
  await expect(nextBtn).toBeEnabled();
});

test("TC-004b control: before the cutoff, today can still be chosen", async ({
  page,
}) => {
  test.skip(new Date().getDay() === 1, "today is a Monday (closed)");
  const now = new Date();
  await page.clock.setFixedTime(
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0),
  );
  await page.goto("/");
  await tap(page.getByRole("button", { name: /Men's Cut/ }).first());
  await tap(page.getByRole("button", { name: "Continue" }));
  await tap(page.getByRole("button", { name: /Steve/ }).first());
  const label = await page.evaluate(() =>
    new Date().toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
  await expect(
    page.getByRole("button", { name: new RegExp(`^${label}`) }),
  ).toBeEnabled();
});

test("TC-005 price follows the stylist's tier", async ({ page }) => {
  await chooseSlotOnline(page, {
    services: ["Colour (Regrowth)"],
    stylist: "Steve",
    date: THU,
  });
  await tap(slotButton(page, "3:00 PM"));
  await tap(page.getByRole("button", { name: "Review Booking" }));
  await expect(page.locator("body")).toContainText("$160"); // director tier
  // back out of the review sheet and switch to a junior stylist
  await tap(page.getByRole("button", { name: "Edit Booking" }));
  await tap(page.getByRole("button", { name: /Ethan/ }).first());
  await pickDate(page, THU);
  await tap(slotButton(page, "3:00 PM"));
  await tap(page.getByRole("button", { name: "Review Booking" }));
  await expect(page.locator("body")).toContainText("$120"); // junior tier
  await expect(page.locator("body")).not.toContainText("$160");
});

test("TC-006 a slot inside another booking's rest window is available if the service fits", async ({
  page,
}) => {
  const fri = upcoming(5);
  // Colour (Regrowth): 30 min hands-on + 30 min setting. Steve, 10:00 AM.
  await bookOnline(page, {
    services: ["Colour (Regrowth)"],
    stylist: "Steve",
    date: fri,
    time: "10:00 AM",
    phone: "0423 456 789",
    name: "Rest Window",
  });

  // Beard Trim (20 min hands-on) fits the 30-minute setting window at 10:30
  await chooseSlotOnline(page, {
    services: ["Beard Trim"],
    stylist: "Steve",
    date: fri,
  });
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute("aria-disabled", "false");
  // ...but the colour's own hands-on time is still blocked
  await expect(slotButton(page, "10:00 AM")).toHaveAttribute("aria-disabled", "true");

  // Men's Cut needs 45 min hands-on: it does NOT fit a 30-minute window.
  // (The original TC-006 expected 10:30 to be open for it - inconsistent data.)
  await chooseSlotOnline(page, {
    services: ["Men's Cut"],
    stylist: "Steve",
    date: fri,
  });
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute("aria-disabled", "true");
});

test("TC-007 / TC-008 a clashing slot is unavailable and shown greyed out, not hidden", async ({
  page,
}) => {
  // Ladies Cut = 60 min total. Steve, 10:00 AM.
  await bookOnline(page, {
    services: ["Ladies Cut"],
    stylist: "Steve",
    date: THU,
    time: "10:00 AM",
    phone: "0434 567 890",
    name: "Slot Conflict",
  });

  await chooseSlotOnline(page, {
    services: ["Beard Trim"],
    stylist: "Steve",
    date: THU,
  });
  // TC-007: 10:30 unavailable
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute("aria-disabled", "true");
  // TC-008: still present in the grid, labelled unavailable (not removed)
  await expect(slotButton(page, "10:00 AM")).toHaveAttribute(
    "aria-label",
    /unavailable/,
  );
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute(
    "aria-label",
    /unavailable/,
  );
  // 11:00 is free
  await expect(slotButton(page, "11:00 AM")).toHaveAttribute("aria-disabled", "false");
  // a different stylist is unaffected at the same time
  await tap(page.getByRole("button", { name: /Yuto/ }).first());
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute("aria-disabled", "false");
  void iso;
});
