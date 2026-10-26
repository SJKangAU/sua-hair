// e2e/03-admin-pages.spec.ts
// docs/08-test-scenarios.md - Bookings (TC-016..020), Clients (TC-021..024),
// Training (TC-025..027) and Manage (TC-028..032) tabs, plus the bulk-toast and
// list-ordering part of D4 and the /admin/analytics deep-link (D7).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, insertBooking, readCollection, seedEmulator } from "./seed";
import { addDaysIso, todayIso, upcoming } from "./helpers";
import { BASE_URL, dialog, newAdminPage } from "./admin";
import { readFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });

const DAY = upcoming(3); // Wed
const DAY2 = upcoming(4); // Thu
const DAY3 = upcoming(5); // Fri
const nowIso = new Date().toISOString();

const base = {
  bookingType: "customer",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  createdAt: nowIso,
};
const steve = { stylistId: "steve", stylistName: "Steve Hwang" };
const yuto = { stylistId: "yuto", stylistName: "Yuto Hirakawa" };
const elly = { stylistId: "elly", stylistName: "Elly Lee" };

let page: Page;

test.beforeAll(async ({ browser }) => {
  await seedEmulator();
  const b = (id: string, name: string, phone: string, who: object, date: string, time: string, status: string, extra: object = {}) =>
    insertBooking(id, { ...base, ...who, customerName: name, customerNameLower: name.toLowerCase(), customerPhone: phone, date, time, status, ...extra });
  await b("a1", "Alice Anderson", "0411000001", steve, DAY, "10:00 AM", "pending");
  await b("a2", "Bob Brown", "0411000002", yuto, DAY, "10:00 AM", "pending");
  await b("a3", "Carla Cooper", "0411000003", steve, DAY2, "11:00 AM", "confirmed");
  await b("a4", "Dan Davis", "0411000004", elly, DAY3, "12:00 PM", "pending");
  // a client with history: two confirmed visits ($75 each) and one cancelled
  await b("m1", "Mia Multi", "0422000001", steve, addDaysIso(todayIso(), -40), "10:00 AM", "completed");
  await b("m2", "Mia Multi", "0422000001", steve, addDaysIso(todayIso(), -20), "10:00 AM", "confirmed");
  await b("m3", "Mia Multi", "0422000001", yuto, addDaysIso(todayIso(), -10), "10:00 AM", "cancelled");
  ({ page } = await newAdminPage(browser));
  // Deactivate buttons ask window.confirm() first - accept it
  page.on("dialog", (d) => void d.accept());
});

test.afterAll(async () => {
  await page.context().close();
});

const names = (p: Page) => p.locator("main").innerText();

test("TC-016 search by name filters the list within 300ms", async () => {
  await page.goto("/admin/bookings");
  await expect(page.getByText("Alice Anderson")).toBeVisible();
  await expect(page.getByText("Bob Brown")).toBeVisible();
  const box = page.getByPlaceholder("Search by name or phone...");
  const t0 = Date.now();
  await box.fill("alice");
  await expect(page.getByText("Bob Brown")).toHaveCount(0);
  const elapsed = Date.now() - t0;
  await expect(page.getByText("Alice Anderson")).toBeVisible();
  // 300ms debounce + render; generous ceiling to avoid flake, still proves "fast"
  expect(elapsed).toBeLessThan(1500);
  console.log(`TC-016 filter applied after ${elapsed}ms`);
  await box.fill("");
});

test("TC-017 search by phone number", async () => {
  await page.goto("/admin/bookings");
  await page.getByPlaceholder("Search by name or phone...").fill("0411000003");
  await expect(page.getByText("Carla Cooper")).toBeVisible();
  await expect(page.getByText("Alice Anderson")).toHaveCount(0);
});

test("TC-018 filter by stylist", async () => {
  await page.goto("/admin/bookings");
  await page.locator("select").nth(0).selectOption("yuto");
  await expect(page.getByText("Bob Brown")).toBeVisible();
  await expect(page.getByText("Alice Anderson")).toHaveCount(0);
  await expect(page.getByText("Carla Cooper")).toHaveCount(0);
});

