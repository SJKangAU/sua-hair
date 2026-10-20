// e2e/09-timeline-create.spec.ts
// The admin Today timeline creates bookings by pointing, like a calendar app
// (DEC-030): hover highlights a 30-minute block, press-and-drag sets the length,
// a click makes the 30-minute block, Escape cancels, touch needs a long press
// (or a tap then Create), the keyboard has its own cursor. A booking with a
// processing gap shows solid / hatched / solid, another client can be created
// inside the gap, the return stays reserved, and a phase edge can be dragged.
// TC-060 .. TC-072 in docs/08-test-scenarios.md.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { insertBooking, insertPhasedBooking, readCollection, seedEmulator } from "./seed";
import { adminLogin, addDaysIso, upcoming } from "./helpers";
import { BASE_URL, dialog, gotoToday, newAdminPage, openNewBooking, fillWalkin, submitWalkin } from "./admin";

// The fields these tests read back from Firestore
interface Doc {
  id: string;
  phases: { type: "active" | "rest"; minutes: number }[];
  segments: { type: "active" | "rest"; start: number; end: number }[];
  busy: { start: number; end: number }[];
  totalTime: number;
  servicePrice: number;
  stylistId: string;
  time: string;
  customerName: string;
  priceHistory: unknown[];
  activeTime: number;
  restTime: number;
}

test.use({ viewport: { width: 1400, height: 1000 } });

const DAY = upcoming(3, 3); // a Wednesday: salon hours 10:00 - 18:00
const GRID_START = 10 * 60; // the grid's first minute on a normal day
const PX = 2; // pixels per minute
const h = (hour: number, min = 0) => hour * 60 + min;
const A = (minutes: number) => ({ type: "active" as const, minutes });
const R = (minutes: number) => ({ type: "rest" as const, minutes });

const base = {
  bookingType: "customer",
  status: "confirmed",
  customerPhone: "0411111111",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  restTime: 0,
  date: DAY,
  createdAt: new Date().toISOString(),
};
const steve = { stylistId: "steve", stylistName: "Steve Hwang" };
const yuto = { stylistId: "yuto", stylistName: "Yuto Hirakawa" };

const cutAt = (id: string, who: typeof steve, name: string, time: string, minutes: number) =>
  insertBooking(id, { ...base, ...who, customerName: name, time, activeTime: minutes, totalTime: minutes });

const perm = {
  ...base, ...steve, customerName: "Pam Perm", time: "10:00 AM",
  serviceId: "digital-perm", serviceName: "Digital Perm", servicePrice: 300,
};

/** Viewport coordinates of a minute of the day in a stylist's column. */
async function at(page: Page, stylist: string, minutes: number) {
  const box = (await page.getByTestId(`timeline-column-${stylist}`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + (minutes - GRID_START) * PX };
}

/** Opens the day, then waits until the expected bookings are drawn and the grid
 *  has stopped moving, so pointer positions computed next are right. */
async function open(page: Page, day: string, blocks = 0) {
  await gotoToday(page, day);
  await expect(page.locator(".tl-block")).toHaveCount(blocks);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 60 && stable < 5; i++) {
    const y = Math.round((await page.getByTestId("timeline-column-steve").boundingBox())!.y);
    stable = y === last ? stable + 1 : 0;
    last = y;
    await page.waitForTimeout(60);
  }
}

const preview = (page: Page) => page.getByTestId("create-preview");
const bookings = async () => await readCollection("bookings");

test.beforeEach(async () => {
  await seedEmulator();
});

test("TC-060 there are no Open slot buttons or labels; unavailable time is a muted fill", async ({ browser }) => {
  await cutAt("a", steve, "Ann Alpha", "11:00 AM", 45);
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 1);
  await expect(page.getByText("Open slot")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open slot/ })).toHaveCount(0);
  // a past day is entirely muted, and a Monday (closed) too
  await open(page, addDaysIso(DAY, -14));
  const shade = page.getByTestId("unavailable-shade").first();
  await expect(shade).toBeVisible();
  const column = (await page.getByTestId("timeline-column-steve").boundingBox())!;
  const shaded = (await shade.boundingBox())!;
  expect(Math.round(shaded.height)).toBe(Math.round(column.height));
  await page.context().close();
});

