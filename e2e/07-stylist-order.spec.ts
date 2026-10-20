// e2e/07-stylist-order.spec.ts
// Owner reorders stylists in Manage (drag handle, Move up / Move down, keyboard);
// the order persists, is shown on the public booking page and the admin
// timeline, falls back sensibly when `order` is missing, and rolls back with an
// error toast if saving fails. Runs against the Firestore + Auth emulators.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { connectEnv, readCollection, seedEmulator } from "./seed";
import { newAdminPage } from "./admin";
import { BASE_URL } from "./admin";
import { readFileSync } from "node:fs";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1300, height: 1400 } });

// Seeded without any `order` field, so the starting order is the fallback one:
// start date (all equal) then id.
const SEEDED = ["elly", "ethan", "harry", "steve", "yuto"];

let page: Page;

test.beforeAll(async ({ browser }) => {
  await seedEmulator();
  ({ page } = await newAdminPage(browser));
});
test.afterAll(async () => {
  await page.context().close();
});

const rosterOrder = (p: Page) =>
  p.locator('[data-testid^="stylist-row-"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.testid!.replace("stylist-row-", "")),
  );

const openManage = async (p: Page) => {
  await p.goto("/admin/manage");
  await expect(p.getByTestId("stylist-row-steve")).toBeVisible();
};

/** What a customer sees, in a fresh browser context (nothing cached). */
async function customerOrder(browser: Browser): Promise<string[]> {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "en-AU", timezoneId: "Australia/Melbourne" });
  const p = await ctx.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: /Men's Cut/ }).first().dispatchEvent("click");
  await p.getByRole("button", { name: "Continue" }).dispatchEvent("click");
  await expect(p.getByText("Any Available Stylist")).toBeVisible();
  const text = await p.locator("body").innerText();
  await ctx.close();
  const names: Record<string, string> = {
    elly: "Elly Lee", ethan: "Ethan Le", harry: "Harry Yang", steve: "Steve Hwang", yuto: "Yuto Hirakawa",
  };
  return Object.keys(names).sort((a, b) => text.indexOf(names[a]) - text.indexOf(names[b]));
}

async function adminTimelineOrder(p: Page): Promise<string[]> {
  await p.goto("/admin/today");
  await expect(p.getByText("Steve · Director").first()).toBeVisible();
  const text = await p.locator("main").innerText();
  const heads: Record<string, string> = {
    elly: "Elly · Senior", ethan: "Ethan · Junior", harry: "Harry · Junior", steve: "Steve · Director", yuto: "Yuto · Senior",
  };
  return Object.keys(heads).sort((a, b) => text.indexOf(heads[a]) - text.indexOf(heads[b]));
}

const savedOrder = async () =>
  Object.fromEntries((await readCollection("stylists")).map((s) => [s.id, s.order]));

test("with no `order` saved, the existing order is kept everywhere", async ({ browser }) => {
  await openManage(page);
  expect(await rosterOrder(page)).toEqual(SEEDED);
  expect(await customerOrder(browser)).toEqual(SEEDED);
  expect(await adminTimelineOrder(page)).toEqual(SEEDED);
});

test("the owner sees drag handles and Move up / Move down on every row; the ends are disabled", async () => {
  await openManage(page);
  for (const id of SEEDED) {
    await expect(page.getByRole("button", { name: new RegExp(`^Drag to reorder`) })).toHaveCount(5);
    await expect(page.getByTestId(`stylist-row-${id}`)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Move Elly Lee up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move Yuto Hirakawa down" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move Steve Hwang up" })).toBeEnabled();
});

test("Move up changes the order, saves only `order`, and persists after reload", async ({ browser }) => {
  const before = await readCollection("stylists");
  await openManage(page);
  await page.getByRole("button", { name: "Move Steve Hwang up" }).click();
  await expect.poll(() => rosterOrder(page)).toEqual(["elly", "ethan", "steve", "harry", "yuto"]);

  // saved: every stylist numbered by position
  await expect.poll(savedOrder).toEqual({ elly: 0, ethan: 1, steve: 2, harry: 3, yuto: 4 });
  // nothing else about any stylist changed
  const after = await readCollection("stylists");
  for (const b of before) {
    const a = after.find((x) => x.id === b.id)!;
    const { order: _o, ...restAfter } = a as Record<string, unknown>;
    void _o;
    expect(restAfter).toEqual(b);
  }

  // persists
  await page.reload();
  await expect(page.getByTestId("stylist-row-steve")).toBeVisible();
  expect(await rosterOrder(page)).toEqual(["elly", "ethan", "steve", "harry", "yuto"]);

  // ...and shows on the booking page and the admin timeline
  expect(await customerOrder(browser)).toEqual(["elly", "ethan", "steve", "harry", "yuto"]);
  expect(await adminTimelineOrder(page)).toEqual(["elly", "ethan", "steve", "harry", "yuto"]);
});

