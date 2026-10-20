// e2e/08-phases.spec.ts
// Phases (DEC-026) through the real UI against the Firebase emulators: a service
// with hands-on / processing / return phases, the customer page offering only
// starts where every busy block is free, the timeline drawing the processing
// gap, the owner editing ONE booking's phases (live end time, conflict refusal
// naming the clash, "move the return to the next free time"), service defaults
// editing, and phases chosen when a walk-in is created.
import { expect, test } from "@playwright/test";
import {
  connectEnv,
  insertPhasedBooking,
  readCollection,
  seedEmulator,
} from "./seed";
import { chooseSlotOnline, slotButton, upcoming } from "./helpers";
import {
  dialog,
  fillWalkin,
  gotoToday,
  newAdminPage,
  openNewBooking,
  submitWalkin,
} from "./admin";

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

test.use({ viewport: { width: 1300, height: 1500 } });

const DAY = upcoming(3, 3); // a Wednesday
const A = (minutes: number) => ({ type: "active" as const, minutes });
const R = (minutes: number) => ({ type: "rest" as const, minutes });
const h = (hour: number, min = 0) => hour * 60 + min;

const base = {
  bookingType: "customer",
  status: "confirmed",
  customerPhone: "0411111111",
  stylistId: "steve",
  stylistName: "Steve Hwang",
  stylistLevel: "director",
  serviceId: "digital-perm",
  serviceName: "Digital Perm",
  servicePrice: 300,
  date: DAY,
  createdAt: new Date().toISOString(),
};

const perm = (over: Record<string, unknown> = {}) => ({
  ...base,
  customerName: "Pam Perm",
  time: "10:00 AM",
  ...over,
});
const cut = (name: string, time: string) => ({
  ...base,
  customerName: name,
  serviceId: "ladies-cut",
  serviceName: "Ladies Cut",
  time,
});

const booking = async (id: string) =>
  (await readCollection("bookings")).find((b) => b.id === id) as unknown as Doc;
const slot = async (id: string) =>
  (await readCollection("slotBlocks")).find((b) => b.id === id) as unknown as Doc;

test.beforeEach(async () => {
  await seedEmulator();
});

test("the customer page lists a service's phases and offers only starts where every busy block is free", async ({ page }) => {
  // Steve is booked 11:15 - 11:45: the perm's return block (11:30 - 12:00 from a 10:00 start) would land on it
  await insertPhasedBooking("other", cut("Other Client", "11:15 AM"), h(11, 15), [A(30)]);

  await page.goto("/");
  await expect(page.locator("body")).toContainText("60 hands-on + 30 processing + 30 return");

  await chooseSlotOnline(page, { services: ["Digital Perm"], stylist: "Steve", date: DAY });
  await expect(slotButton(page, "10:00 AM")).toHaveAttribute("aria-disabled", "true"); // return block on the other booking
  await expect(slotButton(page, "11:00 AM")).toHaveAttribute("aria-disabled", "true"); // hands-on block on it
  await expect(slotButton(page, "10:15 AM")).toHaveAttribute("aria-disabled", "false"); // busy 10:15-11:15 and 11:45-12:15

  await slotButton(page, "10:15 AM").hover();
  await expect(page.getByTestId("bk-preview-label")).toHaveText("10:15 am – 12:15 pm");
  const phases = await page
    .locator(".bk-day-block > div")
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.phase));
  expect(phases).toEqual(["active", "rest", "active"]); // solid, hatched, solid
});

test("the timeline draws the processing gap between the hands-on and the return", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  const bands = page.getByTestId("processing-band");
  await expect(bands).toHaveCount(1);
  await expect(bands.first()).toContainText("back 11:30 AM");
  // the band sits in the middle of the block (hands-on above it AND below it)
  const block = await page.getByText("Pam Perm").first().evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && !n.classList.contains("tl-block")) n = n.parentElement;
    const r = n!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  const band = (await bands.first().boundingBox())!;
  expect(band.y).toBeGreaterThan(block.top + 20);
  expect(band.y + band.height).toBeLessThan(block.bottom - 20);
  await page.context().close();
});

test("the owner changes ONE booking's phases: live end time, saved to the booking and its projection, service untouched", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  const servicesBefore = await readCollection("services");
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await page.getByText("Pam Perm").first().click();
  await page.getByRole("button", { name: "View details" }).click();

  const end = page.getByTestId("phase-end-time");
  await expect(end).toContainText("10:00 AM – 12:00 PM");
  await page.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  await expect(end).toContainText("10:00 AM – 12:15 PM"); // live
  await expect(end).toContainText("stylist back at 11:45 AM");
  await expect(page.getByRole("spinbutton", { name: "Processing minutes" })).toHaveValue("45");

  await page.getByRole("button", { name: "Lengthen return by 15 minutes" }).click();
  await expect(end).toContainText("10:00 AM – 12:30 PM");
  await page.getByRole("button", { name: "Shorten return by 15 minutes" }).click();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();

  await expect.poll(async () => (await booking("pam")).phases).toEqual([A(60), R(45), A(30)]);
  const saved = await booking("pam");
  expect(saved.totalTime).toBe(135);
  expect(saved.segments.at(-1)).toMatchObject({ type: "active", start: h(11, 45), end: h(12, 15) });
  expect(saved.servicePrice).toBe(300); // price untouched
  const proj = await slot("pam");
  expect(proj.busy).toEqual([{ start: h(10), end: h(11) }, { start: h(11, 45), end: h(12, 15) }]);
  expect(JSON.stringify(proj)).not.toMatch(/Pam|0411111111/);
  // the service the booking came from is untouched
  expect(await readCollection("services")).toEqual(servicesBefore);
  await page.context().close();
});

