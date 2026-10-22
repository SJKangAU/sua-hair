// e2e/18-win-back.spec.ts
// Inviting lapsed clients back (FR-030, DEC-056) through the real UI against the Firebase
// emulators (Auth + Firestore + Functions): the optional box on the booking form, the owner's
// "Invite lapsed clients back" list (only clients who agreed), the send (texts go to smsOutbox,
// never to a phone; the functions emulator sends no email), the unsubscribe link, a stylist
// trusted to send, and the owner recording consent by hand. Fake people only. TC-140 .. TC-144.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator, setClaims } from "./seed";
import { bookOnline, addDaysIso, todayIso, upcoming } from "./helpers";
import { BASE_URL, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const PASSWORD = "E2e-stylist-pass-5";
const CONSENT = "2026-03-01T00:00:00.000Z";

const client = (phone: string, name: string, over: Record<string, unknown> = {}) => ({
  phone,
  name,
  nameLower: name.toLowerCase(),
  searchTokens: [name.toLowerCase().split(" ")[0]],
  aliases: [],
  tags: [],
  email: `${name.split(" ")[0].toLowerCase()}@example.test`,
  blocked: false,
  source: "online",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  totalVisits: 3,
  totalSpend: 200,
  firstVisit: addDaysIso(todayIso(), -400),
  lastVisit: addDaysIso(todayIso(), -120),
  hasUpcoming: false,
  stylistIds: ["steve"],
  favouriteStylistId: "steve",
  favouriteServiceIds: ["mens-cut"],
  bookingCount: 3,
  marketingOptIn: true,
  marketingConsentAt: CONSENT,
  marketingSource: "booking-form",
  ...over,
});

async function seedClients(extra: Record<string, Record<string, unknown>> = {}) {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc("privateSettings/sms").set({ enabled: true, senderName: "SuaHair", kinds: {}, templates: {} });
      const all: Record<string, Record<string, unknown>> = {
        "0411000001": client("0411000001", "Anna Agreed"),
        "0411000002": client("0411000002", "Bella Agreed", { stylistIds: ["yuto"], favouriteStylistId: "yuto" }),
        "0411000003": client("0411000003", "Cleo Never", { marketingOptIn: false, marketingConsentAt: undefined, marketingSource: undefined }),
        "0411000004": client("0411000004", "Dana Recent", { lastVisit: addDaysIso(todayIso(), -10) }),
        ...extra,
      };
      for (const [id, data] of Object.entries(all)) {
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        await db.doc(`clients/${id}`).set(clean);
      }
    });
  } finally {
    await env.cleanup();
  }
}

// only the invitations: a booking made in another test can still be sending its own "received" text
const outbox = async () => (await readCollection("smsOutbox")).filter((t) => String(t.body).includes("/unsubscribe?c="));
const clientDoc = async (id: string) => (await readCollection("clients")).find((c) => c.id === id) as Record<string, unknown> | undefined;

