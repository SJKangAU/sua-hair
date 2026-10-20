// e2e/helpers.ts
// Shared page helpers for the scenario specs: dates, the customer booking
// flow, and the owner login.
import { expect, type Locator, type Page } from "@playwright/test";
import { OWNER_EMAIL, OWNER_PASSWORD } from "./seed";

export const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The next date (strictly after `daysAhead` days from now) falling on `weekday`
 *  (0=Sun .. 6=Sat). Always at least 3 days out so notice/cutoff rules never
 *  interfere with scenarios that are not about them. */
export function upcoming(weekday: number, minDaysAhead = 3, extraWeeks = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + minDaysAhead);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + extraWeeks * 7);
  return iso(d);
}

export function addDaysIso(dateIso: string, n: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt);
}

export const todayIso = () => iso(new Date());

export function weekdayOf(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Pretty "Wed 21 Oct"-style fragments are avoided; use ISO everywhere in tests. */

export interface OnlineBooking {
  services: string[];
  stylist: string; // stylist display name, or "any"
  date: string; // ISO
  time: string; // e.g. "10:30 AM"
  phone: string;
  name: string;
  email?: string;
  notes?: string;
}

/** Clicks via the DOM. The booking flow's sticky bottom bar covers the lower
 *  part of the page, so Playwright's pointer-based click is intercepted. */
export async function tap(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await locator.dispatchEvent("click");
}

/** Opens the date in the month calendar (navigating forward if needed). */
export async function pickDate(page: Page, dateIso: string): Promise<void> {
  const [y, m, d] = dateIso.split("-").map(Number);
  const label = await page.evaluate(
    ([yy, mm, dd]) =>
      new Date(yy, mm - 1, dd).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [y, m, d],
  );
  const dayBtn = () =>
    page.getByRole("button", { name: new RegExp(`^${label}`) });
  for (let i = 0; i < 4 && (await dayBtn().count()) === 0; i++) {
    await tap(page.getByRole("button", { name: "Next month" }));
  }
  await tap(dayBtn());
}

export function slotButton(page: Page, time: string) {
  return page.getByRole("button", { name: new RegExp(`^${time}`) });
}

/** Steps 1-2 of the customer flow, leaving the page on the time grid. */
export async function chooseSlotOnline(
  page: Page,
  b: Pick<OnlineBooking, "services" | "stylist" | "date">,
): Promise<void> {
  await page.goto("/");
  for (const s of b.services) {
    await tap(
      page
        .getByRole("button", { name: new RegExp(s.replace(/[()]/g, "\\$&")) })
        .first(),
    );
  }
  await tap(page.getByRole("button", { name: "Continue" }));
  if (b.stylist === "any") {
    await tap(
      page.getByRole("button", { name: /Any available stylist|First available/i }).first(),
    );
  } else {
    await tap(page.getByRole("button", { name: new RegExp(b.stylist) }).first());
  }
  await pickDate(page, b.date);
}

/** Steps 1-3 up to the details form. */
export async function toDetailsStep(page: Page, b: OnlineBooking): Promise<void> {
  await chooseSlotOnline(page, b);
  await tap(slotButton(page, b.time));
  await tap(page.getByRole("button", { name: "Review Booking" }));
  await tap(page.getByRole("button", { name: /Confirm & Continue/ }));
}

/** The whole customer flow through to the confirmation screen. */
export async function bookOnline(page: Page, b: OnlineBooking): Promise<void> {
  await toDetailsStep(page, b);
  await page.getByPlaceholder("e.g. 0412 345 678").fill(b.phone);
  await page.getByPlaceholder("Your full name").fill(b.name);
  if (b.email) await page.getByPlaceholder("you@example.com").fill(b.email);
  if (b.notes) {
    await page
      .getByPlaceholder("Any special requests or preferences...")
      .fill(b.notes);
  }
  await page
    .locator("#booking-consent")
    .evaluate((el: HTMLInputElement) => el.click());
  await tap(page.getByRole("button", { name: "Confirm Booking" }));
  await expect(page.getByText(/Your booking is confirmed/)).toBeVisible();
}

export async function adminLogin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(OWNER_EMAIL);
  await page.getByPlaceholder("••••••••").fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/today/);
}
