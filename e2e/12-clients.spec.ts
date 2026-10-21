// e2e/12-clients.spec.ts
// The client directory and the client page (DEC-044 to DEC-049) through the real UI
// against the Firebase emulators (Auth + Firestore + Functions): search by name word,
// name start and phone, filters and paging, the client page (history, last visit,
// key numbers), notes, block (and the booking command refusing them), merge,
// anonymise, a stylist who sees only their own clients and no spend, the Fresha
// import and the "Build the client list" tool. Fake people only. TC-098 .. TC-108.
import { expect, test, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator, setClaims } from "./seed";
import { addDaysIso, submitDetails, toDetailsStep, todayIso, upcoming } from "./helpers";
import { newAdminPage } from "./admin";
import { buildClient, clientCardOf } from "../src/lib/clients";

test.use({ viewport: { width: 1300, height: 1300 } });
test.describe.configure({ mode: "serial" });

const TODAY = todayIso();
const ago = (days: number) => addDaysIso(TODAY, -days);
const ahead = (days: number) => addDaysIso(TODAY, days);

interface Visit {
  id: string;
  date: string;
  status?: string;
  price?: number;
  stylist?: "steve" | "yuto";
  time?: string;
}

const STYLISTS = { steve: "Steve Hwang", yuto: "Yuto Hirakawa" } as const;

const bookingDoc = (phone: string, name: string, v: Visit) => ({
  bookingType: "customer",
  status: v.status ?? "completed",
  customerName: name,
  customerNameLower: name.toLowerCase(),
  customerPhone: phone,
  clientId: phone,
  stylistId: v.stylist ?? "steve",
  stylistName: STYLISTS[v.stylist ?? "steve"],
  stylistLevel: v.stylist === "yuto" ? "senior" : "director",
  serviceId: "mens-cut",
  serviceName: "Men's Cut",
  servicePrice: v.price ?? 75,
  services: [{ id: "mens-cut", name: "Men's Cut", price: v.price ?? 75, activeTime: 45, restTime: 0, totalTime: 45 }],
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  date: v.date,
  time: v.time ?? "10:00 AM",
  createdAt: `${v.date}T00:00:00.000Z`,
});

interface ClientSeed {
  phone: string;
  name: string;
  visits?: Visit[];
  tags?: string[];
  blocked?: boolean;
  blockReason?: string;
  createdAt?: string;
  email?: string;
}

/**
 * Writes a client (and its card) as the server would, plus their bookings. Rules bypassed.
 * The client and card go in FIRST: each booking write fires the onBookingWritten trigger,
 * which rebuilds the client from its bookings and keeps what the owner set (blocked, tags)
 * from the stored record. A trigger that ran before the record existed could write a
 * client without "blocked" over the seed on a slow machine (CI), so it never gets the chance.
 */
async function seedClients(list: ClientSeed[]): Promise<void> {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const bookingsOf = (c: ClientSeed) => (c.visits ?? []).map((v) => ({ id: v.id, ...bookingDoc(c.phone, c.name, v) }));
      for (const c of list) {
        const client = buildClient(
          c.phone,
          bookingsOf(c) as never,
          {
            tags: c.tags ?? [],
            blocked: c.blocked === true,
            ...(c.blockReason ? { blockReason: c.blockReason } : {}),
            ...(c.email ? { email: c.email } : {}),
            name: c.name,
            source: "online",
            createdAt: c.createdAt ?? "2025-01-01T00:00:00.000Z",
          },
          TODAY,
          new Date().toISOString(),
        );
        await db.doc(`clients/${c.phone}`).set(client);
        await db.doc(`clientCards/${c.phone}`).set(clientCardOf(client, c.phone));
      }
      for (const c of list) {
        for (const b of bookingsOf(c)) {
          const { id, ...data } = b;
          await db.doc(`bookings/${id}`).set(data);
          await db.doc(`slotBlocks/${id}`).set({
            stylistId: data.stylistId, date: data.date, time: data.time, activeTime: 45, totalTime: 45,
            restTime: 0, status: data.status,
          });
        }
      }
    });
  } finally {
    await env.cleanup();
  }
}

