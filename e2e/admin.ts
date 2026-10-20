// e2e/admin.ts
// Helpers for driving the owner/admin screens.
import { expect, type Browser, type Page } from "@playwright/test";
import { adminLogin } from "./helpers";

export const BASE_URL = "http://127.0.0.1:5174";

/** A fresh browser context, logged in as the owner. Console output is collected
 *  on the returned array so specs can assert nothing alarming was logged. */
export async function newAdminPage(
  browser: Browser,
): Promise<{ page: Page; consoleMessages: string[] }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  const consoleMessages: string[] = [];
  page.on("console", (m) => consoleMessages.push(`[${m.type()}] ${m.text()}`));
  await adminLogin(page);
  return { page, consoleMessages };
}

export const dialog = (page: Page) => page.locator('[role="dialog"]');

export async function gotoToday(page: Page, dateIso: string): Promise<void> {
  await page.goto(`/admin/today?date=${dateIso}`);
  await expect(page.getByRole("button", { name: "New booking" })).toBeVisible();
  // the timeline renders after stylists load
  await expect(page.getByText("Steve · Director").first()).toBeVisible();
}

export interface WalkinInput {
  name: string;
  phone?: string;
  stylistId: string;
  services: string[];
  date: string;
  time: string;
  notes?: string;
}

export async function openNewBooking(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New booking" }).click();
  await expect(dialog(page)).toBeVisible();
}

export async function fillWalkin(page: Page, w: WalkinInput): Promise<void> {
  const d = dialog(page);
  await d.getByRole("button", { name: "Walk-in", exact: true }).click();
  await d.getByPlaceholder("e.g. Jane Smith").fill(w.name);
  if (w.phone) await d.getByPlaceholder("e.g. 0412 345 678").fill(w.phone);
  await d.locator("select").nth(0).selectOption(w.stylistId);
  for (const s of w.services) {
    await d.locator("label", { hasText: s }).locator('input[type="checkbox"]').check();
  }
  await d.locator('input[type="date"]').fill(w.date);
  await d.locator("select").nth(1).selectOption({ label: w.time });
  if (w.notes) await d.getByPlaceholder("Any special requests...").fill(w.notes);
}

export async function submitWalkin(page: Page): Promise<void> {
  await dialog(page).getByRole("button", { name: /Create Walk-in Booking/ }).click();
}

export interface BreakInput {
  stylistId: string;
  date: string;
  time: string;
  durationLabel?: string;
  reason?: string;
}

export async function fillBreak(page: Page, b: BreakInput): Promise<void> {
  const d = dialog(page);
  await d.getByRole("button", { name: "Block Time", exact: true }).first().click();
  await d.locator("select").nth(0).selectOption(b.stylistId);
  await d.locator('input[type="date"]').fill(b.date);
  await d.locator("select").nth(1).selectOption({ label: b.time });
  if (b.durationLabel) {
    await d.locator("select").nth(2).selectOption({ label: b.durationLabel });
  }
  if (b.reason) await d.getByPlaceholder("e.g. Lunch, Personal").fill(b.reason);
}

export async function submitBreak(page: Page): Promise<void> {
  await dialog(page)
    .getByRole("button", { name: "Block Time", exact: true })
    .last()
    .click();
}
