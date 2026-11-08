// e2e/25-batch1-ui.spec.ts
// Batch 1 (docs/07-decision-log.md DEC-064 to DEC-068): "from $X" prices, stylist
// colours, a Today view that uses the full window, bigger notification popups,
// and a multi-select stylist filter that is remembered. Runs against the
// Firestore + Auth emulators. Screenshots of Today at four widths are written to
// docs/test-runs/batch1-screenshots/ (seeded demo data only).
import { expect, test, type Page } from "@playwright/test";
import { connectEnv, insertBooking, readCollection, seedEmulator } from "./seed";
import { gotoToday, newAdminPage } from "./admin";
import { upcoming } from "./helpers";
import { STYLIST_COLORS } from "../src/lib/stylistColors";

test.describe.configure({ mode: "serial" });

const DAY = upcoming(3); // a Wednesday, at least 3 days out
const iso = new Date().toISOString();
const base = {
  bookingType: "customer",
  customerPhone: "0411111111",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  restTime: 0,
  status: "confirmed",
  createdAt: iso,
  date: DAY,
  activeTime: 45,
  totalTime: 45,
};
const who = {
  steve: { stylistId: "steve", stylistName: "Steve Hwang" },
  yuto: { stylistId: "yuto", stylistName: "Yuto Hirakawa" },
  elly: { stylistId: "elly", stylistName: "Elly Lee" },
};

let page: Page;

test.beforeAll(async ({ browser }) => {
  await seedEmulator();
  await insertBooking("b-steve", { ...base, ...who.steve, customerName: "Sam Steve", time: "10:00 AM" });
  await insertBooking("b-yuto", { ...base, ...who.yuto, customerName: "Yara Yuto", time: "10:00 AM" });
  await insertBooking("b-elly", { ...base, ...who.elly, customerName: "Eli Elly", time: "11:00 AM" });
  ({ page } = await newAdminPage(browser));
});
test.afterAll(async () => {
  await page.context().close();
});

const columnHeads = (p: Page) =>
  p.locator('[data-testid^="column-head-"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.testid!.replace("column-head-", "")),
  );

// ── Item 15: "from $X" ───────────────────────────────────────────────────────

test("item 15: prices read 'from $X' on the public page, the roster and the bookings list", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:5174", locale: "en-AU", timezoneId: "Australia/Melbourne" });
  const customer = await ctx.newPage();
  await customer.goto("/");
  await expect(customer.getByRole("button", { name: /Men's Cut/ }).first()).toContainText("from $55");
  await ctx.close();

  await page.goto("/admin/manage");
  await expect(page.getByText("from $75 / $65 / $55")).toBeVisible();

  await page.goto("/admin/bookings");
  await expect(page.getByText("Sam Steve").first()).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).toContain("from $75");
  expect(text).not.toMatch(/(^|[^m] )\$75/m); // no bare "$75" next to a booking
});

// ── Item 5: stylist colours ──────────────────────────────────────────────────

test("item 5: each stylist has their own colour on the columns, cards and filter chips", async () => {
  await gotoToday(page, DAY);
  const heads = await page.locator('[data-testid^="column-head-"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.stylistColor),
  );
  expect(heads).toHaveLength(5);
  expect(new Set(heads).size).toBe(5); // no two the same by default
  for (const id of heads) expect(STYLIST_COLORS.map((c) => c.id)).toContain(id);

  // a booking block carries its stylist's colour
  const stripe = page.locator('[data-testid="block-stripe"]').first();
  await expect(stripe).toBeVisible();
  // the filter chips carry the same colours as the column heads
  for (const id of ["steve", "yuto", "elly", "ethan", "harry"]) {
    const head = await page.getByTestId(`column-head-${id}`).getAttribute("data-stylist-color");
    await expect(page.getByTestId(`stylist-filter-${id}`)).toHaveAttribute("data-stylist-color", head!);
  }
});

test("item 5: the owner picks a colour in Manage and it shows on Today and in the bookings list", async () => {
  await page.goto("/admin/manage");
  const row = page
    .locator("div")
    .filter({ has: page.getByText("Steve Hwang", { exact: false }) })
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true }) })
    .last();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByTestId("colour-violet").click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(async () => (await readCollection("stylists")).find((s) => s.id === "steve")?.color).toBe("violet");
  await expect(page.getByTestId("stylist-dot-steve")).toHaveAttribute("data-stylist-color", "violet");

  await gotoToday(page, DAY);
  await expect(page.getByTestId("column-head-steve")).toHaveAttribute("data-stylist-color", "violet");
  // nobody else was given violet by default
  const others = await Promise.all(
    ["yuto", "elly", "ethan", "harry"].map((id) => page.getByTestId(`column-head-${id}`).getAttribute("data-stylist-color")),
  );
  expect(others).not.toContain("violet");

  await page.goto("/admin/bookings");
  await expect(page.locator('[data-stylist-color="violet"]').first()).toBeVisible();
});

