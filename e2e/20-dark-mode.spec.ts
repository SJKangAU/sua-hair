// e2e/20-dark-mode.spec.ts
// Admin dark mode: the toggle in the sidebar (desktop) and the More sheet (phone)
// flips the theme, the choice survives a reload, and the customer pages never
// pick it up.
import { expect, test } from "@playwright/test";
import { seedEmulator } from "./seed";
import { newAdminPage } from "./admin";

test.describe.configure({ mode: "serial" });

const theme = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? "");
const pageBg = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeAll(async () => {
  await seedEmulator();
});

test("desktop: toggle, persist across reload, and stay out of the booking site", async ({ browser }) => {
  const { page, consoleMessages } = await newAdminPage(browser);
  await page.goto("/admin/today");
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeVisible();
  expect(await theme(page)).toBe("light");
  expect(await pageBg(page)).toBe("rgb(250, 249, 247)");

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.getByRole("button", { name: "Light mode" })).toBeVisible();
  expect(await theme(page)).toBe("dark");
  expect(await pageBg(page)).toBe("rgb(18, 18, 17)");

  // the sidebar keeps its own (dark) look: its brand text must still be light
  const navColor = await page.locator(".adm-nav-link").first().evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = navColor.match(/\d+/g)!.map(Number);
  expect(r + g + b).toBeGreaterThan(450);

  await page.screenshot({ path: "test-results/dark-today.png" });
  for (const path of ["approvals", "bookings", "clients", "analytics", "manage"]) {
    await page.goto(`/admin/${path}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/dark-${path}.png` });
  }

  await page.reload();
  await expect(page.getByRole("button", { name: "Light mode" })).toBeVisible();
  expect(await theme(page)).toBe("dark");

  // leaving the admin shell hands the page back to light
  await page.getByRole("link", { name: "View booking site" }).click();
  await expect(page.getByRole("heading", { name: /choose|services|book/i }).first()).toBeVisible();
  expect(await theme(page)).toBe("");

  // back in the admin, then switch it off again
  await page.goto("/admin/today");
  await page.getByRole("button", { name: "Light mode" }).click();
  expect(await theme(page)).toBe("light");
  expect(await pageBg(page)).toBe("rgb(250, 249, 247)");
  expect(consoleMessages.filter((m) => m.startsWith("[error]"))).toEqual([]);
});

test("phone: the More sheet has the toggle", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin/today");
  await page.getByRole("button", { name: /more/i }).click();
  await page.getByRole("button", { name: "Dark mode" }).click();
  expect(await theme(page)).toBe("dark");
  await page.screenshot({ path: "test-results/dark-phone-more.png" });
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({ path: "test-results/dark-phone-today.png" });
});
