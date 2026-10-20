// e2e/06-hover-preview.spec.ts
// The booking page's day grid: hovering an available start highlights the exact
// block the booking would occupy; unavailable areas show no highlight; clicking
// chooses the time and the existing flow continues unchanged. Also touch,
// keyboard and reduced-motion behaviour. Runs against the Firestore emulator.
import { expect, test, type Page } from "@playwright/test";
import { insertBooking, readCollection, seedEmulator } from "./seed";
import { chooseSlotOnline, slotButton, tap, upcoming } from "./helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1000, height: 1700 } });

const DAY = upcoming(3, 3); // a Wednesday
const ROW_PX = 28; // one 15-minute row in the day grid
const blocks = (page: Page) => page.locator(".bk-day-block");
const label = (page: Page) => page.getByTestId("bk-preview-label");
const unavailableTag = (page: Page) => page.getByTestId("bk-preview-unavailable");

const base = {
  bookingType: "customer", status: "confirmed", customerPhone: "0411111111",
  createdAt: new Date().toISOString(), restTime: 0, servicePrice: 0,
};

test.beforeAll(async () => {
  await seedEmulator();
  // Steve: Colour (30 hands-on + 30 processing) 10:00, Ladies Cut 12:00 - 1:00
  await insertBooking("steve-colour", {
    ...base, customerName: "Cora Colour", stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director",
    serviceId: "colour-regrowth", serviceName: "Colour (Regrowth)", date: DAY, time: "10:00 AM",
    activeTime: 30, restTime: 30, totalTime: 60,
  });
  await insertBooking("steve-cut", {
    ...base, customerName: "Cleo Cut", stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director",
    serviceId: "ladies-cut", serviceName: "Ladies Cut", date: DAY, time: "12:00 PM",
    activeTime: 60, totalTime: 60,
  });
});

test("hovering an available start highlights the exact range the service would occupy", async ({ page }) => {
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
  const grid = page.getByRole("listbox", { name: "Appointment start times" });
  await expect(grid).toBeVisible();
  await expect(blocks(page)).toHaveCount(0);

  await slotButton(page, "2:00 PM").hover();
  await expect(label(page)).toHaveText("2:00 – 3:00 pm");
  await expect(blocks(page)).toHaveCount(1);
  const box = await blocks(page).boundingBox();
  const row = await slotButton(page, "2:00 PM").boundingBox();
  expect(Math.round(box!.height)).toBe((60 / 15) * ROW_PX); // 60 minutes = 4 rows
  expect(Math.abs(box!.y - row!.y)).toBeLessThanOrEqual(2); // starts on the hovered row

  // moving to another start moves the block
  await slotButton(page, "11:30 AM").hover();
  await expect(label(page)).toHaveText("11:30 am – 12:30 pm"); // crosses noon: both am/pm shown
});

test("the block's length follows the selected service, with hands-on and processing phases", async ({ page }) => {
  // Balayage: 60 min hands-on + 45 min processing = 105 min
  await chooseSlotOnline(page, { services: ["Balayage"], stylist: "Yuto", date: DAY });
  await slotButton(page, "11:30 AM").hover();
  await expect(label(page)).toHaveText("11:30 am – 1:15 pm");
  const block = blocks(page);
  const box = await block.boundingBox();
  expect(Math.round(box!.height)).toBe((105 / 15) * ROW_PX);
  // two stacked parts: solid hands-on (60 min) then hatched processing (45 min)
  const parts = await block.locator("> div").evaluateAll((els) =>
    els.map((el) => ({ h: Math.round(el.getBoundingClientRect().height), bg: getComputedStyle(el).backgroundImage })),
  );
  expect(parts).toHaveLength(2);
  expect(parts[0].h).toBe((60 / 15) * ROW_PX);
  expect(parts[0].bg).toBe("none"); // solid
  expect(Math.abs(parts[1].h - (45 / 15) * ROW_PX)).toBeLessThanOrEqual(3); // minus the block border
  expect(parts[1].bg).toContain("repeating-linear-gradient"); // hatched

  // a service with no processing has no hatched part
  await chooseSlotOnline(page, { services: ["Men's Cut"], stylist: "Yuto", date: DAY });
  await slotButton(page, "11:00 AM").hover();
  await expect(label(page)).toHaveText("11:00 – 11:45 am");
  await expect(blocks(page).locator("> div")).toHaveCount(1);
});

