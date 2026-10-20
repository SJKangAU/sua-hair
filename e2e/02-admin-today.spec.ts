// e2e/02-admin-today.spec.ts
// docs/08-test-scenarios.md - Admin / Today tab (TC-009 .. TC-015), plus TC-033
// (walk-in clash is blocked), the "two admins at once" race and the cancel /
// undo / restore, per-date opening-hours and bulk-toast defects (D1-D4) through
// the real UI.
import { expect, test, type Page } from "@playwright/test";
import {
  insertBooking,
  readCollection,
  seedEmulator,
  connectEnv,
} from "./seed";
import { addDaysIso, melbourneInstant, todayIso, upcoming, weekdayOf } from "./helpers";
import {
  dialog,
  fillBreak,
  fillWalkin,
  gotoToday,
  newAdminPage,
  openNewBooking,
  submitBreak,
  submitWalkin,
} from "./admin";

test.describe.configure({ mode: "serial" });

const DAY = upcoming(3); // a Wednesday, at least 3 days out
const DAY2 = upcoming(4); // Thursday
const iso = new Date().toISOString();

const base = {
  bookingType: "customer",
  customerPhone: "0411111111",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  restTime: 0,
  createdAt: iso,
};
const steve = { stylistId: "steve", stylistName: "Steve Hwang" };
const yuto = { stylistId: "yuto", stylistName: "Yuto Hirakawa" };
const elly = { stylistId: "elly", stylistName: "Elly Lee" };

let page: Page;
let consoleMessages: string[];

test.beforeAll(async ({ browser }) => {
  await seedEmulator();
  const today = todayIso();
  await insertBooking("seed-today", {
    ...base, ...elly, status: "confirmed", customerName: "Todd Today",
    date: today, time: "10:00 AM", activeTime: 45, totalTime: 45,
  });
  await insertBooking("seed-confirmed", {
    ...base, ...yuto, status: "confirmed", customerName: "Carl Confirmed",
    date: DAY, time: "10:00 AM", activeTime: 45, totalTime: 45,
  });
  await insertBooking("seed-pending", {
    ...base, ...steve, status: "pending", customerName: "Pat Pending",
    date: DAY, time: "11:00 AM", activeTime: 45, totalTime: 45,
  });
  ({ page, consoleMessages } = await newAdminPage(browser));
});

test.afterAll(async () => {
  await page.context().close();
});

test("TC-009 timeline loads: every active stylist, today's bookings, current-time bar", async ({
  browser,
}) => {
  test.skip(weekdayOf(todayIso()) === 1, "salon is closed on Mondays");
  const { page: p } = await newAdminPage(browser);
  // fix the clock at 2:20 PM today so the now-bar is inside trading hours
  await p.clock.setFixedTime(melbourneInstant(todayIso(), 14, 20));
  await p.reload();
  await expect(p.getByText("Steve · Director").first()).toBeVisible();
  for (const name of ["Elly · Senior", "Ethan · Junior", "Harry · Junior", "Steve · Director", "Yuto · Senior"]) {
    await expect(p.getByText(name).first()).toBeVisible();
  }
  await expect(p.getByText("Todd Today").first()).toBeVisible();
  await expect(p.getByText("2:20 PM", { exact: true })).toHaveCount(1); // the now-bar label
  await p.context().close();
});

test("TC-010 Next moves the timeline to tomorrow and loads its bookings", async () => {
  await gotoToday(page, addDaysIso(DAY, -1));
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByText("Carl Confirmed").first()).toBeVisible();
  const d = new Date(`${DAY}T12:00:00`);
  await expect(
    page.getByRole("heading", { name: new RegExp(String(d.getDate())) }).first(),
  ).toBeVisible();
});

test("TC-011 clicking a booking block opens its quick actions, and View details opens the full booking", async () => {
  await gotoToday(page, DAY);
  await page.getByText("Carl Confirmed").first().click();
  // quick-action popover with the booking's summary - not the create form
  await expect(page.getByRole("button", { name: "View details" })).toBeVisible();
  await expect(page.getByText("10:00 AM · Men's Cut")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New Booking" })).toHaveCount(0);
  await page.getByRole("button", { name: "View details" }).click();
  await expect(page).toHaveURL(/booking=seed-confirmed/);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("Carl Confirmed");
  await expect(dialog(page)).toContainText("0411111111");
  await expect(dialog(page)).toContainText("Men's Cut");
  await dialog(page).getByRole("button", { name: "Close" }).first().click();
  await expect(dialog(page)).toHaveCount(0);
});

test("TC-012 clicking empty time opens the create form pre-filled with that stylist, time and a 30-minute block", async () => {
  await gotoToday(page, DAY);
  // No "Open slot" buttons any more: empty time is just the grid
  await expect(page.getByRole("button", { name: /Open slot/ })).toHaveCount(0);
  // Ethan has nothing booked: click in his column at 11:10 (the 11:00 row)
  const column = (await page.getByTestId("timeline-column-ethan").boundingBox())!;
  await page.mouse.move(column.x + column.width / 2, column.y + (11 * 60 + 10 - 10 * 60) * 2);
  await expect(page.getByTestId("create-preview-label")).toHaveText("11:00 – 11:30 am");
  await page.mouse.click(column.x + column.width / 2, column.y + (11 * 60 + 10 - 10 * 60) * 2);
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByRole("heading", { name: "New Booking" })).toBeVisible();
  expect(await d.locator("select").nth(0).inputValue()).toBe("ethan");
  expect(await d.locator("select").nth(1).inputValue()).toBe("11:00 AM");
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 – 11:30 am · 30 min");
  await d.getByRole("button", { name: "Close dialog" }).click();
});