test("TC-061 hovering empty time highlights a 30-minute block snapped to 15 minutes; not over a booking, a break or where it will not fit", async ({ browser }) => {
  await cutAt("a", steve, "Ann Alpha", "11:00 AM", 45); // 11:00 - 11:45
  await insertBooking("brk", { ...base, ...steve, bookingType: "break", customerName: "Break", time: "2:00 PM", activeTime: 30, totalTime: 30 });
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 2);

  const p = await at(page, "steve", h(12, 20));
  await page.mouse.move(p.x, p.y);
  await expect(preview(page)).toHaveCount(1);
  await expect(preview(page)).toHaveAttribute("data-start", String(h(12, 15)));
  await expect(preview(page)).toHaveAttribute("data-length", "30");
  await expect(page.getByTestId("create-preview-label")).toHaveText("12:15 – 12:45 pm");

  await page.mouse.move(p.x, (await at(page, "steve", h(12, 29))).y); // same 15-minute row
  await expect(preview(page)).toHaveAttribute("data-start", String(h(12, 15)));

  for (const [minute, why] of [
    [h(11, 20), "over a booking"],
    [h(14, 10), "over a break"],
    [h(13, 50), "13:45 - 14:15 would run into the break"],
    [h(10, 50), "10:45 - 11:15 would run into the booking"],
  ] as const) {
    const q = await at(page, "steve", minute);
    await page.mouse.move(q.x, q.y);
    await expect(preview(page), why).toHaveCount(0);
  }
  // exactly fitting before a booking is fine
  const fit = await at(page, "steve", h(10, 20));
  await page.mouse.move(fit.x, fit.y);
  await expect(preview(page)).toHaveAttribute("data-start", String(h(10, 15)));
  // the pointer leaving the column clears it
  await page.mouse.move(10, 10);
  await expect(preview(page)).toHaveCount(0);
  await page.context().close();
});

test("TC-062 dragging down 90 minutes opens the create form with the stylist, start and length", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const from = await at(page, "yuto", h(11, 17));
  const to = await at(page, "yuto", h(12, 40));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  // the highlight grows live and the label gives range and length
  await expect(preview(page)).toHaveAttribute("data-kind", "drag");
  await expect(preview(page)).toHaveAttribute("data-length", "90");
  await expect(page.getByTestId("create-preview-label")).toHaveText("11:15 am – 12:45 pm, 1h 30");
  await page.mouse.up();

  const d = dialog(page);
  await expect(d.getByRole("heading", { name: "New Booking" })).toBeVisible();
  expect(await d.locator("select").nth(0).inputValue()).toBe("yuto");
  expect(await d.locator("select").nth(1).inputValue()).toBe("11:15 AM");
  await expect(d.getByTestId("walkin-range")).toHaveText("11:15 am – 12:45 pm · 90 min");
  // the Block time tab gets the same length
  await d.getByRole("button", { name: "Block Time" }).click();
  await expect(d.locator("select").nth(2)).toHaveValue("90");
  await page.context().close();
});

test("TC-063 dragging up grows the block upward", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const from = await at(page, "yuto", h(13, 5));
  const to = await at(page, "yuto", h(12, 5));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(preview(page)).toHaveAttribute("data-start", String(h(12)));
  await expect(preview(page)).toHaveAttribute("data-length", "75");
  await page.mouse.up();
  await expect(dialog(page).locator("select").nth(1)).toHaveValue("12:00 PM");
  await page.context().close();
});

