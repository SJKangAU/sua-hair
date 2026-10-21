// tests/unit/clientAccess.test.ts
// Whose clients a stylist may open (FR-025, DEC-051): cleaning what the owner chose,
// the claim round trip, the views a stylist can pick from, and which stylists' bookings
// make up a client's history. Pure.
import { describe, expect, it } from "vitest";
import {
  MAX_ACCESS_STYLISTS,
  accessFromClaims,
  claimsForAccess,
  hasExtraAccess,
  historyStylists,
  normaliseAccess,
  scopeOptions,
} from "../../src/lib/clientAccess";

describe("normaliseAccess", () => {
  it("nothing, or rubbish, is no extra access", () => {
    for (const raw of [undefined, null, "all", 5, [], {}, { all: "yes" }, { stylistIds: "yuto" }]) {
      expect(normaliseAccess(raw, "steve")).toEqual({ all: false, stylistIds: [] });
    }
  });

  it("keeps good ids once, in order, and drops the stylist's own and malformed ones", () => {
    expect(
      normaliseAccess({ stylistIds: ["yuto", "elly", "yuto", "steve", "a b", "", 3, null, "x".repeat(65)] }, "steve"),
    ).toEqual({ all: false, stylistIds: ["yuto", "elly"] });
  });

  it("'all' covers everyone, so no list is kept", () => {
    expect(normaliseAccess({ all: true, stylistIds: ["yuto"] }, "steve")).toEqual({ all: true, stylistIds: [] });
  });

  it("caps the list", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `s${i}`);
    expect(normaliseAccess({ stylistIds: ids }).stylistIds).toHaveLength(MAX_ACCESS_STYLISTS);
  });
});

describe("claims", () => {
  it("the default adds nothing to the token", () => {
    expect(claimsForAccess({ all: false, stylistIds: [] })).toEqual({});
    expect(hasExtraAccess({ all: false, stylistIds: [] })).toBe(false);
  });

  it("round-trips through the claim fields", () => {
    for (const a of [
      { all: false, stylistIds: ["yuto", "elly"] },
      { all: true, stylistIds: [] },
      { all: false, stylistIds: [] },
    ]) {
      expect(accessFromClaims({ role: "stylist", ...claimsForAccess(a) }, "steve")).toEqual(a);
      expect(hasExtraAccess(a)).toBe(a.all || a.stylistIds.length > 0);
    }
  });

  it("a malformed claim means no extra access", () => {
    expect(accessFromClaims({ clientStylists: "yuto" })).toEqual({ all: false, stylistIds: [] });
    expect(accessFromClaims({ clientsAll: "true" })).toEqual({ all: false, stylistIds: [] });
    expect(accessFromClaims({ clientStylists: [1, 2] })).toEqual({ all: false, stylistIds: [] });
  });
});

describe("the views a stylist can pick", () => {
  const names = { yuto: "Yuto", elly: "Elly" };

  it("only their own when nothing was given (no picker needed)", () => {
    expect(scopeOptions("steve", { all: false, stylistIds: [] }, names).map((o) => o.label)).toEqual(["My clients"]);
  });

  it("their own first, then each colleague by name", () => {
    const o = scopeOptions("steve", { all: false, stylistIds: ["yuto", "elly"] }, names);
    expect(o.map((x) => x.label)).toEqual(["My clients", "Yuto's clients", "Elly's clients"]);
    expect(o[0].scope).toEqual({ kind: "stylist", stylistId: "steve" });
    expect(o[1].scope).toEqual({ kind: "stylist", stylistId: "yuto" });
  });

  it("falls back to the id when a colleague has no name on file", () => {
    expect(scopeOptions("steve", { all: false, stylistIds: ["zed"] }, names)[1].label).toBe("zed's clients");
  });

  it("everyone's last when all", () => {
    const o = scopeOptions("steve", { all: true, stylistIds: [] }, names);
    expect(o.map((x) => x.label)).toEqual(["My clients", "Everyone's clients"]);
    expect(o[1].scope).toEqual({ kind: "all" });
  });
});

describe("a client's history", () => {
  it("reads the stylist's own bookings, plus those of the colleagues they may open", () => {
    expect(historyStylists("steve", { all: false, stylistIds: [] })).toEqual(["steve"]);
    expect(historyStylists("steve", { all: false, stylistIds: ["yuto"] })).toEqual(["steve", "yuto"]);
  });

  it("is every stylist's (no restriction) for all", () => {
    expect(historyStylists("steve", { all: true, stylistIds: [] })).toBeNull();
  });
});