/** A stylist signs in: a login, a role record (as the grant function writes), and the claims. */
async function stylistPage(browser: Browser, email: string, stylistId: string, caps: { code: string; cap: string }[] = []): Promise<Page> {
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const uid = ((await res.json()) as { localId: string }).localId;
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/${uid}`).set({ role: "stylist", stylistId, email, effectiveCaps: caps.map((c) => c.cap) });
    });
  } finally {
    await env.cleanup();
  }
  await setClaims(uid, { role: "stylist", stylistId, ...(caps.length > 0 ? { caps: caps.map((c) => c.code) } : {}) } as unknown as Record<string, string>);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1300, height: 1500 } });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(email);
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/stylist\//);
  return page;
}

test.beforeEach(async () => {
  await seedEmulator();
  await seedClients();
});

test("TC-140 the booking form has an unticked box; ticking it records that the client agreed", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1300, height: 1500 } });
  const page = await context.newPage();
  const day = upcoming(3, 4);
  await page.goto("/");
  // go as far as the details step with the tick-box left alone, then tick it
  const { toDetailsStep, submitDetails } = await import("./helpers");
  const booking = { services: ["Men's Cut"], stylist: "Steve Hwang", date: day, time: "11:00 AM", phone: "0411555001", name: "Tia Ticker", email: "tia@example.test" };
  await toDetailsStep(page, booking);
  const box = page.getByTestId("booking-marketing");
  await expect(box).not.toBeChecked();
  await box.evaluate((el: HTMLInputElement) => el.click());
  await expect(box).toBeChecked();
  await submitDetails(page, booking);
  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible();
  await expect.poll(async () => (await clientDoc("0411555001"))?.marketingOptIn).toBe(true);
  expect((await clientDoc("0411555001"))?.marketingSource).toBe("booking-form");

  // and a booking without the tick records nothing
  const page2 = await context.newPage();
  await page2.goto("/");
  await bookOnline(page2, { ...booking, phone: "0411555002", name: "Nina Nottick", time: "1:00 PM" });
  await expect.poll(async () => (await clientDoc("0411555002")) !== undefined).toBe(true);
  expect((await clientDoc("0411555002"))?.marketingOptIn).toBeUndefined();
  await context.close();
});

test("TC-141 the owner invites lapsed clients back: only those who agreed are listed; the text carries the unsubscribe link", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients");
  await page.getByTestId("invite-back").click();
  const modal = page.getByTestId("winback-modal");
  await expect(modal).toBeVisible();
  // Anna and Bella agreed and are lapsed; Cleo never agreed; Dana was in recently
  const rows = modal.getByTestId("winback-row");
  await expect(rows).toHaveCount(2);
  await expect(modal).toContainText("Anna Agreed");
  await expect(modal).toContainText("Bella Agreed");
  await expect(modal).not.toContainText("Cleo Never");
  await expect(modal).not.toContainText("Dana Recent");
  await expect(modal.getByTestId("winback-not-agreed")).toContainText("1 lapsed client has not agreed");
  await expect(modal.getByTestId("winback-summary")).toContainText("2 clients selected: 2 emails and 2 texts");

  // leave Bella out, send by text only
  await rows.filter({ hasText: "Bella Agreed" }).locator('input[type="checkbox"]').uncheck();
  await modal.getByTestId("winback-email").uncheck();
  await expect(modal.getByTestId("winback-summary")).toContainText("1 client selected: 0 emails and 1 text");
  await modal.getByTestId("winback-send").click();
  await expect(modal.getByTestId("winback-result")).toContainText("Invited 1 of 1");
  await expect(modal.getByTestId("winback-result")).toContainText("1 text sent");
  await modal.getByTestId("winback-close").click();

  await expect.poll(async () => (await outbox()).length).toBe(1);
  const text = (await outbox())[0];
  expect(text.to).toBe("+61411000001");
  const anna = await clientDoc("0411000001");
  expect(anna?.winBackSentAt).toBeTruthy();
  expect(String(text.body)).toContain(`/unsubscribe?c=0411000001&t=${anna?.marketingToken as string}`);
  expect(String(text.body)).toContain("Anna");
  expect((await clientDoc("0411000002"))?.winBackSentAt).toBeUndefined();
  expect((await readCollection("winBackLog")).length).toBe(1);

  // asked again straight away: Anna is not offered a second time
  await page.getByTestId("invite-back").click();
  await expect(page.getByTestId("winback-row")).toHaveCount(1);
  await expect(page.getByTestId("winback-left-out")).toContainText("invited back recently");
  await page.context().close();
});

test("TC-142 the unsubscribe link: nothing happens until the button; then they leave the list; a bad link does nothing", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/clients");
  await owner.getByTestId("invite-back").click();
  await owner.getByTestId("winback-email").uncheck();
  await owner.getByTestId("winback-send").click();
  await expect(owner.getByTestId("winback-result")).toContainText("Invited 2 of 2");
  await owner.getByTestId("winback-close").click();
  await expect.poll(async () => (await outbox()).length).toBe(2);
  const annasText = (await outbox()).find((t) => t.to === "+61411000001");
  const link = String(annasText?.body).match(/https?:\/\/\S+\/unsubscribe\?c=\S+/)?.[0] ?? "";
  expect(link).toContain("/unsubscribe?c=0411000001&t=");
  const path = link.replace(/^https?:\/\/[^/]+/, "");

  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne" });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByTestId("unsubscribe-confirm")).toBeVisible();
  expect((await clientDoc("0411000001"))?.marketingOptOutAt).toBeUndefined(); // opening the link changes nothing
  await page.getByTestId("unsubscribe-confirm").click();
  await expect(page.getByTestId("unsubscribe-done")).toBeVisible();
  await expect.poll(async () => (await clientDoc("0411000001"))?.marketingOptOutAt).toBeTruthy();
  expect((await clientDoc("0411000001"))?.marketingOptIn).toBeUndefined();

  // a wrong secret does nothing to anyone
  await page.goto("/unsubscribe?c=0411000002&t=wrongwrongwrongwrong12");
  await page.getByTestId("unsubscribe-confirm").click();
  await expect(page.getByTestId("unsubscribe-error")).toBeVisible();
  expect((await clientDoc("0411000002"))?.marketingOptOutAt).toBeUndefined();
  // and an incomplete link says so
  await page.goto("/unsubscribe?c=0411000002");
  await expect(page.getByTestId("unsubscribe-error")).toBeVisible();
  await context.close();

  // Anna has left the list; the owner's client page shows why
  await owner.goto("/admin/clients/0411000001");
  await expect(owner.getByTestId("unsubscribed-badge")).toBeVisible();
  await owner.goto("/admin/clients");
  await owner.getByTestId("invite-back").click();
  await expect(owner.getByTestId("winback-modal")).not.toContainText("Anna Agreed");
  await owner.context().close();
});

test("TC-143 a stylist sees the button only with the permission, and only their own clients", async ({ browser }) => {
  const plain = await stylistPage(browser, "plain@suahair.test", "steve");
  await plain.goto("/stylist/clients");
  await expect(plain.getByTestId("client-directory")).toBeVisible();
  await expect(plain.getByTestId("invite-back")).toHaveCount(0);
  await plain.context().close();

  const sender = await stylistPage(browser, "sender@suahair.test", "steve", [{ code: "winback", cap: "sendWinBack" }]);
  await sender.goto("/stylist/clients");
  await sender.getByTestId("invite-back").click();
  const modal = sender.getByTestId("winback-modal");
  await expect(modal.getByTestId("winback-row")).toHaveCount(1);
  await expect(modal).toContainText("Anna Agreed");
  await expect(modal).not.toContainText("Bella Agreed"); // Yuto's client
  await expect(modal.getByTestId("winback-not-agreed")).toHaveCount(0); // that figure is the owner's
  await modal.getByTestId("winback-send").click();
  await expect(modal.getByTestId("winback-result")).toContainText("Invited 1 of 1");
  await expect.poll(async () => (await outbox()).length).toBe(1);
  await sender.context().close();
});

test("TC-144 the owner records consent by hand (with a warning), and can stop invitations", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients/0411000003"); // Cleo never agreed
  await expect(page.getByTestId("agreed-badge")).toHaveCount(0);
  await page.getByTestId("hk-marketing").click();
  await expect(page.getByRole("dialog")).toContainText("Only do this if this client has told you");
  await page.getByTestId("marketing-confirm").click();
  await expect(page.getByTestId("agreed-badge")).toBeVisible();
  await expect.poll(async () => (await clientDoc("0411000003"))?.marketingOptIn).toBe(true);
  expect((await clientDoc("0411000003"))?.marketingSource).toBe("owner-recorded");

  // stop them again
  await page.getByTestId("hk-marketing").click();
  await expect(page.getByTestId("unsubscribed-badge")).toBeVisible();
  await expect(page.getByTestId("agreed-badge")).toHaveCount(0);
  await expect.poll(async () => (await clientDoc("0411000003"))?.marketingOptIn).toBeUndefined();
  const audit = (await readCollection("clients/0411000003/audit")).map((a) => a.detail);
  expect(audit).toEqual(expect.arrayContaining(["recorded that they agreed to hear about coming back", "stopped invitations to come back"]));
  await page.context().close();
});