test("TC-064 a drag stops at the next booking, and at a break", async ({ browser }) => {
  await cutAt("a", steve, "Ann Alpha", "1:00 PM", 45); // 13:00 - 13:45
  await insertBooking("brk", { ...base, ...yuto, bookingType: "break", customerName: "Break", time: "12:30 PM", activeTime: 30, totalTime: 30 });
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 2);

  let from = await at(page, "steve", h(12, 5));
  let to = await at(page, "steve", h(14, 30)); // well past the booking
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(preview(page)).toHaveAttribute("data-length", "60"); // 12:00 - 13:00
  await page.mouse.up();
  await expect(dialog(page).getByTestId("walkin-range")).toHaveText("12:00 – 1:00 pm · 60 min");
  await dialog(page).getByRole("button", { name: "Close dialog" }).click();

  from = await at(page, "yuto", h(12, 5));
  to = await at(page, "yuto", h(14, 30));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(preview(page)).toHaveAttribute("data-length", "30"); // stops at the break
  await page.mouse.up();
  await expect(dialog(page).getByTestId("walkin-range")).toHaveText("12:00 – 12:30 pm · 30 min");
  await page.context().close();
});

test("TC-065 a plain click creates a 30-minute block", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const p = await at(page, "yuto", h(13, 10));
  await page.mouse.click(p.x, p.y);
  const d = dialog(page);
  await expect(d.getByRole("heading", { name: "New Booking" })).toBeVisible();
  expect(await d.locator("select").nth(0).inputValue()).toBe("yuto");
  expect(await d.locator("select").nth(1).inputValue()).toBe("1:00 PM");
  await expect(d.getByTestId("walkin-range")).toHaveText("1:00 – 1:30 pm · 30 min");
  await page.context().close();
});

test("TC-066 Escape cancels a drag; nothing opens", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const from = await at(page, "yuto", h(11, 5));
  const to = await at(page, "yuto", h(12, 5));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(preview(page)).toHaveAttribute("data-kind", "drag");
  await page.keyboard.press("Escape");
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(dialog(page)).toHaveCount(0);
  await page.context().close();
});

test("TC-067 the past and a stylist's closed hours cannot be booked", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  // a past Wednesday
  await open(page, addDaysIso(DAY, -14));
  const p = await at(page, "steve", h(12, 5));
  await page.mouse.move(p.x, p.y);
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText("That time has passed")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await page.context().close();
});