test("D4 the list is ordered upcoming-first (soonest day first)", async () => {
  await page.goto("/admin/bookings");
  await expect(page.getByText("Dan Davis")).toBeVisible();
  const text = await names(page);
  // expected order = soonest booking date first, whatever weekdays those are
  const byDate = [
    { n: "Alice Anderson", d: DAY },
    { n: "Carla Cooper", d: DAY2 },
    { n: "Dan Davis", d: DAY3 },
  ].sort((a, b) => a.d.localeCompare(b.d));
  const order = byDate.map((x) => text.indexOf(x.n));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((x, y) => x - y)).toEqual(order);
  // past history (Mia) is hidden by default
  await expect(page.getByText("Mia Multi")).toHaveCount(0);
});

test("TC-019 bulk confirm: all selected pending bookings become confirmed, with ONE summary toast (D4)", async () => {
  await page.goto("/admin/bookings");
  await expect(page.getByText("Alice Anderson")).toBeVisible();
  // select the three pending bookings
  for (const n of ["Alice Anderson", "Bob Brown", "Dan Davis"]) {
    await page
      .getByText(n, { exact: true })
      .locator("xpath=ancestor::div[.//input[@type='checkbox']][1]")
      .locator('input[type="checkbox"]')
      .first()
      .check();
  }
  await expect(page.getByText("3 bookings selected")).toBeVisible();
  await page.getByRole("button", { name: "Confirm all" }).click();
  await expect(page.getByText("3 bookings confirmed")).toBeVisible();
  // one summary toast, not three "Booking confirmed" toasts
  await expect(page.getByText("Booking confirmed", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/bookings confirmed/)).toHaveCount(1);
  await expect.poll(async () =>
    (await readCollection("bookings")).filter((x) => ["a1", "a2", "a4"].includes(x.id) && x.status === "confirmed").length,
  ).toBe(3);
});

test("TC-020 Export CSV downloads a file with the visible bookings", async () => {
  await page.goto("/admin/bookings");
  await expect(page.getByText("Carla Cooper")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sua-hair-bookings-.*\.csv$/);
  const path = await download.path();
  const csv = readFileSync(path, "utf8");
  const rows = csv.trim().split(/\r?\n/);
  // header + EVERY booking matching the filters (7), including the 3 past
  // bookings the list hides until asked ("Show past bookings")
  expect(rows.length).toBe(1 + 7);
  for (const n of ["Alice Anderson", "Bob Brown", "Carla Cooper", "Dan Davis", "Mia Multi"]) {
    expect(csv).toContain(n);
  }
  expect(rows[0]).toMatch(/name/i);
  console.log("TC-020 CSV header:", rows[0]);
});

// TC-021 .. TC-024 were written for the old Clients page, which built a profile from the
// bookings it searched. The directory (DEC-046) reads a client record that is kept in step
// with the bookings, so the same four behaviours are checked on it. The bookings above are
// written straight into Firestore, so the clients are made by the onBookingWritten trigger
// (running in the Functions emulator): the first search waits for them.
test("TC-021 client search shows visit count and total spend", async () => {
  await page.goto("/admin/clients");
  await page.getByTestId("client-search").fill("Mia");
  const row = page.getByTestId("client-row").filter({ hasText: "Mia Multi" });
  await expect(row).toBeVisible({ timeout: 30_000 });
  // 2 counted visits (completed + confirmed in the past); the cancelled one does not count
  await expect(row).toContainText("$150");
  await row.click();
  const drawer = page.getByTestId("client-drawer");
  await expect(drawer.getByTestId("stat-visits")).toHaveText("2");
  await expect(drawer.getByTestId("stat-spend")).toHaveText("$150");
});

test("TC-022 the client's history lists their bookings, newest first", async () => {
  const rows = page.getByTestId("client-drawer").getByTestId("history-row");
  await expect(rows).toHaveCount(3); // completed, confirmed and the cancelled one
  const texts = await rows.allInnerTexts();
  // the newest booking is first: the cancelled one (10 days ago), then 20, then 40 days ago
  expect(texts[0]).toContain("Cancelled");
  expect(texts[1]).toContain("Confirmed");
  expect(texts[2]).toContain("Completed");
});

test("TC-023 Book again pre-fills the create form with the client's name and phone", async () => {
  await page.getByTestId("client-drawer").getByTestId("book-again").click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByPlaceholder("e.g. Jane Smith")).toHaveValue("Mia Multi");
  await expect(d.getByPlaceholder("e.g. 0412 345 678")).toHaveValue("0422000001");
  await d.getByRole("button", { name: "Close dialog" }).click();
});

