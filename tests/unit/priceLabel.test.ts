// tests/unit/priceLabel.test.ts
// A service price is always written "from $X" (batch 1, item 15).
import { describe, expect, it } from "vitest";
import { fromPrice, fromPriceChange, fromPrices } from "../../src/lib/priceLabel";

describe("fromPrice", () => {
  it("writes a whole-dollar price as 'from $X'", () => {
    expect(fromPrice(85)).toBe("from $85");
    expect(fromPrice(0)).toBe("from $0");
  });
  it("keeps cents when there are some", () => {
    expect(fromPrice(42.5)).toBe("from $42.50");
  });
  it("writes a price change with one 'from'", () => {
    expect(fromPriceChange(60, 90)).toBe("from $60 to $90");
  });
  it("writes the three stylist-level prices after one 'from'", () => {
    expect(fromPrices([75, 65, 55])).toBe("from $75 / $65 / $55");
  });
});