const CLIENTS: ClientSeed[] = [
  {
    phone: "0400000001", name: "Jade Lee", email: "jade.lee@example.test",
    visits: [
      { id: "j1", date: ago(60) },
      { id: "j2", date: ago(10), price: 80 },
      { id: "j3", date: ahead(7), status: "confirmed" },
    ],
  },
  {
    phone: "0400000002", name: "Sam Walker",
    visits: [
      { id: "s1", date: ago(200), stylist: "yuto", price: 65 },
      { id: "s2", date: ago(150), stylist: "yuto", status: "no_show" },
    ],
  },
  { phone: "0400000003", name: "Rae Lee", visits: [{ id: "r1", date: ago(5), price: 90 }] },
  { phone: "0400000004", name: "Pat Blocked", blocked: true, blockReason: "Private reason", visits: [{ id: "p1", date: ago(30) }] },
  { phone: "0400000011", name: "Jade Leigh", visits: [{ id: "d1", date: ago(20), price: 100, time: "11:00 AM" }] },
  {
    phone: "0400000012", name: "Zed Remove",
    visits: [
      { id: "z1", date: ago(40), time: "12:00 PM" },
      { id: "z2", date: ago(15), time: "1:00 PM" },
    ],
  },
  { phone: "0400000013", name: "Nia Newcomer", createdAt: `${ago(3)}T00:00:00.000Z` },
];

const row = (page: Page, name: string) => page.getByTestId("client-row").filter({ hasText: name });
const bookings = async () => await readCollection("bookings");