test("Move down works too", async () => {
  await openManage(page);
  await page.getByRole("button", { name: "Move Elly Lee down" }).click();
  await expect.poll(() => rosterOrder(page)).toEqual(["ethan", "elly", "steve", "harry", "yuto"]);
  await expect.poll(savedOrder).toEqual({ ethan: 0, elly: 1, steve: 2, harry: 3, yuto: 4 });
});

test("dragging a row by its handle reorders and persists", async ({ browser }) => {
  await openManage(page);
  const handle = page.getByRole("button", { name: "Drag to reorder Yuto Hirakawa" });
  const top = page.getByTestId("stylist-row-ethan");
  const h = (await handle.boundingBox())!;
  const t = (await top.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y - 20, { steps: 5 });
  await page.mouse.move(h.x + h.width / 2, t.y + 6, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => rosterOrder(page)).toEqual(["yuto", "ethan", "elly", "steve", "harry"]);
  await expect.poll(savedOrder).toEqual({ yuto: 0, ethan: 1, elly: 2, steve: 3, harry: 4 });

  await page.reload();
  await expect(page.getByTestId("stylist-row-yuto")).toBeVisible();
  expect(await rosterOrder(page)).toEqual(["yuto", "ethan", "elly", "steve", "harry"]);
  expect(await customerOrder(browser)).toEqual(["yuto", "ethan", "elly", "steve", "harry"]);
});

test("keyboard: Space picks a row up, an arrow moves it, Space drops it", async () => {
  await openManage(page);
  const handle = page.getByRole("button", { name: "Drag to reorder Harry Yang" });
  await handle.focus();
  // dnd-kit attaches its key listeners just after pick-up: give each step a beat
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(250);
  await page.keyboard.press("Space");
  await expect.poll(() => rosterOrder(page)).toEqual(["yuto", "ethan", "elly", "harry", "steve"]);
  await expect.poll(savedOrder).toEqual({ yuto: 0, ethan: 1, elly: 2, harry: 3, steve: 4 });
});

test("a stylist added later (no order) goes after the ordered ones", async () => {
  const env = await connectEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("stylists/newhire").set({
      name: "Nina Newhire", role: "Junior Stylist", level: "junior", status: "active",
      isTrainer: false, startDate: "2020-01-01", createdAt: new Date().toISOString(),
    });
  });
  await env.cleanup();
  await page.evaluate(() => sessionStorage.clear()); // the roster caches its list per session
  await openManage(page);
  // startDate 2020 would sort it FIRST under the old fallback; saved order wins
  expect(await rosterOrder(page)).toEqual(["yuto", "ethan", "elly", "harry", "steve", "newhire"]);
});

test("if saving fails the order is put back and an error toast is shown", async () => {
  await openManage(page);
  const before = await rosterOrder(page);
  const savedBefore = await savedOrder();

  // make the emulator refuse every stylist write, then restore the real rules
  const real = readFileSync("firestore.rules", "utf8");
  const put = (rules: string) =>
    fetch("http://127.0.0.1:8085/emulator/v1/projects/demo-sua-e2e:securityRules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
    });
  const deny = real.replace(
    /match \/stylists\/\{stylistId\} \{[\s\S]*?\r?\n {4}\}\r?\n/,
    "match /stylists/{stylistId} {\n allow read: if true;\n allow write: if false;\n }\n",
  );
  expect(deny).not.toEqual(real);
  expect((await put(deny)).ok).toBe(true);
  try {
    await page.getByRole("button", { name: "Move Harry Yang up" }).click();
    await expect(page.getByText(/Couldn't save the new order/)).toBeVisible();
    await expect.poll(() => rosterOrder(page)).toEqual(before); // rolled back
    expect(await savedOrder()).toEqual(savedBefore); // nothing was written
  } finally {
    expect((await put(real)).ok).toBe(true);
  }
});