test("TC-068 a booking with a processing gap draws solid / hatched / solid", async ({ browser }) => {
  await insertPhasedBooking("perm", perm, h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 1);
  const band = page.getByTestId("processing-band");
  await expect(band).toHaveCount(1);
  await expect(band).toContainText("Processing 30 · back 11:30 AM");
  await expect(page.getByTestId("return-block")).toHaveCount(1);
  await expect(page.getByTestId("return-block")).toContainText("Return");
  const block = (await page.locator(".tl-block", { hasText: "Pam Perm" }).boundingBox())!;
  const b = (await band.boundingBox())!;
  const r = (await page.getByTestId("return-block").boundingBox())!;
  expect(Math.round(b.y - block.y)).toBe(60 * PX); // hands-on above
  expect(Math.round(b.height)).toBe(30 * PX); // the hatched gap
  expect(Math.round(r.y - b.y - b.height)).toBe(0); // the return block sits right under it
  expect(Math.round(r.height)).toBe(30 * PX);
  // the hands-on parts and the return open the booking (the gap itself is for
  // booking another client: TC-069)
  await page.getByTestId("return-block").click({ force: true });
  await expect(page.getByRole("button", { name: "View details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".tl-block", { hasText: "Pam Perm" }).click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("button", { name: "View details" })).toBeVisible();
  await page.context().close();
});

test("TC-069 another client can be booked into the gap; the return stays reserved", async ({ browser }) => {
  await insertPhasedBooking("perm", perm, h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 1);

  // the return block (11:30 - 12:00) and the hands-on part show no highlight
  for (const minute of [h(11, 40), h(10, 30)]) {
    const q = await at(page, "steve", minute);
    await page.mouse.move(q.x, q.y);
    await expect(preview(page)).toHaveCount(0);
  }
  // inside the gap there is one
  const gap = await at(page, "steve", h(11, 5));
  await page.mouse.move(gap.x, gap.y);
  await expect(preview(page)).toHaveAttribute("data-start", String(h(11)));
  await expect(preview(page)).toHaveAttribute("data-length", "30");
  await page.mouse.click(gap.x, gap.y);

  const d = dialog(page);
  await expect(d.getByRole("heading", { name: "Add booking to gap" })).toBeVisible();
  await d.getByPlaceholder("e.g. Jane Smith").fill("Gap Gary");
  await d.locator("label", { hasText: "Beard Trim" }).locator('input[type="checkbox"]').check();
  expect(await d.locator("select").nth(1).inputValue()).toBe("11:00 AM");
  await submitWalkin(page);
  await expect(page.getByText("Walk-in booking created for Gap Gary")).toBeVisible();
  const gary = (await bookings()).find((b) => b.customerName === "Gap Gary") as unknown as Doc;
  expect(gary.stylistId).toBe("steve");
  expect(gary.time).toBe("11:00 AM");
  expect(gary.totalTime).toBe(20);
  await page.context().close();
});

test("TC-070 a drag in the gap stops at the return block; a booking that clashes with the return is refused", async ({ browser }) => {
  await insertPhasedBooking("perm", perm, h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 1);
  const from = await at(page, "steve", h(11, 5));
  const to = await at(page, "steve", h(13));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(preview(page)).toHaveAttribute("data-length", "30"); // 11:00 - 11:30, not into the return
  await page.mouse.up();
  await dialog(page).getByRole("button", { name: "Close dialog" }).click();

  // a 45-minute cut at 11:00 would run into the return block: refused, nothing saved
  const before = (await bookings()).length;
  await openNewBooking(page);
  await fillWalkin(page, { name: "Clash Carl", stylistId: "steve", services: ["Men's Cut"], date: DAY, time: "11:00 AM" });
  await submitWalkin(page);
  await expect(dialog(page).getByRole("alert")).toContainText("Pam Perm");
  expect((await bookings()).length).toBe(before);
  await page.context().close();
});

test("TC-071 dragging the edge of a phase changes that phase and moves the later ones", async ({ browser }) => {
  await insertPhasedBooking("perm", perm, h(10), [A(60), R(30), A(30)]);
  await cutAt("later", steve, "Later Lee", "12:15 PM", 60); // 12:15 - 13:15
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 2);

  const block = page.locator(".tl-block", { hasText: "Pam Perm" });
  await block.hover();
  const edge = page.getByTestId("phase-edge-1"); // the bottom of the processing gap
  const box = (await edge.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // +45 min: the return would land on 12:15 - 12:45, onto the client at 12:15: refused, naming them
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90 * PX / 2 * 1, { steps: 6 }); // +45 min
  await expect(page.getByTestId("resize-tooltip")).toContainText("Later Lee");
  await page.mouse.up();
  await expect(page.getByText("Can't change the length")).toBeVisible();
  expect(((await bookings()).find((b) => b.id === "perm") as unknown as Doc).phases).toEqual([A(60), R(30), A(30)]);

  // 15 minutes longer: allowed
  await block.hover();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 15 * PX, { steps: 4 });
  await expect(page.getByTestId("resize-tooltip")).toContainText("Processing 45 min");
  await page.mouse.up();
  await expect.poll(async () => ((await bookings()).find((b) => b.id === "perm") as unknown as Doc).phases)
    .toEqual([A(60), R(45), A(30)]);
  const saved = (await bookings()).find((b) => b.id === "perm") as unknown as Doc;
  expect(saved.totalTime).toBe(135);
  expect(saved.servicePrice).toBe(300); // price untouched
  const proj = (await readCollection("slotBlocks")).find((b) => b.id === "perm") as unknown as Doc;
  expect(proj.busy).toEqual([{ start: h(10), end: h(11) }, { start: h(11, 45), end: h(12, 15) }]);
  await page.context().close();
});

test("TC-072 a save that conflicts is rejected when it is made", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const from = await at(page, "yuto", h(11, 5));
  const to = await at(page, "yuto", h(12, 5));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const d = dialog(page);
  await expect(d).toBeVisible();
  // meanwhile someone else books that time
  await cutAt("taken", yuto, "Taken Tina", "11:00 AM", 60);
  await d.getByPlaceholder("e.g. Jane Smith").fill("Late Larry");
  await d.locator("label", { hasText: "Beard Trim" }).locator('input[type="checkbox"]').check();
  await submitWalkin(page);
  await expect(d.getByRole("alert")).toContainText("Taken Tina");
  expect((await bookings()).some((b) => b.customerName === "Late Larry")).toBe(false);
  await page.context().close();
});

