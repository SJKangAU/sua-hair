// tests/unit/previewContrast.test.ts
// WCAG contrast of the colour pairs the day grid's preview uses (tokens from
// src/index.css). Text needs 4.5:1; the block's outline / fills need 3:1 against
// the white page behind them.
import { describe, expect, it } from "vitest";

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const lum = (h: string): number => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const T = {
  ink: "#161615",
  inkSoft: "#3a3a38",
  inkMuted: "#6b6a65",
  surface: "#ffffff",
  surfaceRaised: "#f0eeea",
  borderStrong: "#cfccc5",
};

describe("day grid preview contrast", () => {
  it("range label: ink on white", () => {
    expect(ratio(T.ink, T.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("hour / half-hour labels and the 'not available' tag: muted ink on white and on the muted shading", () => {
    expect(ratio(T.inkMuted, T.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(T.inkMuted, T.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
  });
  it("'Select' button: white on ink", () => {
    expect(ratio(T.surface, T.ink)).toBeGreaterThanOrEqual(4.5);
  });
  it("the block is distinguishable from the page: hands-on fill and outline against white", () => {
    expect(ratio(T.inkSoft, T.surface)).toBeGreaterThanOrEqual(3);
    expect(ratio(T.ink, T.surface)).toBeGreaterThanOrEqual(3);
  });
});