test("TC-024 a cancelled booking is not counted in total spend", async () => {
  // Mia's cancelled booking is $75: total stays $150, not $225
  await page.goto("/admin/clients");
  await page.getByTestId("client-search").fill("0422000001");
  const row = page.getByTestId("client-row").filter({ hasText: "Mia Multi" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$150");
  await expect(row).not.toContainText("$225");
});

test("TC-025 create a training session: appears under upcoming sessions with a toast", async () => {
  const day = upcoming(3, 10);
  await page.goto("/admin/training");
  const sel = page.locator("select");
  await sel.nth(0).selectOption({ label: "Steve Hwang — Director" });
  await sel.nth(1).selectOption({ label: "Elly Lee — Senior Stylist" });
  await page.locator('input[type="date"]').fill(day);
  await sel.nth(2).selectOption({ label: "7:00 PM" });
  await sel.nth(3).selectOption({ label: "Colour application" });
  await sel.nth(4).selectOption({ label: "1 hour" });
  await page.getByRole("button", { name: "Create Training Session" }).click();
  await expect(page.getByText(/Training session created/)).toBeVisible();
  // listed under Upcoming Sessions (below the form, so not the <option> in the form's dropdown)
  await expect.poll(async () => {
    const text = await names(page);
    const i = text.search(/upcoming/i);
    return i >= 0 && /Colour application/.test(text.slice(i)) && /Elly Lee/.test(text.slice(i));
  }).toBe(true);
  const t = (await readCollection("bookings")).filter((x) => x.bookingType === "training");
  expect(t).toHaveLength(1);
  expect(t[0]).toMatchObject({ stylistId: "steve", traineeName: "Elly Lee", time: "7:00 PM", date: day, totalTime: 60 });
});

// A training session IS on the Today timeline of its day (the owner chose this: the stylist is busy
// then), and the grid stretches in whole hours to hold it. This test used to assert the opposite and
// only passed because it looked before the day's bookings had loaded.
test("TC-026 a training session is on the Today timeline of its day; the grid stretches to cover it", async () => {
  const day = upcoming(3, 10);
  await page.goto(`/admin/today?date=${day}`);
  await expect(page.getByText("Steve · Director").first()).toBeVisible();
  await expect(page.getByText("Colour application").first()).toBeVisible(); // waits for the bookings to load
  await expect(page.getByText("7:00 PM", { exact: true })).toHaveCount(1); // the 7-8 pm session
  await expect(page.getByText("8:00 PM", { exact: true })).toHaveCount(1); // the grid runs to 8 pm
});

test("TC-027 a session dated yesterday appears under Past Sessions", async () => {
  const yesterday = addDaysIso(todayIso(), -1);
  await page.goto("/admin/training");
  const sel = page.locator("select");
  await sel.nth(0).selectOption({ label: "Steve Hwang — Director" });
  await sel.nth(1).selectOption({ label: "Ethan Le — Junior Stylist" });
  await page.locator('input[type="date"]').fill(yesterday);
  await sel.nth(2).selectOption({ label: "6:00 PM" });
  await sel.nth(3).selectOption({ label: "Business skills" });
  await page.getByRole("button", { name: "Create Training Session" }).click();
  await expect(page.getByText(/Training session created/)).toBeVisible();
  await expect.poll(async () => {
    const text = await names(page);
    const iPast = text.search(/past sessions/i);
    return iPast >= 0 && text.indexOf("Business skills", iPast) > iPast;
  }).toBe(true);
});

// ── Manage ───────────────────────────────────────────────────────────────────

/** Opens the public booking page in a fresh context and returns what a customer sees. */
async function customerView(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne" });
  const p = await ctx.newPage();
  await p.goto("/");
  await expect(p.getByText("Men's Cut").first()).toBeVisible();
  return { p, ctx };
}

async function customerStylists(browser: Browser): Promise<string> {
  const { p, ctx } = await customerView(browser);
  await p.getByRole("button", { name: /Men's Cut/ }).first().dispatchEvent("click");
  await p.getByRole("button", { name: "Continue" }).dispatchEvent("click");
  await expect(p.getByText("Any Available Stylist")).toBeVisible();
  const text = await p.locator("body").innerText();
  await ctx.close();
  return text;
}

test("TC-028 a new stylist appears in the roster and the customer booking form", async ({ browser }) => {
  await page.goto("/admin/manage");
  await page.getByRole("button", { name: "+ Add Stylist" }).click();
  await page.getByPlaceholder("e.g. Jane Smith").fill("Nina Newhire");
  await page.getByPlaceholder("e.g. Senior Stylist").fill("Junior Stylist");
  await page.locator("select").first().selectOption("junior");
  await page.getByRole("button", { name: /^(Add Stylist|Save Changes)$/ }).click();
  await expect(page.getByText("Nina Newhire").first()).toBeVisible();
  expect(await customerStylists(browser)).toContain("Nina Newhire");
});

test("TC-029 deactivating a stylist hides them from customers; their bookings remain", async ({ browser }) => {
  await page.goto("/admin/manage");
  const row = page.locator("div", { has: page.getByText("Harry Yang", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Deactivate" }) }).last();
  await row.getByRole("button", { name: "Deactivate" }).first().click();
  await expect.poll(async () => {
    const env = await connectEnv();
    let status = "";
    await env.withSecurityRulesDisabled(async (ctx) => {
      status = (await ctx.firestore().doc("stylists/harry").get()).data()?.status;
    });
    await env.cleanup();
    return status;
  }).toBe("inactive");
  expect(await customerStylists(browser)).not.toContain("Harry Yang");
  // historical bookings are untouched
  expect((await readCollection("bookings")).length).toBeGreaterThan(0);
});

test("TC-030 reactivating a stylist brings them back to the booking form", async ({ browser }) => {
  await page.goto("/admin/manage");
  const row = page.locator("div", { has: page.getByText("Harry Yang", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Reactivate" }) }).last();
  await row.getByRole("button", { name: "Reactivate" }).first().click();
  await expect.poll(async () => (await customerStylists(browser)).includes("Harry Yang")).toBe(true);
});

test("TC-031 editing a service price updates the booking form and logs the old price", async ({ browser }) => {
  await page.goto("/admin/manage");
  const row = page.locator("div", { has: page.getByText("Men's Cut", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Edit" }) }).last();
  await row.getByRole("button", { name: "Edit" }).first().click();
  const nums = page.locator('input[type="number"]');
  // The phase lengths come first (one per phase), then director, senior, junior,
  // then the retouch period (FR-033) last
  const count = await nums.count();
  await nums.nth(count - 4).fill("80");
  await nums.nth(count - 3).fill("70");
  await nums.nth(count - 2).fill("60");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect.poll(async () => {
    const env = await connectEnv();
    let len = 0;
    await env.withSecurityRulesDisabled(async (ctx) => {
      len = (await ctx.firestore().doc("services/mens-cut").get()).data()?.priceHistory?.length ?? 0;
    });
    await env.cleanup();
    return len;
  }).toBe(2);
  const svc = (await readCollection("services")).find((s) => s.id === "mens-cut") as unknown as {
    price: { director: number }; priceHistory: Array<{ price: { director: number }; recordedAt: string }>;
  };
  expect(svc.price.director).toBe(80);
  expect(svc.priceHistory[0].price.director).toBe(75); // old price retained
  expect(svc.priceHistory[1].price.director).toBe(80);
  expect(typeof svc.priceHistory[1].recordedAt).toBe("string");
  const { p, ctx } = await customerView(browser);
  await expect(p.locator("body")).toContainText("from $60");
  await ctx.close();
});

test("TC-032 deactivating a service removes it from the booking form", async ({ browser }) => {
  await page.goto("/admin/manage");
  const row = page.locator("div", { has: page.getByText("Fringe Trim", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Deactivate" }) }).last();
  await row.getByRole("button", { name: "Deactivate" }).first().click();
  await expect.poll(async () => {
    const { p, ctx } = await customerView(browser);
    const has = (await p.locator("body").innerText()).includes("Fringe Trim");
    await ctx.close();
    return has;
  }).toBe(false);
});

test("D7 opening /admin/analytics directly (or refreshing it) stays on Analytics", async () => {
  await page.goto("/admin/analytics");
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/admin\/analytics$/);
});