test("TC-077 the create form: Client returns after processing adds processing and return phases", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  // a drag opens the form; the length is the hands-on phase until a service is chosen
  const from = await at(page, "yuto", h(11, 5));
  const to = await at(page, "yuto", h(11, 35));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  const d = dialog(page);
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 – 11:45 am · 45 min");
  const returns = d.getByLabel("Client returns after processing");
  await expect(returns).not.toBeChecked();

  // choosing a service pre-fills its phases (Men's Cut: one 45-minute phase)
  await d.getByPlaceholder("e.g. Jane Smith").fill("Wendy Return");
  await d.locator("label", { hasText: "Men's Cut" }).locator('input[type="checkbox"]').check();
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 – 11:45 am · 45 min");
  await returns.check();
  await expect(d.getByTestId("phase-row-0")).toContainText("Hands-on");
  await expect(d.getByTestId("phase-row-1")).toContainText("Processing");
  await expect(d.getByTestId("phase-row-2")).toContainText("Return");
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 am – 12:45 pm · 105 min");
  await d.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 am – 1:00 pm · 120 min");
  // turning it off puts the service's own phases back
  await returns.uncheck();
  await expect(d.getByTestId("walkin-range")).toHaveText("11:00 – 11:45 am · 45 min");
  await returns.check();
  await d.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  await submitWalkin(page);
  await expect(page.getByText("Walk-in booking created for Wendy Return")).toBeVisible();
  const b = (await bookings()).find((x) => x.customerName === "Wendy Return") as unknown as Doc;
  expect(b.phases).toEqual([A(45), R(45), A(30)]);
  expect(b.totalTime).toBe(120);
  // and it is drawn solid / hatched / solid on the timeline
  await expect(page.getByTestId("processing-band")).toContainText("Processing 45 · back 12:30 PM");
  await expect(page.getByTestId("return-block")).toHaveCount(1);
  await page.context().close();
});

// ── Touch ─────────────────────────────────────────────────────────────────────

async function touchPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
    viewport: { width: 1400, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await adminLogin(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type: string, points: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  return { page, context, touch };
}

test("TC-073 touch: a long press then drag creates; a swipe scrolls; a tap previews with a Create button", async ({ browser }) => {
  const { page, context, touch } = await touchPage(browser);
  await open(page, DAY);

  // a swipe (moves before the hold finishes) creates nothing
  let s = await at(page, "yuto", h(13));
  await touch("touchStart", [s]);
  await touch("touchMove", [{ x: s.x, y: s.y + 40 }]);
  await touch("touchEnd", []);
  await page.waitForTimeout(450);
  await expect(preview(page)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);

  // a short tap previews the default block with a Create button; it does not create
  s = await at(page, "yuto", h(14, 5));
  await touch("touchStart", [s]);
  await touch("touchEnd", []);
  await expect(preview(page)).toHaveAttribute("data-kind", "touch");
  await expect(preview(page)).toHaveAttribute("data-start", String(h(14)));
  await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: /^Create booking/ }).click();
  await expect(dialog(page).getByTestId("walkin-range")).toHaveText("2:00 – 2:30 pm · 30 min");
  await dialog(page).getByRole("button", { name: "Close dialog" }).click();

  // press and hold (300 ms), then drag down: the length is set by the drag
  s = await at(page, "yuto", h(11, 5));
  const e = await at(page, "yuto", h(11, 50));
  await touch("touchStart", [s]);
  await page.waitForTimeout(450);
  await touch("touchMove", [{ x: e.x, y: (s.y + e.y) / 2 }]);
  await touch("touchMove", [e]);
  await expect(preview(page)).toHaveAttribute("data-kind", "drag");
  await touch("touchEnd", []);
  await expect(dialog(page).getByTestId("walkin-range")).toHaveText("11:00 am – 12:00 pm · 60 min");
  await context.close();
});