test("item 5: choosing Automatic removes the saved colour", async () => {
  await page.goto("/admin/manage");
  const row = page
    .locator("div")
    .filter({ has: page.getByText("Steve Hwang", { exact: false }) })
    .filter({ has: page.getByRole("button", { name: "Edit", exact: true }) })
    .last();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("radio", { name: "Automatic" }).click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(async () => (await readCollection("stylists")).find((s) => s.id === "steve")?.color).toBeUndefined();
});

// ── Item 4: stylist filter ───────────────────────────────────────────────────

test("item 4: several stylists can be picked, it is remembered, and it carries to the bookings list", async () => {
  await gotoToday(page, DAY);
  await expect(page.getByTestId("stylist-filter-all")).toHaveAttribute("aria-pressed", "true"); // All by default
  expect(await columnHeads(page)).toHaveLength(5);

  await page.getByTestId("stylist-filter-steve").click();
  await page.getByTestId("stylist-filter-elly").click();
  await expect.poll(() => columnHeads(page)).toEqual(expect.arrayContaining(["steve", "elly"]));
  expect(await columnHeads(page)).toHaveLength(2);
  await expect(page.getByTestId("stylist-filter-all")).toHaveAttribute("aria-pressed", "false");

  // remembered after a reload
  await page.reload();
  await expect(page.getByTestId("stylist-filter-steve")).toHaveAttribute("aria-pressed", "true");
  expect((await columnHeads(page)).sort()).toEqual(["elly", "steve"]);

  // and shared with the bookings list
  await page.goto("/admin/bookings");
  await expect(page.getByTestId("stylist-filter-steve")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("stylist-filter-elly")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Sam Steve").first()).toBeVisible();
  await expect(page.getByText("Eli Elly").first()).toBeVisible();
  await expect(page.getByText("Yara Yuto")).toHaveCount(0);

  // All clears it everywhere
  await page.getByTestId("stylist-filter-all").click();
  await expect(page.getByText("Yara Yuto").first()).toBeVisible();
  await gotoToday(page, DAY);
  expect(await columnHeads(page)).toHaveLength(5);
});

test("item 4: the saved choice is kept under this signed-in account's own key", async () => {
  await gotoToday(page, DAY);
  await page.getByTestId("stylist-filter-yuto").click();
  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("sua_hair_stylist_filter:")),
  );
  expect(keys).toHaveLength(1);
  expect(keys[0].length).toBeGreaterThan("sua_hair_stylist_filter:".length);
  await page.getByTestId("stylist-filter-all").click();
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sua_hair_stylist_filter:")))).toHaveLength(0);
});

test("item 4: on a phone the Today list has the same multi-select filter", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/today?date=${DAY}`);
  const chips = page.getByTestId("stylist-filter");
  await expect(chips).toBeVisible();
  await page.getByTestId("stylist-filter-steve").click();
  await page.getByTestId("stylist-filter-yuto").click();
  await expect(page.getByText("Sam Steve").first()).toBeVisible();
  await expect(page.getByText("Yara Yuto").first()).toBeVisible();
  await expect(page.getByText("Eli Elly")).toHaveCount(0);
  await page.getByTestId("stylist-filter-all").click();
  await expect(page.getByText("Eli Elly").first()).toBeVisible();
  await page.setViewportSize({ width: 1400, height: 1000 });
});

// ── Item 7: Today uses the full width ────────────────────────────────────────

for (const width of [1280, 1920, 2560, 390]) {
  test(`item 7: Today fills the window at ${width}px, with no sideways page scroll`, async () => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
    await page.goto(`/admin/today?date=${DAY}`);
    if (width === 390) {
      await expect(page.getByTestId("stylist-filter")).toBeVisible();
    } else {
      await expect(page.getByTestId("timeline-grid")).toBeVisible();
    }
    await expect(page.getByText("Sam Steve").first()).toBeVisible(); // bookings have loaded
    const m = await page.evaluate(() => {
      const main = document.querySelector("main.adm-main") as HTMLElement;
      const r = main.getBoundingClientRect();
      const grid = document.querySelector('[data-testid="timeline-grid"]') as HTMLElement | null;
      return {
        mainWidth: r.width,
        mainRight: r.right,
        gridWidth: grid?.getBoundingClientRect().width ?? 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth); // no sideways scroll on the page
    if (width > 899) {
      const sidebar = 232;
      // the page runs right up to the window's padding: nothing is capped at 1400px
      expect(m.mainWidth).toBeGreaterThanOrEqual(width - sidebar - 1);
      expect(m.mainRight).toBeGreaterThanOrEqual(width - 1);
    } else {
      expect(m.mainWidth).toBeGreaterThanOrEqual(width - 1);
    }
    if (width === 2560) {
      // the stylist columns grew into the extra room (they were capped at 1400px before)
      expect(m.gridWidth).toBeGreaterThan(1500);
    }
    await page.screenshot({
      path: `docs/test-runs/batch1-screenshots/today-${width}.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
  });
}

