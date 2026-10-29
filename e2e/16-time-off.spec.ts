// e2e/16-time-off.spec.ts
// Stylist days off and blocked times (FR-029, DEC-055) through the real UI against the Firebase
// emulators (Auth + Firestore + Functions): a stylist asks, the owner reviews the bookings in the
// way and approves (cancelling the ones chosen) or declines, the owner's policy for a waiting
// request, the owner's own entries, and a stylist trusted to approve. Fake people only.
// TC-134 .. TC-138.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, insertBooking, readCollection, seedEmulator, setClaims } from "./seed";
import { upcoming } from "./helpers";
import { BASE_URL, newAdminPage } from "./admin";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const DAY = upcoming(3, 4); // a Wednesday, a few days out
const PASSWORD = "E2e-stylist-pass-4";

const booking = (id: string, over: Record<string, unknown> = {}) => ({
  bookingType: "customer",
  status: "confirmed",
  customerName: "Cara Customer",
  customerNameLower: "cara customer",
  customerPhone: "0411000111",
  clientId: "0411000111",
  stylistId: "steve",
  stylistName: "Steve Hwang",
  stylistLevel: "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 75,
  services: [{ id: "mens-cut", name: "Men's Cut", price: 75, activeTime: 45, restTime: 0, totalTime: 45 }],
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  date: DAY,
  time: "11:00 AM",
  bookingRef: `BK-${id}`,
  createdAt: new Date().toISOString(),
  ...over,
});

const bookings = async () => await readCollection("bookings");
const byId = async (id: string) => (await bookings()).find((b) => b.id === id) as Record<string, unknown> | undefined;
const timeOffDocs = async () => await readCollection("timeOff");

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

async function openTimeOff(page: Page) {
  await page.goto("/stylist/time-off");
  await expect(page.getByTestId("timeoff-form")).toBeVisible();
}

test.beforeEach(async () => {
  await seedEmulator();
  await insertBooking("e2e-cust", booking("e2e-cust"));
});

test("TC-134 a stylist asks for a day off: it is held at once; the owner reviews, cancels one booking, approves", async ({ browser }) => {
  const steve = await stylistPage(browser, "steve@suahair.test", "steve");
  await openTimeOff(steve);
  await expect(steve.getByTestId("to-stylist")).toHaveCount(0); // a stylist asks only for themselves
  await expect(steve.getByTestId("to-submit")).toBeDisabled();

  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-reason").fill("Family event");
  await expect(steve.getByTestId("to-clashes")).toBeVisible(); // Cara's 11:00 booking is in the way
  await expect(steve.getByTestId("to-clashes")).toContainText("Cara Customer");
  await expect(steve.getByTestId("to-clash-cancel")).toHaveCount(0); // a stylist can't cancel it
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByText("Sent. That time is held for you while it's decided.")).toBeVisible();

  // held for customers at once, around Cara's booking, which is untouched
  await expect.poll(async () => (await timeOffDocs()).length).toBe(1);
  const record = (await timeOffDocs())[0];
  expect(record).toMatchObject({ stylistId: "steve", status: "pending", reason: "Family event", kind: "dayoff" });
  await expect.poll(async () => (await bookings()).filter((b) => b.timeOffId === record.id).length).toBe(2); // 10-11 and 11:45-6
  expect((await byId("e2e-cust"))?.status).toBe("confirmed");
  await expect(steve.getByTestId("timeoff-waiting")).toContainText("Waiting");
  await expect(steve.getByTestId("timeoff-review")).toHaveCount(0);

  // the owner sees it, reviews the bookings in the way, and approves cancelling Cara's
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/time-off");
  await expect(owner.getByTestId("timeoff-waiting")).toContainText("Steve Hwang");
  await owner.getByTestId("timeoff-review").click();
  await expect(owner.getByTestId("review-clashes")).toContainText("Cara Customer");
  await owner.getByTestId("review-cancel").check();
  await owner.getByTestId("review-note").fill("Enjoy");
  await owner.getByTestId("review-approve").click();
  await expect(owner.getByText(/Approved\. 1 booking was cancelled/)).toBeVisible();

  await expect.poll(async () => (await byId("e2e-cust"))?.status).toBe("cancelled");
  await expect.poll(async () => (await timeOffDocs())[0].status).toBe("approved");
  const breaks = (await bookings()).filter((b) => b.timeOffId === record.id);
  expect(breaks).toHaveLength(1); // now one block across the whole day
  expect(breaks[0]).toMatchObject({ time: "10:00 AM", totalTime: 480, serviceName: "Family event", timeOffApproved: true });

  // the stylist sees it approved, with the owner's note
  await expect(steve.getByTestId("timeoff-coming")).toContainText("Approved");
  await expect(steve.getByTestId("timeoff-coming")).toContainText("Enjoy");
  await steve.context().close();
  await owner.context().close();
});

test("TC-135 declining releases the held time and tells the stylist; a stylist can withdraw their own request", async ({ browser }) => {
  const steve = await stylistPage(browser, "steve@suahair.test", "steve");
  await openTimeOff(steve);
  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByText(/held for you/)).toBeVisible();
  await expect.poll(async () => (await bookings()).filter((b) => b.bookingType === "break").length).toBeGreaterThan(0);

  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/time-off");
  await owner.getByTestId("timeoff-review").click();
  await owner.getByTestId("review-note").fill("We're short that day");
  await owner.getByTestId("review-decline").click();
  await expect(owner.getByText("Declined. The held time is released.")).toBeVisible();
  await expect.poll(async () => (await bookings()).filter((b) => b.bookingType === "break").length).toBe(0);
  expect((await byId("e2e-cust"))?.status).toBe("confirmed");
  await expect(steve.getByTestId("timeoff-earlier")).toContainText("Declined");
  await expect(steve.getByTestId("timeoff-earlier")).toContainText("We're short that day");

  // and another, which she takes back herself
  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByTestId("timeoff-waiting")).toContainText("Waiting");
  await steve.getByTestId("timeoff-withdraw").click();
  await expect(steve.getByText("Request withdrawn.")).toBeVisible();
  await expect.poll(async () => (await bookings()).filter((b) => b.bookingType === "break").length).toBe(0);
  await steve.context().close();
  await owner.context().close();
});