// ── Keyboard ──────────────────────────────────────────────────────────────────

test("TC-074 keyboard: arrows move the highlight, Shift+arrows extend it, Enter opens the form, Escape cancels", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await open(page, DAY);
  const grid = page.getByTestId("timeline-grid");
  await grid.focus();
  await expect(grid).toBeFocused();
  await expect(grid).toHaveAttribute("aria-label", /arrow keys/);

  await page.keyboard.press("ArrowDown"); // the cursor appears at the first column's opening time
  await expect(preview(page)).toHaveAttribute("data-kind", "keyboard");
  await expect(preview(page)).toHaveAttribute("data-start", String(h(10)));
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await expect(preview(page)).toHaveAttribute("data-start", String(h(10, 45)));
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(preview(page)).toHaveAttribute("data-length", "60");
  await expect(page.getByTestId("timeline-announcer")).toContainText("10:45");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(preview(page)).toHaveAttribute("data-length", "45");
  await page.keyboard.press("ArrowRight"); // next stylist
  const first = await page.locator('[data-testid^="timeline-column-"]').first().getAttribute("data-testid");
  const second = await page.locator('[data-testid^="timeline-column-"]').nth(1).getAttribute("data-testid");
  const secondId = second!.replace("timeline-column-", "");
  expect(first).not.toBe(second);

  await page.keyboard.press("Enter");
  const d = dialog(page);
  await expect(d.getByRole("heading", { name: "New Booking" })).toBeVisible();
  expect(await d.locator("select").nth(0).inputValue()).toBe(secondId);
  await expect(d.getByTestId("walkin-range")).toHaveText("10:45 – 11:30 am · 45 min");
  await d.getByRole("button", { name: "Close dialog" }).click();

  // Escape clears the cursor
  await grid.focus();
  await page.keyboard.press("ArrowDown");
  await expect(preview(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(preview(page)).toHaveCount(0);
  await page.context().close();
});

test("TC-075 a keyboard cursor on a booked time cannot be created and says why", async ({ browser }) => {
  await cutAt("a", steve, "Ann Alpha", "10:00 AM", 60);
  const { page } = await newAdminPage(browser);
  await open(page, DAY, 1);
  const grid = page.getByTestId("timeline-grid");
  await grid.focus();
  // find the Steve column: move right until the announcer says Steve
  await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 5; i++) {
    const text = await page.getByTestId("timeline-announcer").innerText();
    if (text.startsWith("Steve")) break;
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.getByTestId("timeline-announcer")).toContainText("Steve");
  await expect(page.getByTestId("timeline-announcer")).toContainText("Already booked");
  await expect(preview(page)).toHaveAttribute("data-valid", "false");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText("Already booked").first()).toBeVisible();
  await page.context().close();
});

test("TC-076 reduced motion: the highlight does not animate", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne",
    viewport: { width: 1400, height: 1000 }, reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await adminLogin(page);
  await open(page, DAY);
  const p = await at(page, "yuto", h(11, 5));
  await page.mouse.move(p.x, p.y);
  await expect(preview(page)).toHaveCount(1);
  expect(await preview(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  await context.close();
});