test("TC-013 create walk-in: appears immediately as confirmed", async () => {
  await gotoToday(page, DAY);
  await openNewBooking(page);
  await fillWalkin(page, {
    name: "Wendy Walkin",
    phone: "0455 111 222",
    stylistId: "elly",
    services: ["Men's Cut"],
    date: DAY,
    time: "2:00 PM",
  });
  await submitWalkin(page);
  await expect(page.getByText("Walk-in booking created for Wendy Walkin")).toBeVisible();
  await expect(page.getByText("Wendy Walkin").first()).toBeVisible();

  const walkins = (await readCollection("bookings")).filter((b) => b.customerName === "Wendy Walkin");
  expect(walkins).toHaveLength(1);
  expect(walkins[0]).toMatchObject({ bookingType: "walkin", status: "confirmed", stylistId: "elly", date: DAY, time: "2:00 PM" });
  // auto-generated id, not date+stylist+time
  expect(walkins[0].id).not.toContain("elly");
  expect(walkins[0].id).not.toContain("2:00");
});

test("TC-014 create break: a break block appears on the timeline", async () => {
  await gotoToday(page, DAY);
  await openNewBooking(page);
  await fillBreak(page, { stylistId: "steve", date: DAY, time: "1:00 PM", durationLabel: "1 hour", reason: "Lunch" });
  await submitBreak(page);
  await expect(page.getByText(/Break blocked for Steve Hwang at 1:00 PM/)).toBeVisible();
  await expect(page.getByText("Lunch").first()).toBeVisible();
  const breaks = (await readCollection("bookings")).filter((b) => b.bookingType === "break");
  expect(breaks).toHaveLength(1);
  expect(breaks[0]).toMatchObject({ stylistId: "steve", time: "1:00 PM", totalTime: 60, status: "confirmed" });
});

test("TC-015 confirming a pending booking turns it confirmed with a toast", async () => {
  await gotoToday(page, DAY);
  await page.getByText("Pat Pending").first().click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect.poll(async () =>
    (await readCollection("bookings")).find((b) => b.id === "seed-pending")?.status,
  ).toBe("confirmed");
  const slot = (await readCollection("slotBlocks")).find((b) => b.id === "seed-pending");
  expect(slot?.status).toBe("confirmed");
});

test("TC-033 an admin walk-in that overlaps an existing booking is blocked with a clear message", async () => {
  await gotoToday(page, DAY);
  const before = (await readCollection("bookings")).length;
  await openNewBooking(page);
  // Carl Confirmed is Yuto 10:00-10:45
  await fillWalkin(page, {
    name: "Clash Walkin",
    stylistId: "yuto",
    services: ["Men's Cut"],
    date: DAY,
    time: "10:30 AM",
  });
  await submitWalkin(page);
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toContainText("Yuto Hirakawa is already booked at that time");
  await expect(alert).toContainText("Carl Confirmed");
  await expect(alert).toContainText("10:00 AM – 10:45 AM");
  await expect(dialog(page)).toBeVisible(); // stays open so the time can be changed
  expect((await readCollection("bookings")).length).toBe(before);
  await dialog(page).getByRole("button", { name: "Close dialog" }).click();
});

test("TC-033b a walk-in inside another booking's rest window is allowed", async () => {
  const day = upcoming(5);
  await insertBooking("seed-colour", {
    ...base, ...steve, serviceId: "colour-regrowth", serviceName: "Colour (Regrowth)",
    status: "confirmed", customerName: "Cora Colour", date: day, time: "10:00 AM",
    activeTime: 30, restTime: 30, totalTime: 60,
  });
  await gotoToday(page, day);
  await openNewBooking(page);
  await fillWalkin(page, {
    name: "Beard Walkin",
    stylistId: "steve",
    services: ["Beard Trim"], // 20 min hands-on fits the 30-minute setting window
    date: day,
    time: "10:30 AM",
  });
  await submitWalkin(page);
  await expect(page.getByText("Walk-in booking created for Beard Walkin")).toBeVisible();
});

