// e2e/11-booking-commands.spec.ts
// docs/08-test-scenarios.md - Booking commands (TC-087 .. TC-094): the customer's
// request goes through the createBookingRequest FUNCTION (running in the Functions
// emulator), the owner approves / assigns through the booking commands, and the
// outcome is what the server decided, not what the browser claimed. DEC-035..040.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, insertBooking, readCollection, seedEmulator, setClaims } from "./seed";
import { bookOnline, submitDetails, toDetailsStep, tap, todayIso, upcoming } from "./helpers";
import { newAdminPage } from "./admin";

test.describe.configure({ mode: "serial" });

const DAY = upcoming(2, 4); // a Tuesday, well ahead
const DAY2 = upcoming(3, 4);

test.beforeEach(async () => {
  await seedEmulator();
});

const customerPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
    locale: "en-AU",
    timezoneId: "Australia/Melbourne",
    viewport: { width: 1200, height: 1000 },
  });
  return context.newPage();
};

const pendingBooking = (id: string, overrides: Record<string, unknown> = {}) => ({
  bookingType: "customer",
  status: "pending",
  customerName: "Legacy Customer",
  customerNameLower: "legacy customer",
  customerPhone: "0400111222",
  stylistId: "yuto",
  stylistName: "Yuto Hirakawa",
  stylistLevel: "senior",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 65,
  services: [{ id: "mens-cut", name: "Men's Cut", price: 65, activeTime: 45, restTime: 0, totalTime: 45 }],
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  date: DAY,
  time: "11:00 AM",
  bookingRef: `BK-${id}`,
  consentGivenAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

test("TC-087 a request shows 'request received', the assigned stylist and the exact price; it is pending and holds the slot", async ({ page }) => {
  await bookOnline(page, {
    services: ["Men's Cut", "Beard Trim"],
    stylist: "Yuto",
    date: DAY,
    time: "11:00 AM",
    phone: "0412 345 678",
    name: "Tina Newcustomer",
    email: "tina@example.com",
  });
  await expect(page.getByText(/This is not confirmed yet/)).toBeVisible();
  await expect(page.getByText(/Your booking is confirmed/)).toHaveCount(0);
  await expect(page.getByTestId("confirmation-stylist")).toHaveText("Yuto Hirakawa");
  await expect(page.getByTestId("confirmation-total")).toHaveText("$90"); // senior: 65 + 25

  const [b] = await readCollection("bookings");
  expect(b).toMatchObject({
    status: "pending",
    bookingType: "customer",
    stylistId: "yuto",
    servicePrice: 90,
    totalTime: 65, // Men's Cut 45 + Beard Trim 20
    customerPhone: "0412345678",
  });
  expect(typeof b.holdExpiresAt).toBe("string");
  // the slot is held: the public calendar shows it taken, with no customer data in it
  const slots = await readCollection("slotBlocks");
  expect(slots).toHaveLength(1);
  expect(slots[0]).toMatchObject({ stylistId: "yuto", status: "pending", time: "11:00 AM" });
  expect(JSON.stringify(slots[0])).not.toMatch(/Tina|0412345678|tina@/);
});

test("TC-088 'Any Available Stylist' shows 'from $X' before sending, then the assigned stylist and exact price", async ({ page }) => {
  await toDetailsStep(page, {
    services: ["Men's Cut"],
    stylist: "any",
    date: DAY,
    time: "11:00 AM",
    phone: "",
    name: "",
  });
  // before submitting: the lowest tier, as "from $X" - the stylist is not known yet
  await expect(page.getByText("from $55").first()).toBeVisible();

  await submitDetails(page, { phone: "0455 111 222", name: "Anna Anyone" });
  await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible();

  const [b] = await readCollection("bookings");
  expect(b.stylistId).not.toBe("any");
  expect(["steve", "yuto", "elly", "ethan", "harry"]).toContain(b.stylistId);
  expect(b.assignedAutomatically).toBe(true);
  // the screen shows the real stylist and the exact price for that stylist's tier
  await expect(page.getByTestId("confirmation-stylist")).toHaveText(String(b.stylistName));
  const price = { director: 75, senior: 65, junior: 55 }[String(b.stylistLevel) as "director" | "senior" | "junior"];
  await expect(page.getByTestId("confirmation-total")).toHaveText(`$${price}`);
  expect(b.servicePrice).toBe(price);
  // with nothing else booked everyone ties on bookings that day; the e2e stylists have no
  // `order`, so the last tie-break is the id, alphabetically: Elly (the lowest `order` is covered
  // by tests/functions with an ordered roster)
  expect(b.stylistId).toBe("elly");
});

test("TC-089 the owner approves a request and the booking is confirmed (with its availability projection)", async ({ page, browser }) => {
  await bookOnline(page, {
    services: ["Ladies Cut"],
    stylist: "Elly",
    date: DAY,
    time: "2:00 PM",
    phone: "0466 777 888",
    name: "Alice Approve",
  });
  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/approvals");
  await expect(owner.getByText("Alice Approve")).toBeVisible();
  await owner.getByRole("button", { name: /^(Approve|Confirm)/ }).first().click();
  await expect(owner.getByText(/Booking confirmed/)).toBeVisible();
  await expect.poll(async () => (await readCollection("bookings"))[0].status).toBe("confirmed");
  const [b] = await readCollection("bookings");
  expect(b.holdExpiresAt).toBeUndefined();
  expect((await readCollection("slotBlocks"))[0].status).toBe("confirmed");
  await owner.context().close();
});

test("TC-090 two customers choose the same slot at the same moment: exactly one request is accepted", async ({ browser }) => {
  const a = await customerPage(browser);
  const b = await customerPage(browser);
  const details = (n: string, phone: string) => ({
    services: ["Ladies Cut"],
    stylist: "Harry",
    date: DAY2,
    time: "1:00 PM",
    phone,
    name: n,
  });
  await toDetailsStep(a, details("Racer Alpha", "0411 000 001"));
  await toDetailsStep(b, details("Racer Beta", "0411 000 002"));
  // both are now on the details step for the same slot: fill both, then send together
  for (const [p, n, phone] of [[a, "Racer Alpha", "0411000001"], [b, "Racer Beta", "0411000002"]] as const) {
    await p.getByPlaceholder("e.g. 0412 345 678").fill(phone);
    await p.getByPlaceholder("Your full name").fill(n);
    await p.locator("#booking-consent").evaluate((el: HTMLInputElement) => el.click());
  }
  await Promise.all([
    tap(a.getByRole("button", { name: "Request Booking" })),
    tap(b.getByRole("button", { name: "Request Booking" })),
  ]);

  const outcomes = await Promise.all(
    [a, b].map(async (p) => {
      const received = p.getByRole("heading", { name: /Request received/ });
      const taken = p.getByText(/that time was just taken/i);
      await expect(received.or(taken).first()).toBeVisible({ timeout: 20_000 });
      return (await received.count()) > 0 ? "received" : "taken";
    }),
  );
  expect(outcomes.filter((o) => o === "received")).toHaveLength(1);
  expect(outcomes.filter((o) => o === "taken")).toHaveLength(1);
  expect(await readCollection("bookings")).toHaveLength(1);
  expect(await readCollection("slotBlocks")).toHaveLength(1);

  // the loser is back at choosing a time, with the taken one gone from the grid
  const loser = outcomes[0] === "taken" ? a : b;
  await expect(loser.getByText(/Choose who you'd like/)).toBeVisible();
  await a.context().close();
  await b.context().close();
});

test("TC-091 a legacy booking with stylist 'any' shows 'Needs stylist'; assigning one is conflict-checked and re-priced, then it can be approved", async ({ browser }) => {
  // a booking made before the server assigned stylists: stylistId "any", price = the lowest-tier estimate
  await insertBooking("legacy-any", pendingBooking("legacy-any", {
    stylistId: "any",
    stylistName: "Any available stylist",
    stylistLevel: "junior",
    servicePrice: 55,
    services: [{ id: "mens-cut", name: "Men's Cut", price: 55, activeTime: 45, restTime: 0, totalTime: 45 }],
    time: "3:00 PM",
  }));
  // Yuto is busy at that time
  await insertBooking("yuto-busy", pendingBooking("yuto-busy", { status: "confirmed", bookingType: "walkin", customerName: "Busy Client", customerPhone: "", stylistId: "yuto", time: "3:00 PM" }));

  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/approvals");
  const card = owner.locator("tr, [data-booking-id], div").filter({ hasText: "Legacy Customer" }).filter({ has: owner.getByTestId("needs-stylist") }).last();
  await expect(owner.getByTestId("needs-stylist").first()).toBeVisible();
  await expect(owner.getByText("Needs stylist").first()).toBeVisible();
  // there is no Approve for it yet
  await expect(card.getByRole("button", { name: /^(Approve|Confirm)$/ })).toHaveCount(0);

  const assign = owner.getByTestId("needs-stylist").first();
  // a stylist who is busy is refused, and nothing changes
  await assign.getByRole("combobox").selectOption({ label: "Yuto Hirakawa" });
  await assign.getByRole("button", { name: "Assign" }).click();
  await expect(owner.getByText(/Yuto Hirakawa is already booked at that time/)).toBeVisible();
  expect((await readCollection("bookings")).find((b) => b.id === "legacy-any")?.stylistId).toBe("any");

  // a free stylist works, and the price follows their tier (director: 75, was the 55 estimate)
  await assign.getByRole("combobox").selectOption({ label: "Steve Hwang" });
  await assign.getByRole("button", { name: "Assign" }).click();
  await expect(owner.getByText(/Steve Hwang assigned/)).toBeVisible();
  await expect.poll(async () => (await readCollection("bookings")).find((b) => b.id === "legacy-any")?.stylistId).toBe("steve");
  const assigned = (await readCollection("bookings")).find((b) => b.id === "legacy-any")!;
  expect(assigned).toMatchObject({ stylistName: "Steve Hwang", stylistLevel: "director", servicePrice: 75 });
  expect((await readCollection("slotBlocks")).find((s) => s.id === "legacy-any")?.stylistId).toBe("steve");

  // now it can be approved
  await expect(owner.getByTestId("needs-stylist")).toHaveCount(0);
  await owner.getByRole("button", { name: /^(Approve|Confirm)/ }).first().click();
  await expect.poll(async () => (await readCollection("bookings")).find((b) => b.id === "legacy-any")?.status).toBe("confirmed");
  await owner.context().close();
});

test("TC-092 approving a request whose slot has since been taken is refused with a clear message", async ({ browser }) => {
  await insertBooking("late-pending", pendingBooking("late-pending", { stylistId: "elly", stylistName: "Elly Lee", time: "11:00 AM" }));
  // something got into Elly's 11:00 slot after the request (a hand edit, a legacy record)
  await insertBooking("intruder", pendingBooking("intruder", { status: "confirmed", bookingType: "walkin", customerName: "Pat Intruder", customerPhone: "", stylistId: "elly", stylistName: "Elly Lee", time: "11:15 AM" }));

  const { page: owner } = await newAdminPage(browser);
  await owner.goto("/admin/approvals");
  await expect(owner.getByText("Legacy Customer")).toBeVisible();
  await owner.getByRole("button", { name: /^(Approve|Confirm)/ }).first().click();
  await expect(owner.getByText(/can no longer be approved/)).toBeVisible();
  await expect(owner.getByText(/Elly Lee is already booked at that time/)).toBeVisible();
  expect((await readCollection("bookings")).find((b) => b.id === "late-pending")?.status).toBe("pending");
  await owner.context().close();
});

test("TC-093 a blocked client is told to call the salon, and nothing is booked", async ({ page }) => {
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("customerLookups/0499888777").set({ name: "Blocked Person", lastVisit: "", visitCount: 0, blocked: true });
  });
  await env.cleanup();

  await toDetailsStep(page, { services: ["Men's Cut"], stylist: "Steve", date: DAY, time: "11:00 AM", phone: "", name: "" });
  await submitDetails(page, { phone: "0499 888 777", name: "Blocked Person" });
  await expect(page.getByText("Please call the salon to book")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Request received/ })).toHaveCount(0);
  expect(await readCollection("bookings")).toHaveLength(0);
  expect(await readCollection("slotBlocks")).toHaveLength(0);
});

