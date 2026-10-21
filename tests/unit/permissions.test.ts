// tests/unit/permissions.test.ts
// What a stylist may do beyond the day-to-day (FR-026, DEC-052): cleaning what the owner
// chose, the effective list (role defaults + grants - denials), turning ticked boxes back
// into overrides, and the token claim. Pure.
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_INFO,
  can,
  capabilitiesFromClaims,
  claimsForCapabilities,
  effectiveCapabilities,
  normaliseDefaults,
  normalisePermissions,
  overridesFor,
} from "../../src/lib/permissions";

describe("normalisePermissions / normaliseDefaults", () => {
  it("nothing, or rubbish, is nothing", () => {
    for (const raw of [undefined, null, "msg", 5, [], {}, { grant: "editMessages" }]) {
      expect(normalisePermissions(raw)).toEqual({ grant: [], deny: [] });
    }
    expect(normaliseDefaults("editMessages")).toEqual([]);
    expect(normaliseDefaults(null)).toEqual([]);
  });

  it("keeps known capabilities once each and drops the rest", () => {
    expect(normaliseDefaults(["editMessages", "editMessages", "fly", 3, null, "sendWinBack"])).toEqual([
      "editMessages",
      "sendWinBack",
    ]);
  });

  it("a denial beats a grant of the same thing", () => {
    expect(normalisePermissions({ grant: ["editMessages", "sendWinBack"], deny: ["editMessages"] })).toEqual({
      grant: ["sendWinBack"],
      deny: ["editMessages"],
    });
  });
});

describe("effectiveCapabilities", () => {
  it("is the role defaults, plus grants, minus denials", () => {
    expect(effectiveCapabilities(["editMessages"], { grant: [], deny: [] })).toEqual(["editMessages"]);
    expect(effectiveCapabilities(["editMessages"], { grant: ["approveTimeOff"], deny: [] })).toEqual([
      "editMessages",
      "approveTimeOff",
    ]);
    expect(effectiveCapabilities(["editMessages", "sendWinBack"], { grant: [], deny: ["sendWinBack"] })).toEqual([
      "editMessages",
    ]);
  });

  it("a denial wins even over a grant and the default together, and the order is always the same", () => {
    expect(effectiveCapabilities(["editMessages"], { grant: ["editMessages"], deny: ["editMessages"] })).toEqual([]);
    expect(effectiveCapabilities(["editClientRecords", "editMessages"], { grant: [], deny: [] })).toEqual([
      "editMessages",
      "editClientRecords",
    ]);
  });

  it("no defaults and no overrides is nothing", () => {
    expect(effectiveCapabilities([], { grant: [], deny: [] })).toEqual([]);
  });
});

describe("overridesFor", () => {
  it("turns ticked boxes into the overrides that reproduce them", () => {
    const defaults = ["editMessages", "sendWinBack"] as const;
    for (const wanted of [
      [],
      ["editMessages"],
      ["editMessages", "sendWinBack"],
      ["approveTimeOff"],
      [...CAPABILITIES],
    ] as const) {
      const p = overridesFor([...defaults], [...wanted]);
      expect(effectiveCapabilities([...defaults], p)).toEqual(CAPABILITIES.filter((c) => wanted.includes(c)));
    }
  });

  it("stores only what differs from the default", () => {
    expect(overridesFor(["editMessages"], ["editMessages", "approveTimeOff"])).toEqual({
      grant: ["approveTimeOff"],
      deny: [],
    });
    expect(overridesFor(["editMessages"], [])).toEqual({ grant: [], deny: ["editMessages"] });
    expect(overridesFor(["editMessages"], ["editMessages"])).toEqual({ grant: [], deny: [] });
  });
});

describe("the token claim", () => {
  it("none adds nothing to the token", () => {
    expect(claimsForCapabilities([])).toEqual({});
  });

  it("round-trips through short codes", () => {
    for (const caps of [[], ["editMessages"], [...CAPABILITIES]] as const) {
      expect(capabilitiesFromClaims({ role: "stylist", ...claimsForCapabilities([...caps]) })).toEqual([...caps]);
    }
    expect(claimsForCapabilities(["editMessages", "sendWinBack"])).toEqual({ caps: ["msg", "winback"] });
  });

  it("the codes are unique and the claim is small", () => {
    const codes = CAPABILITIES.map((c) => CAPABILITY_INFO[c].code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(JSON.stringify(claimsForCapabilities([...CAPABILITIES])).length).toBeLessThan(80);
  });

  it("a malformed claim means no capabilities", () => {
    expect(capabilitiesFromClaims({ caps: "msg" })).toEqual([]);
    expect(capabilitiesFromClaims({ caps: [1, 2] })).toEqual([]);
    expect(capabilitiesFromClaims({ caps: ["fly"] })).toEqual([]);
    expect(capabilitiesFromClaims({})).toEqual([]);
  });
});

describe("can", () => {
  it("an owner can do everything, a stylist only what they hold, nobody nothing", () => {
    for (const c of CAPABILITIES) expect(can({ role: "owner" }, c)).toBe(true);
    expect(can({ role: "stylist", capabilities: ["editMessages"] }, "editMessages")).toBe(true);
    expect(can({ role: "stylist", capabilities: ["editMessages"] }, "sendWinBack")).toBe(false);
    expect(can({ role: "stylist" }, "editMessages")).toBe(false);
    expect(can(null, "editMessages")).toBe(false);
    expect(can(undefined, "editMessages")).toBe(false);
  });
});