test("TC-033c a break overlapping a booking is blocked", async () => {
  await gotoToday(page, DAY);
  const before = (await readCollection("bookings")).length;
  await openNewBooking(page);
  await fillBreak(page, { stylistId: "yuto", date: DAY, time: "10:15 AM", durationLabel: "30 min", reason: "Clash" });
  await submitBreak(page);
  await expect(dialog(page).getByRole("alert")).toContainText("already booked at that time");
  expect((await readCollection("bookings")).length).toBe(before);
  await dialog(page).getByRole("button", { name: "Close dialog" }).click();
});

test("D1 two admins saving the same slot at the same moment: exactly one booking is created", async ({
  browser,
}) => {
  const day = upcoming(6);
  const a = await newAdminPage(browser);
  const b = await newAdminPage(browser);
  const prep = async (p: Page, name: string) => {
    await gotoToday(p, day);
    await openNewBooking(p);
    await fillWalkin(p, { name, stylistId: "harry", services: ["Ladies Cut"], date: day, time: "3:00 PM" });
  };
  await Promise.all([prep(a.page, "Race Alpha"), prep(b.page, "Race Beta")]);
  await Promise.all([submitWalkin(a.page), submitWalkin(b.page)]);
  // each admin sees an outcome: the winner a "created" toast, the loser the
  // clash notice (the loser's transaction retries before it gives up)
  for (const p of [a.page, b.page]) {
    await expect(
      p.getByText(/Walk-in booking created/).or(dialog(p).getByRole("alert")),
    ).toBeVisible();
  }
  const all = await readCollection("bookings");
  expect(
    all.filter((x) => x.date === day && x.stylistId === "harry"),
  ).toHaveLength(1);
  // the loser is told why
  const results = await Promise.all(
    [a.page, b.page].map(async (p) => ({
      created: await p.getByText(/Walk-in booking created/).count(),
      blocked: await dialog(p).getByRole("alert").count(),
    })),
  );
  expect(results.filter((r) => r.created === 1)).toHaveLength(1);
  expect(results.filter((r) => r.blocked === 1)).toHaveLength(1);
  await a.page.context().close();
  await b.page.context().close();
});

test("D2 cancel shows an Undo toast; Undo restores; a taken slot refuses a restore", async () => {
  const day = DAY2;
  await insertBooking("seed-cancel", {
    ...base, ...steve, status: "confirmed", customerName: "Cancel Me",
    date: day, time: "10:00 AM", activeTime: 45, totalTime: 45,
  });
  await gotoToday(page, day);
  const status = async () =>
    (await readCollection("bookings")).find((b) => b.id === "seed-cancel")?.status;

  await page.getByText("Cancel Me").first().click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled")).toBeVisible();
  await expect.poll(status).toBe("cancelled");

  // Undo from the toast puts it straight back
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Booking restored")).toBeVisible();
  await expect.poll(status).toBe("confirmed");

  // Cancel again, let someone else take the slot, then try to restore
  await page.getByText("Cancel Me").first().click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect.poll(status).toBe("cancelled");
  await insertBooking("seed-taker", {
    ...base, ...steve, status: "confirmed", customerName: "Slot Taker",
    date: day, time: "10:00 AM", activeTime: 45, totalTime: 45,
  });
  // The cancelled block now sits underneath the new booking, so restore it
  // from the Bookings list, filtered to cancelled bookings
  await page.goto("/admin/bookings");
  await page.locator("select").nth(1).selectOption("cancelled");
  await expect(page.getByText("Cancel Me")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/Not restored/)).toBeVisible();
  await expect(page.getByText(/clashes with Slot Taker/)).toBeVisible();
  expect(await status()).toBe("cancelled");
});

test("D3 the timeline follows the opening hours configured for that date", async () => {
  const day = upcoming(2, 6); // a Tuesday a week or so out
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("salonSettings/main").update({
      [`dateOverrides.${day}`]: { open: 12, close: 15 },
    });
  });
  await env.cleanup();
  await gotoToday(page, day);
  // grid runs 12 PM - 3 PM: no 10:00 AM / 11:00 AM rows, 12:00 PM and 3:00 PM present
  await expect(page.getByText("12:00 PM", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2:00 PM", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("10:00 AM", { exact: true })).toHaveCount(0);
  await expect(page.getByText("5:00 PM", { exact: true })).toHaveCount(0);
  // and a normal day is still 10 - 6
  await gotoToday(page, upcoming(2, 14));
  await expect(page.getByText("10:00 AM", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("5:00 PM", { exact: true }).first()).toBeVisible();
});

test("no deprecated Firestore persistence warning is logged", async () => {
  const bad = consoleMessages.filter((m) =>
    /enableIndexedDbPersistence|enableMultiTabIndexedDbPersistence|deprecated/i.test(m),
  );
  expect(bad).toEqual([]);
});