test("the hover snaps to 15-minute rows, and every row is a bookable start (DEC-024)", async ({ page }) => {
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
  // anywhere within the 10:30 row is the 10:30 block
  await slotButton(page, "10:30 AM").hover({ position: { x: 120, y: 3 } });
  await expect(label(page)).toHaveText("10:30 – 11:30 am");
  await slotButton(page, "10:30 AM").hover({ position: { x: 120, y: ROW_PX - 3 } });
  await expect(label(page)).toHaveText("10:30 – 11:30 am");
  // the next row down is the next 15 minutes - a real start, not a hint
  await slotButton(page, "10:45 AM").hover({ position: { x: 120, y: 3 } });
  await expect(label(page)).toHaveText("10:45 – 11:45 am");
  await expect(unavailableTag(page)).toHaveCount(0);
  await expect(slotButton(page, "10:45 AM")).toHaveAttribute("aria-disabled", "false");
  // and clicking it chooses it, saved at that quarter-hour
  await slotButton(page, "10:45 AM").click();
  await expect(slotButton(page, "10:45 AM")).toHaveAttribute("aria-selected", "true");
  // the 90-minute example from the brief: 11:15 am - 12:45 pm
  await chooseSlotOnline(page, { services: ["Colour (Regrowth)", "Fringe Trim"], stylist: "Yuto", date: DAY });
  await slotButton(page, "11:15 AM").hover();
  await expect(label(page)).toHaveText("11:15 am – 12:30 pm"); // Colour 60 + Fringe Trim 15 = 75 min
});

test("unavailable areas show a muted state and no highlight", async ({ page }) => {
  // Steve is booked 12:00 - 1:00 for a Ladies Cut; a 60-min service can't start from 11:15 to 12:45
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Steve", date: DAY });
  for (const t of ["11:15 AM", "11:30 AM", "11:45 AM", "12:00 PM", "12:15 PM", "12:30 PM", "12:45 PM"]) {
    await slotButton(page, t).hover();
    await expect(unavailableTag(page)).toHaveText("Not available");
    await expect(blocks(page)).toHaveCount(0);
    await expect(slotButton(page, t)).toHaveAttribute("aria-disabled", "true");
  }
  // ending exactly when the next booking starts is fine
  await slotButton(page, "11:00 AM").hover();
  await expect(label(page)).toHaveText("11:00 am – 12:00 pm");
  await slotButton(page, "1:00 PM").hover(); // free again as the booking ends
  await expect(label(page)).toHaveText("1:00 – 2:00 pm");
  // clicking an unavailable start chooses nothing
  await slotButton(page, "12:00 PM").click({ force: true });
  await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
});

test("a block that fits inside another booking's processing window is highlighted; one that does not is not", async ({ page }) => {
  // Steve's colour: hands-on 10:00-10:30, processing 10:30-11:00 (he is free)
  await chooseSlotOnline(page, { services: ["Beard Trim"], stylist: "Steve", date: DAY });
  await slotButton(page, "10:30 AM").hover();
  await expect(label(page)).toHaveText("10:30 – 10:50 am");
  await expect(blocks(page)).toHaveCount(1);
  await slotButton(page, "10:00 AM").hover(); // during the colour's hands-on time
  await expect(blocks(page)).toHaveCount(0);
  await slotButton(page, "10:15 AM").hover(); // still the colour's hands-on time
  await expect(blocks(page)).toHaveCount(0);
  await slotButton(page, "10:45 AM").hover(); // 10:45 - 11:05 would run past the 11:00 window end
  await expect(blocks(page)).toHaveCount(0);

  await chooseSlotOnline(page, { services: ["Men's Cut"], stylist: "Steve", date: DAY });
  await slotButton(page, "10:30 AM").hover(); // 45 min does not fit the 30-min window
  await expect(blocks(page)).toHaveCount(0);
  await expect(unavailableTag(page)).toHaveText("Not available");
});

