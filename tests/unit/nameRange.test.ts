// tests/unit/nameRange.test.ts
// The Clients tab / Today search finds people by typing the START of their name
// using a Firestore range query. A stripped upper-bound character once made that
// range empty (every name search returned nothing) - these tests pin it.
import { describe, expect, it } from "vitest";
import { NAME_RANGE_END, namePrefixRange } from "../../src/lib/nameRange";

describe("namePrefixRange", () => {
  it("lowercases and trims what was typed", () => {
    expect(namePrefixRange("  Mia ").from).toBe("mia");
  });

  it("upper bound is the prefix plus U+F8FF, written as an escape", () => {
    expect(NAME_RANGE_END).toBe(String.fromCharCode(0xf8ff));
    expect(NAME_RANGE_END.length).toBe(1);
    expect(namePrefixRange("mia").to).toBe("mia");
  });

  it("the range is never empty: every name that starts with the prefix is inside it", () => {
    const { from, to } = namePrefixRange("Mia");
    expect(to > from).toBe(true);
    for (const name of ["mia", "mia multi", "miami", "mia-lee", "miaé"]) {
      expect(name >= from && name < to).toBe(true);
    }
    for (const name of ["mi", "mib", "lia multi", "zed"]) {
      expect(name >= from && name < to).toBe(false);
    }
  });
});
