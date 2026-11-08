// tests/unit/fromPriceEverywhere.test.ts
// Item 15: every price a person reads is "from $X". Prices must be written through
// priceLabel.ts, never as a raw "$" + number. This scans the customer-facing and admin
// sources for the ways of writing a dollar amount by hand, so a new screen that skips the
// helper fails here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FINAL_PRICE_NOTE, fromPrice } from "../../src/lib/priceLabel";

const roots = [
  "src/components/booking",
  "src/components/admin",
  "src/components/ui",
  "src/pages",
  "functions/src/email",
];
const files = ["src/lib/emailRender.ts", "src/lib/notifications.ts", "src/lib/bookingHistory.ts",
  "src/lib/calendar.ts", "src/lib/icsEvent.ts", "functions/src/bookingCommands.ts"];

// Revenue figures are sums of money taken, not a price quoted to anyone, so "from" does not apply.
const REVENUE_ONLY = ["admin/analytics/", "admin\\analytics\\", "today/DayGlance.tsx", "today\\DayGlance.tsx"];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });

// A dollar sign written by hand in front of an interpolated amount or concatenation.
const HAND_WRITTEN = [/\$\$\{/, /\{\s*["']\$["']\s*\}/, /["']\$["']\s*\+/, /\\$\$\{/];

describe("prices are written through priceLabel", () => {
  const sources = [...roots.flatMap(walk), ...files].filter((p) => !REVENUE_ONLY.some((r) => p.includes(r)));
  it("scans a meaningful number of files", () => expect(sources.length).toBeGreaterThan(40));
  for (const path of sources) {
    it(path, () => {
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      const bad = lines
        .map((text, i) => ({ text, n: i + 1 }))
        .filter(({ text }) => !text.trim().startsWith("//") && HAND_WRITTEN.some((re) => re.test(text)));
      expect(bad, `hand-written price in ${path}: ${JSON.stringify(bad)}`).toEqual([]);
    });
  }
});

describe("the customer total", () => {
  it("always starts with 'from' and the note says the price is confirmed later", () => {
    expect(fromPrice(160)).toMatch(/^from \$/);
    expect(FINAL_PRICE_NOTE).toBe("Final price is confirmed at your appointment.");
  });
});
