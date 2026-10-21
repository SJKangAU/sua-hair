// e2e/helpers.ts
// Shared page helpers for the scenario specs: dates, the customer booking
// flow, and the owner login.
import { expect, type Locator, type Page } from "@playwright/test";
import { OWNER_EMAIL, OWNER_PASSWORD } from "./seed";

export const pad = (n: number) => String(n).padStart(2, "0");
// Formats a calendar date built from local y/m/d parts (pure date arithmetic;
// never use it on an instant - see melbourneNow / melbourneInstant)
export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── The salon's clock ────────────────────────────────────────────────────────
// The salon (and so every rule under test: "today", the 5 pm cutoff, opening
// hours) lives in Australia/Melbourne. The browser contexts are pinned to that
// zone (playwright.config.ts), so the tests must reason in it too - NOT in the
// zone of the machine running them (CI is UTC, 11 hours behind).
export const SALON_TZ = "Australia/Melbourne";

const partsIn = (instant: Date) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const get = Object.fromEntries(
    f.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(get.year),
    m: Number(get.month),
    d: Number(get.day),
    h: Number(get.hour),
    min: Number(get.minute),
  };
};

/** Today's date in Melbourne, as YYYY-MM-DD. */
export const todayIso = (): string => {
  const { y, m, d } = partsIn(new Date());
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** The exact instant at which Melbourne's wall clock reads `hh:mm` on `dateIso`
 *  (handles daylight saving). Use it for page.clock.setFixedTime. */
export function melbourneInstant(dateIso: string, hh: number, mm = 0): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Melbourne's offset at that wall time: (what Melbourne reads at a guess) - guess
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(new Date(guess));
    const readAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += wall - readAsUtc;
  }
  return new Date(guess);
}

/** The next date (at least `minDaysAhead` days after today in Melbourne) falling
 *  on `weekday` (0=Sun .. 6=Sat). Always at least 3 days out so notice/cutoff
 *  rules never interfere with scenarios that are not about them. */
export function upcoming(weekday: number, minDaysAhead = 3, extraWeeks = 0): string {
  const [y, m, d] = todayIso().split("-").map(Number);
  const dt = new Date(y, m - 1, d + minDaysAhead);
  while (dt.getDay() !== weekday) dt.setDate(dt.getDate() + 1);
  dt.setDate(dt.getDate() + extraWeeks * 7);
  return iso(dt);
}

export function addDaysIso(dateIso: string, n: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt);
}

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
  // A start time button ("10:00 AM"); disabled when it cannot be booked
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

/** Fills the details form and presses "Request Booking", without waiting for an outcome. */
export async function submitDetails(
  page: Page,
  b: Pick<OnlineBooking, "phone" | "name" | "email" | "notes">,
): Promise<void> {
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
  await tap(page.getByRole("button", { name: "Request Booking" }));
}

/** The whole customer flow through to the "request received" screen. */
export async function bookOnline(page: Page, b: OnlineBooking): Promise<void> {
  await toDetailsStep(page, b);
  await submitDetails(page, b);
  // "Request received" - NOT a confirmation: only the owner's approval confirms (DEC-038)
  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible();
}

export async function adminLogin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(OWNER_EMAIL);
  await page.getByPlaceholder("••••••••").fill(OWNER_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/today/);
}