async function openClients(page: Page, q = "") {
  await page.goto(`/admin/clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  await expect(page.getByTestId("client-directory")).toBeVisible();
}

const search = async (page: Page, text: string) => {
  await page.getByTestId("client-search").fill(text);
};

test.beforeEach(async () => {
  await seedEmulator();
  await seedClients(CLIENTS);
});

test("TC-098 search finds a client by a word of their name, the start of their name, or their mobile number", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openClients(page);
  await expect(page.getByTestId("client-row")).toHaveCount(CLIENTS.length);

  await search(page, "lee"); // a word: Jade Lee and Rae Lee, not Jade Leigh
  await expect(page.getByTestId("client-row")).toHaveCount(2);
  await expect(row(page, "Jade Lee")).toBeVisible();
  await expect(row(page, "Rae Lee")).toBeVisible();

  await search(page, "jad"); // the start of the name
  await expect(page.getByTestId("client-row")).toHaveCount(2);
  await expect(row(page, "Jade Leigh")).toBeVisible();

  await search(page, "0400000012"); // a mobile number
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Zed Remove")).toBeVisible();

  await search(page, "+61 400 000 003"); // however it is written
  await expect(row(page, "Rae Lee")).toBeVisible();

  await search(page, "nobody at all");
  await expect(page.getByTestId("client-empty")).toContainText("No clients match");

  await search(page, "z"); // under 2 characters is not a search: the whole list again
  await expect(page.getByTestId("client-row")).toHaveCount(CLIENTS.length);
  await page.context().close();
});

test("TC-099 the Today page's search sends someone straight into the directory with that search", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openClients(page, "zed");
  await expect(page.getByTestId("client-search")).toHaveValue("zed");
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await page.context().close();
});

test("TC-100 the client page shows history, last visit and the key numbers; also as a full page", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openClients(page);
  await row(page, "Jade Lee").click();
  const drawer = page.getByTestId("client-drawer");
  await expect(drawer.getByTestId("client-name")).toHaveText("Jade Lee");
  await expect(drawer.getByTestId("stat-visits")).toHaveText("2");
  await expect(drawer.getByTestId("stat-spend")).toHaveText("$155"); // 75 + 80; the future booking is not counted
  await expect(drawer.getByTestId("stat-average")).toHaveText("$77.50");
  await expect(drawer.getByTestId("stat-stylist")).toHaveText("Steve Hwang");
  await expect(drawer.getByTestId("stat-services")).toHaveText("Men's Cut");
  await expect(drawer.getByTestId("stat-next")).toContainText("10:00 AM");
  await expect(drawer.getByTestId("stat-cancel")).toHaveText("0");
  // the history: upcoming first, then past, newest first
  await expect(drawer.getByTestId("history-row")).toHaveCount(3);
  await expect(drawer.getByTestId("history-row").first()).toContainText("Confirmed");
  await expect(drawer.getByTestId("history-row").last()).toContainText("Completed");

  await drawer.getByTestId("open-full-page").click();
  await expect(page).toHaveURL(/\/admin\/clients\/0400000001$/);
  await expect(page.getByTestId("client-name")).toHaveText("Jade Lee");
  await expect(page.getByTestId("stat-visits")).toHaveText("2");
  // a history row opens that booking
  await page.getByTestId("history-row").first().click();
  await expect(page).toHaveURL(/\/admin\/today\?date=.*booking=j3/);
  await page.context().close();
});

test("TC-101 notes: add, pin (pinned first), see who wrote them, delete", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients/0400000001");
  await expect(page.getByTestId("client-name")).toHaveText("Jade Lee");
  await page.getByTestId("note-input").fill("Prefers mornings");
  await page.getByTestId("note-add").click();
  await expect(page.getByTestId("note")).toHaveCount(1);
  await expect(page.getByTestId("note").first()).toContainText("Prefers mornings");
  await expect(page.getByTestId("note").first()).toContainText("owner@suahair.test"); // who wrote it

  await page.getByTestId("note-input").fill("Allergic to ammonia");
  await page.getByTestId("note-add").click();
  await expect(page.getByTestId("note")).toHaveCount(2);
  await expect(page.getByTestId("note").first()).toContainText("Allergic to ammonia"); // newest first

  await page.getByTestId("note").nth(1).getByTestId("note-pin").click(); // pin the older one
  await expect(page.getByTestId("note").first()).toContainText("Prefers mornings");
  await expect(page.getByTestId("note").first()).toHaveAttribute("data-pinned", "true");

  await page.getByTestId("note").first().getByTestId("note-delete").click();
  await expect(page.getByTestId("note")).toHaveCount(1);
  await page.context().close();
});

test("TC-102 blocking a client: a badge, an audit entry, and the booking command refuses them", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients/0400000001");
  await page.getByTestId("hk-block").click();
  await page.getByTestId("block-reason").fill("Private reason");
  await page.getByTestId("block-confirm").click();
  await expect(page.getByTestId("blocked-badge")).toBeVisible();
  await expect(page.getByTestId("block-reason-shown")).toContainText("Private reason"); // the owner sees why
  await page.getByRole("button", { name: /Show \(/ }).click();
  await expect(page.getByTestId("audit-entry").first()).toContainText("block");

  // the customer is told to call, and nothing is booked
  const customer = await browser.newContext({ baseURL: "http://127.0.0.1:5174", locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1200, height: 1000 } });
  const cp = await customer.newPage();
  const before = (await bookings()).length;
  await toDetailsStep(cp, { services: ["Men's Cut"], stylist: "Steve", date: upcoming(2, 4), time: "11:00 AM", phone: "", name: "" });
  await submitDetails(cp, { phone: "0400 000 001", name: "Jade Lee" });
  await expect(cp.getByText("Please call the salon to book")).toBeVisible();
  expect((await bookings()).length).toBe(before);
  await customer.close();

  // unblocking lets them book again
  await page.getByTestId("hk-block").click();
  await page.getByTestId("block-confirm").click();
  await expect(page.getByTestId("blocked-badge")).toHaveCount(0);
  await page.context().close();
});

test("TC-103 merging a duplicate moves their bookings onto the client you keep and keeps the other name as an alias", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients/0400000001");
  await expect(page.getByTestId("history-row")).toHaveCount(3);
  await page.getByTestId("hk-merge").click();
  await page.getByTestId("merge-search").fill("leigh");
  await page.getByTestId("merge-candidate").filter({ hasText: "Jade Leigh" }).click();
  await expect(page.getByTestId("keep-this")).toBeChecked();
  await page.getByTestId("merge-confirm").click();
  await expect(page.getByText(/Merged: 1 booking/)).toBeVisible();
  await expect(page.getByTestId("history-row")).toHaveCount(4); // the duplicate's booking is now hers
  await expect(page.getByTestId("stat-visits")).toHaveText("3");
  await expect(page.getByTestId("client-view")).toContainText("Also seen as Jade Leigh");

  // the old spelling still finds her (it is an alias), but there is one record, not two
  await openClients(page, "leigh");
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Jade Lee")).toBeVisible();
  await search(page, "0400000011"); // the duplicate's own number: that record is gone
  await expect(page.getByTestId("client-empty")).toBeVisible();
  const moved = (await bookings()).find((b) => b.id === "d1") as unknown as { clientId: string };
  expect(moved.clientId).toBe("0400000001");
  await page.context().close();
});

test("TC-104 anonymising shows how many bookings it affects, then removes the personal data and keeps the bookings", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/clients/0400000012");
  await page.getByTestId("hk-anonymise").click();
  await expect(page.getByTestId("anon-count")).toHaveText("2");
  await expect(page.getByTestId("anon-confirm")).toBeDisabled(); // until they tick "I understand"
  await page.getByTestId("anon-understand").check();
  await page.getByTestId("anon-confirm").click();
  await expect(page).toHaveURL(/\/admin\/clients$/);

  await search(page, "zed");
  await expect(page.getByTestId("client-empty")).toBeVisible();
  const kept = (await bookings()).filter((b) => b.id === "z1" || b.id === "z2") as unknown as Record<string, unknown>[];
  expect(kept).toHaveLength(2);
  for (const b of kept) {
    expect(b).toMatchObject({ customerName: "Deleted Customer", customerPhone: null, servicePrice: 75, status: "completed" });
    expect(String(b.clientId)).toMatch(/^deleted-/);
  }
  expect(JSON.stringify(kept)).not.toMatch(/Zed|0400000012/);
  await page.context().close();
});

test("TC-105 filters: lapsed, new, blocked, has a booking, has no-shows", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await openClients(page);
  const names = async () => (await page.getByTestId("client-row").allInnerTexts()).map((t) => t.split("\n")[0].replace(/\s*Blocked$/, ""));

  await page.getByTestId("filter-lapsed").click(); // visited, but not in the last 90 days
  await expect(row(page, "Sam Walker")).toBeVisible();
  await expect(page.getByTestId("client-row")).toHaveCount(1);

  await page.getByTestId("filter-new").click(); // added in the last 30 days
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Nia Newcomer")).toBeVisible();

  await page.getByTestId("filter-blocked").click();
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Pat Blocked")).toBeVisible();

  await page.getByTestId("filter-upcoming").click();
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Jade Lee")).toBeVisible();

  await page.getByTestId("filter-noshows").click();
  await expect(page.getByTestId("client-row")).toHaveCount(1);
  await expect(row(page, "Sam Walker")).toBeVisible();

  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("client-row")).toHaveCount(CLIENTS.length);
  // sorting: by name, by spend
  await page.getByTestId("client-sort").selectOption("name");
  await expect.poll(async () => (await names())[0]).toBe("Jade Lee");
  await page.getByTestId("client-sort").selectOption("spend");
  await expect.poll(async () => (await names())[0]).toBe("Jade Lee"); // $155 is the most
  await page.context().close();
});

test("TC-106 the list is paged: 25 at a time, then Show more", async ({ browser }) => {
  const bulk: ClientSeed[] = Array.from({ length: 30 }, (_, i) => ({
    phone: `04001${String(i).padStart(5, "0")}`,
    name: `Bulk Client ${String(i).padStart(2, "0")}`,
  }));
  await seedClients(bulk);
  const { page } = await newAdminPage(browser);
  await openClients(page);
  await expect(page.getByTestId("client-row")).toHaveCount(25);
  await page.getByTestId("client-more").click();
  await expect(page.getByTestId("client-row")).toHaveCount(CLIENTS.length + 30);
  await expect(page.getByTestId("client-more")).toHaveCount(0);
  await search(page, "bulk");
  await expect(page.getByTestId("client-row")).toHaveCount(25); // a search pages too
  await page.getByTestId("client-more").click();
  await expect(page.getByTestId("client-row")).toHaveCount(30);
  await page.context().close();
});

test("TC-107 a stylist sees only their own clients, no spend, no blocked reason; and can add a note", async ({ browser }) => {
  const signUp = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "steve@suahair.test", password: "E2e-stylist-pass-2", returnSecureToken: true }),
  });
  const uid = ((await signUp.json()) as { localId: string }).localId;
  await setClaims(uid, { role: "stylist", stylistId: "steve" });
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:5174", locale: "en-AU", timezoneId: "Australia/Melbourne", viewport: { width: 1200, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByPlaceholder("admin@suahair.com.au").fill("steve@suahair.test");
  await page.getByPlaceholder("••••••••").fill("E2e-stylist-pass-2");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/stylist\//);
  await page.getByRole("link", { name: "My clients" }).click();
  await expect(page).toHaveURL(/\/stylist\/clients$/);

  // Steve's clients: Jade Lee, Rae Lee, Pat Blocked, Jade Leigh, Zed Remove. Not Sam (Yuto's).
  await expect(row(page, "Jade Lee")).toBeVisible();
  await expect(row(page, "Sam Walker")).toHaveCount(0);
  await search(page, "sam");
  await expect(page.getByTestId("client-empty")).toBeVisible();
  await search(page, "");
  await expect(page.locator("body")).not.toContainText("$"); // no spend anywhere in the list
  await expect(page.getByTestId("filter-all")).toHaveCount(0); // no owner filters

  await row(page, "Jade Lee").click();
  await expect(page).toHaveURL(/\/stylist\/clients\/0400000001$/);
  await expect(page.getByTestId("client-name")).toHaveText("Jade Lee");
  await expect(page.getByTestId("history-row")).toHaveCount(3); // their own bookings with her
  await expect(page.getByTestId("client-stats")).toHaveCount(0); // no total spend
  await expect(page.getByTestId("client-housekeeping")).toHaveCount(0);
  await expect(page.getByTestId("book-again")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Total spend");

  await page.getByTestId("note-input").fill("Likes a quiet chair");
  await page.getByTestId("note-add").click();
  await expect(page.getByTestId("note").first()).toContainText("Likes a quiet chair");
  await expect(page.getByTestId("note-delete")).toHaveCount(1); // their own note only

  // a client of another stylist is not there, even by URL
  await page.goto("/stylist/clients/0400000002");
  await expect(page.getByTestId("client-not-found")).toBeVisible();

  // a blocked client's reason is the owner's alone
  await page.goto("/stylist/clients/0400000004");
  await expect(page.getByTestId("blocked-badge")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Private reason");
  await context.close();
});

test("TC-108 import then directory: imported clients appear with no history; rollback removes them; an existing client is untouched", async ({ browser }) => {
  const { page } = await newAdminPage(browser);
  await page.goto("/admin/manage");
  await page.getByTestId("client-import-file").setInputFiles("tests/fixtures/clients-synthetic.csv");
  await expect(page.getByTestId("client-import-dryrun")).toBeVisible();
  await page.getByRole("button", { name: /^Import \d+ clients/ }).click();
  await expect(page.getByTestId("client-import-done")).toBeVisible();

  await openClients(page);
  await search(page, "test client 1");
  await expect(row(page, "Test Client 1")).toBeVisible();
  await row(page, "Test Client 1").first().click();
  const drawer = page.getByTestId("client-drawer");
  await expect(drawer.getByTestId("stat-visits")).toHaveText("0");
  await expect(drawer.getByTestId("client-history")).toContainText("No bookings yet");
  await page.getByTestId("close-drawer").click();
  // the seeded client is not touched by the import
  await search(page, "jade lee");
  await expect(row(page, "Jade Lee")).toBeVisible();

  await page.goto("/admin/manage");
  await page.getByRole("button", { name: "Roll back" }).first().click();
  await page.getByRole("button", { name: "Yes, roll back" }).click();
  await expect(page.getByTestId("client-import-batch")).toContainText("rolled back");
  await openClients(page);
  await search(page, "test client");
  await expect(page.getByTestId("client-empty")).toBeVisible();
  await search(page, "jade lee");
  await expect(row(page, "Jade Lee")).toBeVisible();
  await page.context().close();
});

test("TC-109 Build the client list: dry run, apply, and the clients appear; rollback removes what it made", async ({ browser }) => {
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("customerLookups/0400555001").set({ name: "Visit Record One", lastVisit: "", visitCount: 0 });
    await db.doc("customerLookups/0400555002").set({ name: "Visit Record Two", lastVisit: "", visitCount: 0, blocked: true });
  });
  await env.cleanup();

  const { page } = await newAdminPage(browser);
  await page.goto("/admin/manage");
  await page.getByTestId("backfill-dry").click();
  await expect(page.getByTestId("backfill-result")).toBeVisible();
  await expect(page.getByTestId("backfill-clientsToCreate")).toHaveText("2");
  await expect(page.getByTestId("backfill-visitRecordsOnly")).toHaveText("2");
  await expect(page.getByTestId("backfill-result")).toContainText("nothing has been written yet");
  await page.getByTestId("backfill-apply").click();
  await expect(page.getByTestId("backfill-batch").first()).toContainText("2 clients added");

  await openClients(page);
  await search(page, "visit record");
  await expect(page.getByTestId("client-row")).toHaveCount(2);
  await expect(row(page, "Visit Record Two")).toContainText("Blocked");

  await page.goto("/admin/manage");
  await page.getByTestId("backfill-batch").first().getByRole("button", { name: "Roll back" }).click();
  await page.getByRole("button", { name: "Yes, roll back" }).click();
  await expect(page.getByTestId("backfill-batch").first()).toContainText("rolled back");
  await openClients(page);
  await search(page, "visit record");
  await expect(page.getByTestId("client-empty")).toBeVisible();
  await page.context().close();
});