test("TC-094 a third pending request from one phone number is refused", async ({ page }) => {
  const phone = "0433 222 111";
  await bookOnline(page, { services: ["Beard Trim"], stylist: "Steve", date: DAY, time: "10:00 AM", phone, name: "Penny Pending" });
  await bookOnline(page, { services: ["Beard Trim"], stylist: "Steve", date: DAY, time: "11:00 AM", phone, name: "Penny Pending" });
  await toDetailsStep(page, { services: ["Beard Trim"], stylist: "Steve", date: DAY, time: "12:00 PM", phone, name: "Penny Pending" });
  await submitDetails(page, { phone, name: "Penny Pending" });
  await expect(page.getByText(/already have 2 booking requests/)).toBeVisible();
  expect(await readCollection("bookings")).toHaveLength(2);
});

test("TC-097 a stylist sees only their own bookings; another stylist's are not readable", async ({ browser }) => {
  const today = todayIso();
  await insertBooking("mine", pendingBooking("mine", { status: "confirmed", customerName: "Own Client", stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director", date: today, time: "11:00 AM" }));
  await insertBooking("theirs", pendingBooking("theirs", { status: "confirmed", customerName: "Other Stylists Client", stylistId: "yuto", date: today, time: "2:00 PM" }));

  // a stylist account: signed in, claim role "stylist" for Steve (roles are claims, DEC-033)
  const signUp = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "steve@suahair.test", password: "E2e-stylist-pass-2", returnSecureToken: true }),
  });
  const uid = ((await signUp.json()) as { localId: string }).localId;
  await setClaims(uid, { role: "stylist", stylistId: "steve" });

  const context = await browser.newContext({ baseURL: "http://127.0.0.1:5174", locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1200, height: 1000 } });
  const stylist = await context.newPage();
  await stylist.goto("/admin/login");
  await stylist.getByPlaceholder("admin@suahair.com.au").fill("steve@suahair.test");
  await stylist.getByPlaceholder("••••••••").fill("E2e-stylist-pass-2");
  await stylist.locator('button[type="submit"]').click();
  await stylist.waitForURL(/\/stylist\//);
  await expect(stylist.getByText("Own Client")).toBeVisible();
  await expect(stylist.getByText("Other Stylists Client")).toHaveCount(0);

  // and the rules, not just the page, refuse the other stylist's booking: a direct read from the browser fails
  const denied = await stylist.evaluate(async () => {
    const res = await fetch("http://127.0.0.1:8085/v1/projects/demo-sua-e2e/databases/(default)/documents/bookings/theirs");
    return res.status; // the emulator REST API without a token is unauthenticated => rules apply
  });
  expect([401, 403]).toContain(denied);
  await context.close();
});
