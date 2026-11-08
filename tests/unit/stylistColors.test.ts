// tests/unit/stylistColors.test.ts
// Stylist colours (batch 1, item 5): every palette pair meets WCAG AA, no two
// stylists share a colour by default, the owner's choice wins, and a stylist's
// default does not move when the list is re-ordered.
import { describe, expect, it } from "vitest";
import { STYLIST_COLORS, colorById, resolveStylistColors } from "../../src/lib/stylistColors";
import { contrast } from "./contrast";

const LIGHT_PAGE = "#ffffff";
const DARK_PAGE = "#1b1b1a"; // --surface in dark mode

describe("palette contrast (WCAG AA)", () => {
  for (const c of STYLIST_COLORS) {
    it(`${c.name}: label text on its fill is 4.5:1 or better`, () => {
      expect(contrast(c.solidInk, c.solid)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.tintInk, c.tint)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${c.name}: the stripe / dot is 3:1 or better on the light and the dark page`, () => {
      expect(contrast(c.solid, LIGHT_PAGE)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.solid, DARK_PAGE)).toBeGreaterThanOrEqual(3);
    });
  }
  it("ids and fills are all different", () => {
    expect(new Set(STYLIST_COLORS.map((c) => c.id)).size).toBe(STYLIST_COLORS.length);
    expect(new Set(STYLIST_COLORS.map((c) => c.solid)).size).toBe(STYLIST_COLORS.length);
  });
});

const stylist = (id: string, createdAt: string, color?: string) => ({ id, createdAt, color });

describe("resolveStylistColors", () => {
  const five = [
    stylist("steve", "2025-01-01"),
    stylist("elly", "2025-01-02"),
    stylist("ethan", "2025-01-03"),
    stylist("harry", "2025-01-04"),
    stylist("yuto", "2025-01-05"),
  ];

  it("gives five stylists with nothing chosen five different colours", () => {
    const ids = [...resolveStylistColors(five).values()].map((c) => c.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("keeps the owner's choice, and nobody else gets that colour by default", () => {
    const withChoice = five.map((s) => (s.id === "yuto" ? { ...s, color: "rose" } : s));
    const result = resolveStylistColors(withChoice);
    expect(result.get("yuto")?.id).toBe("rose");
    const others = withChoice.filter((s) => s.id !== "yuto").map((s) => result.get(s.id)?.id);
    expect(others).not.toContain("rose");
    expect(new Set(others).size).toBe(4);
  });

  it("a default does not change when the list order changes", () => {
    const a = resolveStylistColors(five);
    const b = resolveStylistColors([...five].reverse());
    for (const s of five) expect(b.get(s.id)?.id).toBe(a.get(s.id)?.id);
  });

  it("ignores an unknown saved colour and gives a default", () => {
    const result = resolveStylistColors([stylist("a", "2025-01-01", "chartreuse")]);
    expect(colorById("chartreuse")).toBeUndefined();
    expect(result.get("a")).toBeDefined();
  });

  it("repeats the palette only when there are more stylists than colours", () => {
    const many = Array.from({ length: STYLIST_COLORS.length + 2 }, (_, i) =>
      stylist(`s${String(i).padStart(2, "0")}`, `2025-01-${String(i + 1).padStart(2, "0")}`),
    );
    const result = resolveStylistColors(many);
    expect(result.size).toBe(many.length);
    const firstTen = many.slice(0, STYLIST_COLORS.length).map((s) => result.get(s.id)?.id);
    expect(new Set(firstTen).size).toBe(STYLIST_COLORS.length);
  });
});