test("clicking selects the time and the existing flow continues to a pending booking", async ({ page }) => {
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
  await slotButton(page, "2:00 PM").hover();
  await slotButton(page, "2:00 PM").click();
  await expect(slotButton(page, "2:00 PM")).toHaveAttribute("aria-selected", "true");
  await expect(blocks(page)).toHaveCount(1); // the chosen block stays drawn
  await page.mouse.move(0, 0);
  await expect(blocks(page)).toHaveCount(1);

  await tap(page.getByRole("button", { name: "Review Booking" }));
  await expect(page.locator("body")).toContainText("2:00 PM");
  await tap(page.getByRole("button", { name: /Confirm & Continue/ }));
  await page.getByPlaceholder("e.g. 0412 345 678").fill("0455 123 456");
  await page.getByPlaceholder("Your full name").fill("Hover Tester");
  await page.locator("#booking-consent").evaluate((el: HTMLInputElement) => el.click());
  await tap(page.getByRole("button", { name: "Confirm Booking" }));
  await expect(page.getByText(/Your booking is confirmed/)).toBeVisible();

  const mine = (await readCollection("bookings")).find((b) => b.customerName === "Hover Tester");
  expect(mine).toMatchObject({ status: "pending", stylistId: "yuto", date: DAY, time: "2:00 PM", totalTime: 60 });
});

test("keyboard: arrows move in 15-minute steps and Enter chooses a quarter-hour start", async ({ page }) => {
  await chooseSlotOnline(page, { services: ["Men's Cut"], stylist: "Elly", date: DAY });
  const grid = page.getByRole("listbox", { name: "Appointment start times" });
  await grid.focus();
  // the cursor starts on the first available start, 10:00 AM, so one step down is 10:15
  await page.keyboard.press("ArrowDown");
  await expect(grid).toHaveAttribute("aria-activedescendant", "bk-row-615");
  await expect(label(page)).toHaveText("10:15 – 11:00 am");
  await page.keyboard.press("ArrowDown");
  await expect(grid).toHaveAttribute("aria-activedescendant", "bk-row-630");
  await expect(label(page)).toHaveText("10:30 – 11:15 am");
  await page.keyboard.press("Enter");
  await expect(slotButton(page, "10:30 AM")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowUp");
  await expect(grid).toHaveAttribute("aria-activedescendant", "bk-row-615");
  await page.keyboard.press("Enter"); // a quarter-hour start is choosable
  await expect(slotButton(page, "10:15 AM")).toHaveAttribute("aria-selected", "true");
  // a visible focus indicator
  const outline = await grid.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
  // what a screen reader is told
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: "10:15 – 11:00 am, available" })).toHaveCount(1);
});

test("keyboard: an unavailable position cannot be chosen", async ({ page }) => {
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Steve", date: DAY });
  const grid = page.getByRole("listbox", { name: "Appointment start times" });
  await grid.focus();
  // the cursor starts on Steve's first free 60-minute start, 11:00; 11:15 would run into the 12:00 booking
  await page.keyboard.press("ArrowDown");
  await expect(grid).toHaveAttribute("aria-activedescendant", "bk-row-675");
  await expect(blocks(page)).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { selected: true })).toHaveCount(0);
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: "not available" })).toHaveCount(1);
});

test("prefers-reduced-motion switches the block's animation off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
  await slotButton(page, "3:00 PM").hover();
  await expect(blocks(page)).toHaveCount(1);
  const t = await blocks(page).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(t).toBe("0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await slotButton(page, "4:00 PM").hover();
  const t2 = await blocks(page).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(t2).not.toBe("0s");
});

test.describe("touch device", () => {
  test.use({ viewport: { width: 390, height: 1700 }, hasTouch: true, isMobile: true });

  test("tap a time to preview its block, then Select to choose it", async ({ page }) => {
    await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
    // no hover on touch: nothing is previewed yet
    await expect(blocks(page)).toHaveCount(0);

    await slotButton(page, "3:00 PM").tap();
    await expect(label(page)).toHaveText(/3:00 – 4:00 pm\s*Select/);
    await expect(blocks(page)).toHaveCount(1);
    // tapping previewed but did not choose
    await expect(page.getByRole("option", { selected: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Select", exact: true }).tap();
    await expect(slotButton(page, "3:00 PM")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Review Booking" })).toBeEnabled();
  });

  test("tapping a quarter-hour row previews that start", async ({ page }) => {
    await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Yuto", date: DAY });
    await page.getByRole("option", { name: /^4:15 PM/ }).tap();
    await expect(label(page)).toHaveText(/4:15 – 5:15 pm\s*Select/);
    await page.getByRole("button", { name: "Select", exact: true }).tap();
    await expect(slotButton(page, "4:15 PM")).toHaveAttribute("aria-selected", "true");
  });

  test("tapping an unavailable time previews nothing", async ({ page }) => {
    await chooseSlotOnline(page, { services: ["Ladies Cut"], stylist: "Steve", date: DAY });
    await slotButton(page, "12:00 PM").tap({ force: true });
    await expect(blocks(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveCount(0);
  });
});
