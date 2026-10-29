// e2e/14-team-access.spec.ts
// Team access (FR-025, DEC-051) through the real UI against the Firebase emulators (Auth +
// Firestore + Functions): the owner gives a stylist a role and chooses whose clients they
// may open (own only, named colleagues, every client), the stylist's screens follow the
// change without signing out, a colleague's clients show their history without prices,
// a client outside the access is "not found", and the owner cannot lock themself out.
// Fake people only. TC-120 .. TC-124.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { OWNER_EMAIL, connectEnv, readCollection, seedEmulator } from "./seed";
import { addDaysIso, todayIso } from "./helpers";
import { BASE_URL, newAdminPage } from "./admin";
import { buildClient, clientCardOf } from "../src/lib/clients";

test.use({ viewport: { width: 1300, height: 1500 } });
test.describe.configure({ mode: "serial" });

const STEVE_EMAIL = "steve@suahair.test";
const STEVE_PASSWORD = "E2e-stylist-pass-3";
const NAMES = { steve: "Steve Hwang", yuto: "Yuto Hirakawa", elly: "Elly Lee" } as const;

// one client per stylist: Sue (Steve's), Yara (Yuto's), Eli (Elly's)
const CLIENTS = [
  { phone: "0400000101", name: "Sue Steve", stylist: "steve" as const },
  { phone: "0400000102", name: "Yara Yuto", stylist: "yuto" as const },
  { phone: "0400000103", name: "Eli Elly", stylist: "elly" as const },
];

const bookingOf = (c: (typeof CLIENTS)[number]) => ({
  bookingType: "customer",
  status: "completed",
  customerName: c.name,
  customerNameLower: c.name.toLowerCase(),
  customerPhone: c.phone,
  clientId: c.phone,
  stylistId: c.stylist,
  stylistName: NAMES[c.stylist],
  stylistLevel: "senior",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: 65,
  services: [{ id: "mens-cut", name: "Men's Cut", price: 65, activeTime: 45, restTime: 0, totalTime: 45 }],
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  date: addDaysIso(todayIso(), -10),
  time: "10:00 AM",
  createdAt: `${addDaysIso(todayIso(), -10)}T00:00:00.000Z`,
});

async function seedTeam(): Promise<void> {
  await seedEmulator();
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // the seeded owner's record carries their email, as a real grant does
      const owner = (await db.collection("users").where("role", "==", "owner").get()).docs[0];
      await owner.ref.set({ role: "owner", email: OWNER_EMAIL });
      for (const c of CLIENTS) {
        const booking = bookingOf(c);
        const client = buildClient(
          c.phone,
          [{ id: `b-${c.phone}`, ...booking }] as never,
          { tags: [], blocked: false, name: c.name, source: "online", createdAt: "2025-01-01T00:00:00.000Z" },
          todayIso(),
          new Date().toISOString(),
        );
        // the client and card first, so the booking trigger never writes over them
        await db.doc(`clients/${c.phone}`).set(client);
        await db.doc(`clientCards/${c.phone}`).set(clientCardOf(client, c.phone));
        await db.doc(`bookings/b-${c.phone}`).set(booking);
      }
    });
  } finally {
    await env.cleanup();
  }
  // the stylist's login exists (the owner creates it in the console); no role yet
  await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: STEVE_EMAIL, password: STEVE_PASSWORD, returnSecureToken: true }),
  });
}

const steveRecord = async () => (await readCollection("users")).find((u) => u.email === STEVE_EMAIL);

async function ownerAddsSteve(page: Page, scope: "own" | "some" | "all", colleagues: string[] = []): Promise<string> {
  await page.goto("/admin/manage?section=access");
  await expect(page.getByTestId("team-access")).toBeVisible();
  await page.getByTestId("team-add-email").fill(STEVE_EMAIL);
  await page.getByTestId("team-add-stylist").selectOption("steve");
  await page.getByTestId("team-add-scope").selectOption(scope);
  for (const id of colleagues) await page.getByTestId(`team-add-colleague-${id}`).check();
  await page.getByTestId("team-add-submit").click();
  await expect(page.getByText("Stylist access given.")).toBeVisible();
  await expect.poll(async () => (await steveRecord())?.id).toBeTruthy();
  return (await steveRecord())!.id;
}

async function steveSignsIn(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill(STEVE_EMAIL);
  await page.getByPlaceholder("••••••••").fill(STEVE_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/stylist\//);
  await page.getByRole("link", { name: "My clients" }).click();
  await expect(page).toHaveURL(/\/stylist\/clients$/);
  return page;
}

const row = (page: Page, name: string) => page.getByTestId("client-row").filter({ hasText: name });

test.beforeEach(async () => {
  await seedTeam();
});

test("TC-120 the owner gives a stylist a role in Manage; the team list shows them", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/manage?section=access");
  await expect(page.getByTestId("team-access")).toBeVisible();
  await expect(page.getByTestId("team-no-stylists")).toBeVisible();
  // nothing to save until something is chosen
  await expect(page.getByTestId("team-add-submit")).toBeDisabled();
  await page.getByTestId("team-add-email").fill("not an email");
  await page.getByTestId("team-add-stylist").selectOption("steve");
  await expect(page.getByTestId("team-add-submit")).toBeDisabled();

  // a person with no login yet is refused in words
  await page.getByTestId("team-add-email").fill("nobody@suahair.test");
  await page.getByTestId("team-add-submit").click();
  await expect(page.getByText("No account with that email. Create the login first.")).toBeVisible();

  const uid = await ownerAddsSteve(page, "own");
  await expect(page.getByTestId(`team-row-${uid}`)).toContainText(STEVE_EMAIL);
  await expect(page.getByTestId(`team-row-${uid}`)).toContainText("Stylist: Steve Hwang");
  await expect(page.getByTestId(`team-${uid}-scope`)).toHaveValue("own");
  expect(await steveRecord()).toMatchObject({ role: "stylist", stylistId: "steve", clientAccess: { all: false, stylistIds: [] } });
  await page.context().close();
});