test("TC-136 the owner's policy: don't block while waiting, and short blocks apply at once", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/manage?section=policies");
  await expect(owner.getByTestId("timeoff-policy")).toBeVisible();
  await expect(owner.getByTestId("timeoff-policy-hold")).toBeChecked();
  await expect(owner.getByTestId("timeoff-policy-save")).toBeDisabled();
  await owner.getByTestId("timeoff-policy-wait").check();
  await owner.getByTestId("timeoff-policy-save").click();
  await expect(owner.getByText("Time-off settings saved.")).toBeVisible();
  await expect.poll(async () => (await readCollection("privateSettings")).find((d) => d.id === "timeOff")?.pending).toBe("wait");

  const steve = await stylistPage(browser, "steve@suahair.test", "steve");
  await openTimeOff(steve);
  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByText("Sent. You'll be told when it's decided.")).toBeVisible();
  await expect.poll(async () => (await timeOffDocs()).length).toBe(1);
  expect((await bookings()).filter((b) => b.bookingType === "break")).toHaveLength(0); // nothing blocked yet

  // short blocks apply at once
  await owner.getByTestId("timeoff-policy-auto").check();
  await owner.getByTestId("timeoff-policy-hours").fill("0");
  await expect(owner.getByTestId("timeoff-policy-problem")).toBeVisible();
  await expect(owner.getByTestId("timeoff-policy-save")).toBeDisabled();
  await owner.getByTestId("timeoff-policy-hours").fill("2");
  await owner.getByTestId("timeoff-policy-save").click();
  await expect.poll(async () => (await readCollection("privateSettings")).find((d) => d.id === "timeOff")?.pending).toBe("auto");

  await steve.getByTestId("to-kind-block").check();
  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-from").selectOption("2:00 PM");
  await steve.getByTestId("to-until").selectOption("3:30 PM");
  await steve.getByTestId("to-reason").fill("Dentist");
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByText("Done - that time is blocked. The owner has been told.")).toBeVisible();
  await expect.poll(async () => (await bookings()).filter((b) => b.bookingType === "break").length).toBe(1);
  const block = (await bookings()).find((b) => b.bookingType === "break") as Record<string, unknown>;
  expect(block).toMatchObject({ time: "2:00 PM", totalTime: 90, serviceName: "Dentist", timeOffApproved: true });
  await steve.context().close();
  await owner.context().close();
});

test("TC-137 the owner adds time off for anyone: applied at once, with the bookings in the way to cancel", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/time-off");
  await expect(owner.getByTestId("to-submit")).toBeDisabled();
  await owner.getByTestId("to-stylist").selectOption("steve");
  await owner.getByTestId("to-start").fill(DAY);
  await expect(owner.getByTestId("to-clashes")).toContainText("Cara Customer");
  await expect(owner.getByTestId("to-clashes")).toContainText("0411000111"); // the owner can call them
  await owner.getByTestId("to-clash-cancel").check();
  await owner.getByTestId("to-reason").fill("Training day");
  await owner.getByTestId("to-submit").click();
  await expect(owner.getByText(/Time off added\. 1 booking was cancelled/)).toBeVisible();
  await expect.poll(async () => (await byId("e2e-cust"))?.status).toBe("cancelled");
  await expect(owner.getByTestId("timeoff-coming")).toContainText("Steve Hwang");
  await expect(owner.getByTestId("timeoff-coming")).toContainText("Approved");
  const breaks = (await bookings()).filter((b) => b.bookingType === "break");
  expect(breaks).toHaveLength(1);
  expect(breaks[0]).toMatchObject({ serviceName: "Training day", totalTime: 480 });

  // and takes it back
  await owner.getByTestId("timeoff-withdraw").click();
  await expect(owner.getByText("Time off removed.")).toBeVisible();
  await expect.poll(async () => (await bookings()).filter((b) => b.bookingType === "break").length).toBe(0);
  await owner.context().close();
});

test("TC-138 a stylist trusted to approve time off decides other stylists' requests; one without the permission cannot", async ({ browser }) => {
  const steve = await stylistPage(browser, "steve@suahair.test", "steve");
  await openTimeOff(steve);
  await steve.getByTestId("to-start").fill(DAY);
  await steve.getByTestId("to-submit").click();
  await expect(steve.getByText(/held for you/)).toBeVisible();
  await expect.poll(async () => (await timeOffDocs()).length).toBe(1);

  const yuto = await stylistPage(browser, "yuto@suahair.test", "yuto", [{ code: "timeoff", cap: "approveTimeOff" }]);
  await openTimeOff(yuto);
  await expect(yuto.getByTestId("to-stylist")).toBeVisible(); // an approver may enter time off for anyone
  await expect(yuto.getByTestId("timeoff-waiting")).toContainText("Steve Hwang");
  await yuto.getByTestId("timeoff-review").click();
  await yuto.getByTestId("review-approve").click();
  await expect(yuto.getByText("Approved.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await timeOffDocs())[0].status).toBe("approved");
  await expect(steve.getByTestId("timeoff-coming")).toContainText("Approved");

  // Steve (no permission) has no Review button, and no one else's requests
  await expect(steve.getByTestId("timeoff-review")).toHaveCount(0);
  await steve.context().close();
  await yuto.context().close();
});