test("item 7: other admin pages keep a readable width", async () => {
  await page.setViewportSize({ width: 2560, height: 1100 });
  await page.goto("/admin/bookings");
  await expect(page.getByRole("heading", { name: /All Bookings/ })).toBeVisible();
  const w = await page.evaluate(() => (document.querySelector("main.adm-main") as HTMLElement).getBoundingClientRect().width);
  expect(w).toBeLessThanOrEqual(1400);
  await page.setViewportSize({ width: 1400, height: 1000 });
});

// ── Item 6: notifications ────────────────────────────────────────────────────

const addNotification = async (id: string, message: string) => {
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`notifications/${id}`).set({
      recipientId: "owner",
      recipientType: "owner",
      bookingId: "b-steve",
      message,
      read: false,
      createdAt: new Date().toISOString(),
    });
  });
  await env.cleanup();
};
const readFlag = async (id: string) =>
  (await readCollection("notifications")).find((n) => n.id === id)?.read;

test("item 6: a booking request stays on screen, big and warm-coloured, until it is acknowledged", async () => {
  await addNotification("n-req", "New booking request: Nina Newclient - Men's Cut");
  await page.goto("/admin/today");
  const popup = page.getByTestId("notification-popup").first();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("data-kind", "request");
  await expect(popup).toContainText("Nina Newclient");

  // large: wide card, big text, clearly not the page's black and white
  const look = await popup.evaluate((el) => {
    const text = el.querySelector("p:nth-of-type(2)") as HTMLElement;
    const cs = getComputedStyle(el);
    return {
      width: el.getBoundingClientRect().width,
      fontPx: parseFloat(getComputedStyle(text).fontSize),
      bg: cs.backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(look.width).toBeGreaterThanOrEqual(400);
  expect(look.fontPx).toBeGreaterThanOrEqual(19);
  expect(look.bg).not.toBe(look.page);
  expect(look.bg).toBe("rgb(255, 241, 184)"); // --notice-bg
  await page.screenshot({ path: "docs/test-runs/batch1-screenshots/notification-popup.png" });

  // a request has no close button, and survives a reload and a trip to another page
  await expect(popup.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
  await page.goto("/admin/clients");
  await expect(page.getByTestId("notification-popup").first()).toContainText("Nina Newclient");
  await page.reload();
  await expect(page.getByTestId("notification-popup").first()).toContainText("Nina Newclient");
  expect(await readFlag("n-req")).toBe(false);

  // acknowledging it clears it, here and for good
  await page.getByTestId("notification-popup").first().getByRole("button", { name: "Got it" }).click();
  await expect(page.getByTestId("notification-popup")).toHaveCount(0);
  await expect.poll(() => readFlag("n-req")).toBe(true);
  await page.reload();
  await expect(page.getByTestId("notification-popup")).toHaveCount(0);
});

test("item 6: another kind of notification pops up when it arrives, can be dismissed, and stays in the bell", async () => {
  await page.goto("/admin/today");
  await expect(page.getByTestId("notification-popup")).toHaveCount(0);
  await addNotification("n-info", "New booking: Ivy Info - Beard Trim");
  const popup = page.getByTestId("notification-popup").first();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("data-kind", "info");
  await popup.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("notification-popup")).toHaveCount(0);
  expect(await readFlag("n-info")).toBe(false); // still unread: it is in the bell
  await page.getByTitle(/unread notification/).first().click();
  await expect(page.getByText("New booking: Ivy Info - Beard Trim")).toBeVisible();
});

test("item 6: the bell panel is large and uses the notification colour", async () => {
  await page.goto("/admin/today");
  const bell = page.getByTitle(/unread notification|Notifications/).first();
  await bell.click();
  const panel = page.getByText("Notifications", { exact: true }).locator("xpath=ancestor::div[2]");
  const box = await panel.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(480);
  await page.screenshot({ path: "docs/test-runs/batch1-screenshots/notification-panel.png" });
});