test("shortening processing while another client is booked in the gap is refused, naming them", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  await insertPhasedBooking("gary", cut("Gap Gary", "11:00 AM"), h(11), [A(30)]);
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await page.getByText("Pam Perm").first().click();
  await page.getByRole("button", { name: "View details" }).click();

  await page.getByRole("button", { name: "Shorten processing by 15 minutes" }).click();
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toContainText("Gap Gary");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect((await booking("pam")).phases).toEqual([A(60), R(30), A(30)]); // nothing saved
  await page.context().close();
});

test("an edit that collides offers to move the return to the next free time", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  await insertPhasedBooking("lee", cut("Later Lee", "12:00 PM"), h(12), [A(60)]); // busy 12:00-13:00
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await page.getByText("Pam Perm").first().click();
  await page.getByRole("button", { name: "View details" }).click();

  // processing 30 -> 60 puts the return block on 12:00-12:30, onto Later Lee
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  }
  await expect(dialog(page).getByRole("alert")).toContainText("Later Lee");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await page.getByRole("button", { name: "Move the return to the next free time" }).click();
  // processing 120: the return block starts as Later Lee finishes (13:00)
  await expect(page.getByRole("spinbutton", { name: "Processing minutes" })).toHaveValue("120");
  await expect(dialog(page).getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect.poll(async () => (await booking("pam")).phases).toEqual([A(60), R(120), A(30)]);
  await page.context().close();
});

test("minimums: hands-on at least 15, 15-minute steps, and the booking must end before closing", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await page.getByText("Pam Perm").first().click();
  await page.getByRole("button", { name: "View details" }).click();

  const handsOn = page.getByRole("spinbutton", { name: "Hands-on minutes" });
  const processing = page.getByRole("spinbutton", { name: "Processing minutes" });
  const save = page.getByRole("button", { name: "Save changes" });
  const alert = dialog(page).getByRole("alert");

  await handsOn.fill("0");
  await expect(alert).toContainText("at least 15 minutes");
  await expect(save).toBeDisabled();
  await handsOn.fill("20");
  await expect(alert).toContainText("15-minute steps");
  await handsOn.fill("60");
  await expect(alert).toHaveCount(0);

  await processing.fill("0"); // processing may be 0
  await expect(alert).toHaveCount(0);
  await expect(save).toBeEnabled();

  await processing.fill("420"); // 10:00 + 60 + 420 + 30 = 8:00 PM, after the 6:00 PM close
  await expect(alert).toContainText("past closing");
  await expect(save).toBeDisabled();
  await page.context().close();
});

test("Manage: the owner edits a service's default phases; existing bookings keep theirs", async ({ browser }) => {
  await insertPhasedBooking("pam", perm(), h(10), [A(60), R(30), A(30)]);
  const { page } = await newAdminPage(browser);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/admin/manage");
  const row = page
    .locator("div", { has: page.getByText("Digital Perm", { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Edit" }) })
    .last();
  await row.getByRole("button", { name: "Edit" }).first().click();

  // the three default phases are editable in 15-minute steps
  await expect(page.getByTestId("phase-row-0")).toContainText("Hands-on");
  await expect(page.getByTestId("phase-row-1")).toContainText("Processing");
  await expect(page.getByTestId("phase-row-2")).toContainText("Return");
  await page.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  await page.getByRole("button", { name: "Lengthen return by 15 minutes" }).click();
  await expect(page.getByText("Total appointment time:")).toContainText("150 min");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect.poll(async () => {
    const svc = (await readCollection("services")).find((s) => s.id === "digital-perm") as unknown as Doc;
    return svc.phases;
  }).toEqual([A(60), R(45), A(45)]);
  const svc = (await readCollection("services")).find((s) => s.id === "digital-perm") as unknown as Doc;
  expect(svc.totalTime).toBe(150);
  expect(svc.activeTime).toBe(105);
  expect(svc.restTime).toBe(45);
  expect(svc.priceHistory).toHaveLength(1); // price history behaviour unchanged (no price change)
  // new bookings only: Pam's own phases are as they were
  expect((await booking("pam")).phases).toEqual([A(60), R(30), A(30)]);
  await page.context().close();
});

test("a walk-in can have its phases adjusted when it is created", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await gotoToday(page, DAY);
  await openNewBooking(page);
  await fillWalkin(page, {
    name: "Wendy Walkin",
    stylistId: "steve",
    services: ["Digital Perm"],
    date: DAY,
    time: "10:00 AM",
  });
  await dialog(page).getByRole("button", { name: "Adjust phases" }).click();
  await page.getByRole("button", { name: "Lengthen processing by 15 minutes" }).click();
  await expect(dialog(page)).toContainText("10:00 AM – 12:15 PM");
  await submitWalkin(page);
  await expect(page.getByText("Walk-in booking created for Wendy Walkin")).toBeVisible();

  const b = (await readCollection("bookings")).find((x) => x.customerName === "Wendy Walkin") as unknown as Doc;
  expect(b.phases).toEqual([A(60), R(45), A(30)]);
  expect(b.totalTime).toBe(135);
  // the service default is still 60 / 30 / 30
  const env = await connectEnv();
  let svcPhases: unknown;
  await env.withSecurityRulesDisabled(async (ctx) => {
    svcPhases = (await ctx.firestore().doc("services/digital-perm").get()).data()?.phases;
  });
  await env.cleanup();
  expect(svcPhases).toEqual([A(60), R(30), A(30)]);
  await page.context().close();
});