test("TC-121 a stylist with no extra access sees only their own clients, with no picker", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await ownerAddsSteve(owner, "own");
  const page = await steveSignsIn(browser);
  await expect(row(page, "Sue Steve")).toBeVisible();
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(page.getByTestId("client-scope")).toHaveCount(0);
  await page.goto("/stylist/clients/0400000102");
  await expect(page.getByTestId("client-not-found")).toBeVisible();
  await page.context().close();
  await owner.context().close();
});

test("TC-122 named colleagues: their clients, notes and history (no prices) open; others stay closed", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  await ownerAddsSteve(owner, "some", ["yuto"]);
  const page = await steveSignsIn(browser);

  const scope = page.getByTestId("client-scope");
  await expect(scope).toBeVisible();
  await expect(scope.locator("option")).toHaveText(["My clients", "Yuto's clients"]);
  await expect(row(page, "Sue Steve")).toBeVisible();
  await expect(row(page, "Yara Yuto")).toHaveCount(0);

  await scope.selectOption("s:yuto");
  await expect(row(page, "Yara Yuto")).toBeVisible();
  await expect(row(page, "Sue Steve")).toHaveCount(0);
  await expect(row(page, "Eli Elly")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("$");

  await row(page, "Yara Yuto").click();
  await expect(page).toHaveURL(/\/stylist\/clients\/0400000102$/);
  await expect(page.getByTestId("client-name")).toHaveText("Yara Yuto");
  await expect(page.getByTestId("history-row")).toHaveCount(1);
  await expect(page.getByTestId("history-row")).toContainText("Yuto Hirakawa"); // whose booking it was
  await expect(page.getByTestId("history-row")).not.toContainText("$"); // a colleague's price is not shown
  await expect(page.getByTestId("client-stats")).toHaveCount(0);
  await expect(page.getByTestId("client-housekeeping")).toHaveCount(0);

  await page.getByTestId("note-input").fill("Likes the left chair");
  await page.getByTestId("note-add").click();
  await expect(page.getByTestId("note").first()).toContainText("Likes the left chair");

  // a client of someone they were not given is not there, even by URL
  await page.goto("/stylist/clients/0400000103");
  await expect(page.getByTestId("client-not-found")).toBeVisible();
  await page.context().close();
  await owner.context().close();
});

test("TC-123 changing the access takes effect on the stylist's open screen, without signing out", async ({ browser }) => {
  const { page: owner } = await newAdminPage(browser);
  const uid = await ownerAddsSteve(owner, "own");
  const page = await steveSignsIn(browser);
  await expect(page.getByTestId("client-scope")).toHaveCount(0);

  // the owner widens it to every client
  await owner.goto("/admin/manage?section=access");
  await owner.getByTestId(`team-${uid}-scope`).selectOption("all");
  await owner.getByTestId(`team-save-${uid}`).click();
  await expect(owner.getByText("Saved. Their screens update in a moment.")).toBeVisible();
  await expect(page.getByTestId("client-scope").locator("option")).toHaveText(["My clients", "Everyone's clients"], { timeout: 20_000 });

  await page.getByTestId("client-scope").selectOption("all");
  await expect(page.getByTestId("client-row")).toHaveCount(3);
  await expect(page.locator("body")).not.toContainText("$");
  await row(page, "Eli Elly").click();
  await expect(page.getByTestId("client-name")).toHaveText("Eli Elly");
  await expect(page.getByTestId("history-row")).toHaveCount(1);

  // and narrows it back: the picker goes and the colleague's client is closed again
  await owner.getByTestId(`team-${uid}-scope`).selectOption("own");
  await owner.getByTestId(`team-save-${uid}`).click();
  await expect(owner.getByText("Saved. Their screens update in a moment.").last()).toBeVisible();
  await page.goto("/stylist/clients");
  await expect(row(page, "Sue Steve")).toBeVisible();
  await expect(page.getByTestId("client-scope")).toHaveCount(0, { timeout: 20_000 });
  await page.goto("/stylist/clients/0400000103");
  await expect(page.getByTestId("client-not-found")).toBeVisible();
  expect(await steveRecord()).toMatchObject({ clientAccess: { all: false, stylistIds: [] } });
  await page.context().close();
  await owner.context().close();
});

test("TC-124 removing a role, and the owner cannot remove their own access", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  const uid = await ownerAddsSteve(page, "own");

  await page.getByTestId(`team-remove-${uid}`).click();
  await page.getByTestId(`team-remove-confirm-${uid}`).click();
  await expect(page.getByText("Access removed.")).toBeVisible();
  await expect(page.getByTestId(`team-row-${uid}`)).toHaveCount(0);
  expect(await steveRecord()).toBeUndefined();

  // the only owner cannot remove themself: nothing changes
  const owners = (await readCollection("users")).filter((u) => u.role === "owner");
  expect(owners).toHaveLength(1);
  await page.getByTestId(`team-remove-${owners[0].id}`).click();
  await page.getByTestId(`team-remove-confirm-${owners[0].id}`).click();
  await expect(page.getByText("You cannot remove your own owner access.")).toBeVisible();
  expect((await readCollection("users")).filter((u) => u.role === "owner")).toHaveLength(1);
  await page.context().close();
});
