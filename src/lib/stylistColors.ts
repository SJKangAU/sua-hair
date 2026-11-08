// stylistColors.ts
// One colour per stylist, used on the Today columns, booking cards and the
// stylist filter chips so a booking can be tied to a stylist at a glance.
//
// Each palette entry is a pair of self-contained colour sets, so it reads the same
// in light and dark mode (neither set follows the theme tokens):
//   solid + solidInk  stripes, dots, avatars and a selected filter chip. The solid
//                     colour is 3:1 or better against both the light page (#ffffff)
//                     and the dark page (#1b1b1a); white text on it is 4.5:1 or better.
//   tint  + tintInk   a light card background with near-black text (4.5:1 or better).
// tests/unit/stylistColors.test.ts checks every number above.
//
// The stylist's choice is stored as the palette id (`color` on the stylist
// document). A stylist with none chosen gets the first palette colour no other
// stylist uses, in a stable order, so no two stylists share a colour by default.

export interface StylistColor {
  id: string;
  name: string;
  solid: string;
  solidInk: string;
  tint: string;
  tintInk: string;
}

const INK = "#161615";
const WHITE = "#ffffff";

export const STYLIST_COLORS: readonly StylistColor[] = [
  { id: "rose", name: "Rose", solid: "#d81b60", solidInk: WHITE, tint: "#fbdde8", tintInk: INK },
  { id: "coral", name: "Coral", solid: "#c8472b", solidInk: WHITE, tint: "#fadfd6", tintInk: INK },
  { id: "amber", name: "Amber", solid: "#a85f00", solidInk: WHITE, tint: "#f8e6c4", tintInk: INK },
  { id: "olive", name: "Olive", solid: "#667a1e", solidInk: WHITE, tint: "#e5edc9", tintInk: INK },
  { id: "green", name: "Green", solid: "#1f7a45", solidInk: WHITE, tint: "#d3efdd", tintInk: INK },
  { id: "teal", name: "Teal", solid: "#0f766e", solidInk: WHITE, tint: "#cdeeea", tintInk: INK },
  { id: "sky", name: "Sky", solid: "#1a6fa8", solidInk: WHITE, tint: "#d3e6f6", tintInk: INK },
  { id: "indigo", name: "Indigo", solid: "#5865d6", solidInk: WHITE, tint: "#dcdffa", tintInk: INK },
  { id: "violet", name: "Violet", solid: "#8d4cc4", solidInk: WHITE, tint: "#e8dbf5", tintInk: INK },
  { id: "plum", name: "Plum", solid: "#ab3a9e", solidInk: WHITE, tint: "#f3d9ef", tintInk: INK },
];

export const colorById = (id: string | undefined | null): StylistColor | undefined =>
  STYLIST_COLORS.find((c) => c.id === id);

interface ColourableStylist {
  id: string;
  color?: string;
  createdAt?: string;
}

/**
 * The colour of every stylist: the one the owner chose, else the first palette
 * colour nobody else has (taking stylists in creation order, then id, so a
 * stylist's default does not change when the list is re-ordered). With more
 * stylists than colours the palette repeats.
 */
export const resolveStylistColors = (
  stylists: readonly ColourableStylist[],
): Map<string, StylistColor> => {
  const result = new Map<string, StylistColor>();
  const taken = new Set<string>();
  for (const s of stylists) {
    const chosen = colorById(s.color);
    if (chosen) {
      result.set(s.id, chosen);
      taken.add(chosen.id);
    }
  }
  const unchosen = stylists
    .filter((s) => !result.has(s.id))
    .sort(
      (a, b) =>
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id),
    );
  let repeat = 0;
  for (const s of unchosen) {
    const free = STYLIST_COLORS.find((c) => !taken.has(c.id));
    if (free) {
      result.set(s.id, free);
      taken.add(free.id);
    } else {
      result.set(s.id, STYLIST_COLORS[repeat % STYLIST_COLORS.length]);
      repeat += 1;
    }
  }
  return result;
};
