// tests/unit/clients.test.ts
// The clients collection's rules (src/lib/clients.ts): identity from the phone,
// search keys and what a typed search means, the summary worked out from bookings
// (visits, spend, first/last visit, next booking, favourites, average gap), the
// whole client document with aliases and manual fields, the slim card a stylist
// may read, and the directory filters. Fake people only. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  EMPTY_SUMMARY,
  buildClient,
  clientCardOf,
  clientIdFromPhone,
  computeClientSummary,
  foldText,
  isTombstone,
  isVisit,
  matchesFilter,
  nameKeys,
  nameTokens,
  planSearch,
  prefixEnd,
  type ProfileBooking,
  type SummaryBooking,
} from "../../src/lib/clients";

const TODAY = "2026-10-20";

let n = 0;
const b = (over: Partial<ProfileBooking> = {}): ProfileBooking => ({
  id: `b${++n}`,
  bookingType: "customer",
  status: "completed",
  date: "2026-09-01",
  time: "10:00 AM",
  stylistId: "steve",
  serviceId: "mens-cut",
  servicePrice: 75,
  customerName: "Test Client",
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("identity", () => {
  it("the client id is the normalised phone, however it is written", () => {
    expect(clientIdFromPhone("0400 000 001")).toBe("0400000001");
    expect(clientIdFromPhone("61 400 000 001")).toBe("0400000001");
    expect(clientIdFromPhone("+61400000001")).toBe("0400000001");
  });

  it("is null for a number that is not a valid Australian mobile (never guessed)", () => {
    for (const bad of ["", undefined, null, "12345", "61 3 9000 0000", "abc"]) {
      expect(clientIdFromPhone(bad as string)).toBeNull();
    }
  });

  it("recognises a tombstone", () => {
    expect(isTombstone("deleted-abc")).toBe(true);
    expect(isTombstone("0400000001")).toBe(false);
    expect(isTombstone(undefined)).toBe(false);
  });
});

describe("names and search keys", () => {
  it("folds case and accents", () => {
    expect(foldText("  Zoë   LÉE ")).toBe("zoe lee");
  });

  it("splits a name into whole-word tokens, folded, unique, at least 2 characters", () => {
    expect(nameTokens("Jade Lee")).toEqual(["jade", "lee"]);
    expect(nameTokens("Mary-Jane O'Neil")).toEqual(["mary", "jane", "neil"]);
    expect(nameTokens("A B Lee Lee")).toEqual(["lee"]);
    expect(nameTokens("테스트 고객")).toEqual(["테스트", "고객"]);
  });

  it("gives the prefix field and the tokens together", () => {
    expect(nameKeys("Jade Lee")).toEqual({ nameLower: "jade lee", searchTokens: ["jade", "lee"] });
  });

  it("limits the tokens", () => {
    expect(nameTokens("aa bb cc dd ee ff gg hh ii jj kk ll")).toHaveLength(10);
  });
});

describe("what a typed search means", () => {
  it("is no search under 2 characters", () => {
    expect(planSearch("")).toEqual({ kind: "none" });
    expect(planSearch(" a ")).toEqual({ kind: "none" });
    expect(planSearch("4")).toEqual({ kind: "none" });
  });

  it("a single word searches the prefix and the whole-word token; several words only the prefix", () => {
    expect(planSearch("Lee")).toEqual({ kind: "name", prefix: "lee", token: "lee" });
    expect(planSearch("jade le")).toEqual({ kind: "name", prefix: "jade le", token: null });
    expect(planSearch("Zoë")).toEqual({ kind: "name", prefix: "zoe", token: "zoe" });
  });

  it("digits are a phone prefix; Fresha's 61 form becomes 04", () => {
    expect(planSearch("0412")).toEqual({ kind: "phone", prefix: "0412" });
    expect(planSearch("0412 345")).toEqual({ kind: "phone", prefix: "0412345" });
    expect(planSearch("61 412")).toEqual({ kind: "phone", prefix: "0412" });
    expect(planSearch("+61412")).toEqual({ kind: "phone", prefix: "0412" });
  });

  it("a prefix range ends past every string that starts with it", () => {
    expect("jade lee" < prefixEnd("jade") && "jade lee" >= "jade").toBe(true);
    expect("jaez" < prefixEnd("jade")).toBe(false);
  });
});

describe("visits", () => {
  const visit = (over: Partial<SummaryBooking>) => isVisit(b(over), TODAY);

  it("completed, arrived and in-service are visits", () => {
    expect(visit({ status: "completed" })).toBe(true);
    expect(visit({ status: "arrived", date: TODAY })).toBe(true);
    expect(visit({ status: "in_service", date: TODAY })).toBe(true);
  });

  it("confirmed is a visit once its day is today or past, not before", () => {
    expect(visit({ status: "confirmed", date: "2026-10-01" })).toBe(true);
    expect(visit({ status: "confirmed", date: TODAY })).toBe(true);
    expect(visit({ status: "confirmed", date: "2026-10-21" })).toBe(false);
  });

  it("pending, cancelled and no-show are never visits; breaks and training are not bookings of a client", () => {
    expect(visit({ status: "pending" })).toBe(false);
    expect(visit({ status: "cancelled" })).toBe(false);
    expect(visit({ status: "no_show" })).toBe(false);
    expect(visit({ bookingType: "break" })).toBe(false);
    expect(visit({ bookingType: "training" })).toBe(false);
  });
});

describe("the summary", () => {
  it("is empty for no bookings", () => {
    expect(computeClientSummary([], TODAY)).toEqual(EMPTY_SUMMARY);
    expect(computeClientSummary([b({ bookingType: "break" })], TODAY)).toEqual(EMPTY_SUMMARY);
  });

  it("counts visits and spend from visits only: not cancelled, pending, future, breaks or training", () => {
    const s = computeClientSummary(
      [
        b({ date: "2026-08-01", servicePrice: 80 }),
        b({ date: "2026-09-01", servicePrice: 70, status: "confirmed" }),
        b({ date: "2026-09-10", servicePrice: 999, status: "cancelled" }),
        b({ date: "2026-09-15", servicePrice: 999, status: "no_show" }),
        b({ date: "2026-10-25", servicePrice: 999, status: "confirmed" }),
        b({ date: "2026-10-26", servicePrice: 999, status: "pending" }),
        b({ date: "2026-09-02", servicePrice: 999, bookingType: "break" }),
        b({ date: "2026-09-03", servicePrice: 999, bookingType: "training" }),
      ],
      TODAY,
    );
    expect(s.totalVisits).toBe(2);
    expect(s.totalSpend).toBe(150);
    expect(s.bookingCount).toBe(6);
    expect(s.cancelCount).toBe(1);
    expect(s.noShowCount).toBe(1);
    expect(s.hasNoShows).toBe(true);
  });

  it("first and last visit, next booking (pending or confirmed, after today, earliest first)", () => {
    const s = computeClientSummary(
      [
        b({ date: "2026-07-01" }),
        b({ date: "2026-09-20" }),
        b({ id: "later", date: "2026-11-05", time: "9:00 AM", status: "confirmed" }),
        b({ id: "sooner", date: "2026-10-30", time: "2:00 PM", status: "pending" }),
        b({ date: "2026-10-28", status: "cancelled" }),
      ],
      TODAY,
    );
    expect(s.firstVisit).toBe("2026-07-01");
    expect(s.lastVisit).toBe("2026-09-20");
    expect(s.hasUpcoming).toBe(true);
    expect(s.nextBookingDate).toBe("2026-10-30");
    expect(s.nextBookingTime).toBe("2:00 PM");
    expect(s.nextBookingId).toBe("sooner");
  });

  it("no upcoming booking leaves the next-booking fields empty", () => {
    const s = computeClientSummary([b({ date: "2026-09-01" })], TODAY);
    expect(s).toMatchObject({ hasUpcoming: false, nextBookingDate: "", nextBookingTime: "", nextBookingId: "" });
  });

  it("favourite stylist is the most visited; a tie goes to the more recent visit; 'any' is never a favourite", () => {
    const s = computeClientSummary(
      [
        b({ date: "2026-07-01", stylistId: "steve" }),
        b({ date: "2026-08-01", stylistId: "steve" }),
        b({ date: "2026-09-01", stylistId: "yuto" }),
        b({ date: "2026-09-02", stylistId: "any" }),
      ],
      TODAY,
    );
    expect(s.favouriteStylistId).toBe("steve");
    const tie = computeClientSummary(
      [b({ date: "2026-07-01", stylistId: "steve" }), b({ date: "2026-09-01", stylistId: "yuto" })],
      TODAY,
    );
    expect(tie.favouriteStylistId).toBe("yuto");
  });

  it("favourite services: the top 3 by count, using every service of a multi-service visit", () => {
    const s = computeClientSummary(
      [
        b({ date: "2026-07-01", services: [{ id: "cut" }, { id: "beard" }] }),
        b({ date: "2026-08-01", services: [{ id: "cut" }, { id: "colour" }] }),
        b({ date: "2026-09-01", serviceId: "cut" }),
        b({ date: "2026-09-02", serviceId: "fringe" }),
        b({ date: "2026-09-03", serviceId: "break" }),
      ],
      TODAY,
    );
    expect(s.favouriteServiceIds).toEqual(["cut", "fringe", "colour"]);
  });

  it("stylistIds lists everyone with a non-cancelled booking, sorted, never 'any'", () => {
    const s = computeClientSummary(
      [
        b({ stylistId: "yuto" }),
        b({ stylistId: "steve", status: "pending", date: "2026-11-01" }),
        b({ stylistId: "elly", status: "cancelled" }),
        b({ stylistId: "any", status: "pending", date: "2026-11-02" }),
      ],
      TODAY,
    );
    expect(s.stylistIds).toEqual(["steve", "yuto"]);
  });

  it("average days between visits uses distinct visit days; null for fewer than two", () => {
    expect(computeClientSummary([b({ date: "2026-09-01" })], TODAY).avgDaysBetweenVisits).toBeNull();
    const s = computeClientSummary(
      [b({ date: "2026-08-01" }), b({ date: "2026-08-01" }), b({ date: "2026-09-01" }), b({ date: "2026-10-01" })],
      TODAY,
    );
    expect(s.totalVisits).toBe(4);
    expect(s.avgDaysBetweenVisits).toBe(30.5); // 31 and 30 days
  });

  it("is the same whatever order the bookings arrive in", () => {
    const list = [b({ date: "2026-07-01" }), b({ date: "2026-08-15", stylistId: "yuto" }), b({ date: "2026-09-20", status: "no_show" })];
    expect(computeClientSummary([...list].reverse(), TODAY)).toEqual(computeClientSummary(list, TODAY));
  });

  it("a confirmed booking moves from 'next' to 'visit' as its day arrives", () => {
    const list = [b({ id: "x", date: "2026-10-21", status: "confirmed" })];
    expect(computeClientSummary(list, "2026-10-20")).toMatchObject({ totalVisits: 0, hasUpcoming: true });
    expect(computeClientSummary(list, "2026-10-21")).toMatchObject({ totalVisits: 1, hasUpcoming: false });
  });
});

describe("the client document", () => {
  const manual = { tags: [], blocked: false };
  const NOW = "2026-10-20T01:00:00.000Z";

  it("takes the most recent name and keeps earlier spellings as aliases", () => {
    const c = buildClient(
      "0400000001",
      [
        b({ date: "2026-06-01", customerName: "Jaid Lee" }),
        b({ date: "2026-08-01", customerName: "Jade Lee" }),
        b({ date: "2026-09-01", customerName: "Jade  Lee" }),
        b({ date: "2026-07-01", customerName: "J Lee" }),
      ],
      manual,
      TODAY,
      NOW,
    );
    expect(c.name).toBe("Jade Lee");
    expect(c.aliases.sort()).toEqual(["J Lee", "Jaid Lee"]);
    expect(c.searchTokens).toEqual(expect.arrayContaining(["jade", "lee", "jaid"]));
    expect(c.phone).toBe("0400000001");
    expect(c.source).toBe("online");
  });

  it("an owner-set name is kept; bookings do not rename the client", () => {
    const c = buildClient(
      "0400000001",
      [b({ customerName: "Jade Lee" })],
      { ...manual, name: "Jade Smith", nameOverride: true },
      TODAY,
      NOW,
    );
    expect(c.name).toBe("Jade Smith");
    expect(c.nameOverride).toBe(true);
    expect(c.aliases).toEqual(["Jade Lee"]);
  });

  it("keeps the owner's tags, email, blocked flag and reason; the reason only while blocked", () => {
    const set = buildClient(
      "0400000001",
      [b()],
      { tags: ["vip"], blocked: true, blockReason: "Unpaid", email: "test.client@example.test" },
      TODAY,
      NOW,
    );
    expect(set).toMatchObject({ tags: ["vip"], blocked: true, blockReason: "Unpaid", email: "test.client@example.test" });
    const unblocked = buildClient("0400000001", [b()], { tags: [], blocked: false, blockReason: "Unpaid" }, TODAY, NOW);
    expect(unblocked.blockReason).toBeUndefined();
  });

  it("takes an email from the bookings only when the owner has not set one", () => {
    const c = buildClient("0400000001", [b({ customerEmail: "a.client@example.test" })], manual, TODAY, NOW);
    expect(c.email).toBe("a.client@example.test");
  });

  it("source: a walk-in's first booking makes a walk-in client; an import-only client is fresha-import", () => {
    expect(buildClient("0400000001", [b({ bookingType: "walkin" })], manual, TODAY, NOW).source).toBe("walk-in");
    expect(buildClient("0400000001", [], manual, TODAY, NOW).source).toBe("fresha-import");
    expect(buildClient("0400000001", [b()], { ...manual, source: "fresha-import" }, TODAY, NOW).source).toBe("fresha-import");
  });

  it("ignores 'Deleted Customer' as a name", () => {
    const c = buildClient("0400000001", [b({ customerName: "Deleted Customer" })], { ...manual, name: "Kept Name" }, TODAY, NOW);
    expect(c.name).toBe("Kept Name");
  });

  it("the card a stylist reads has no spend, email, blocked reason or other client figures", () => {
    const full = buildClient(
      "0400000001",
      [b({ servicePrice: 500 })],
      { tags: ["vip"], blocked: true, blockReason: "Private reason", email: "x@example.test" },
      TODAY,
      NOW,
    );
    const card = clientCardOf(full, "0400000001");
    expect(Object.keys(card).sort()).toEqual(["blocked", "id", "name", "nameLower", "phone", "searchTokens", "stylistIds", "tags"]);
    expect(JSON.stringify(card)).not.toMatch(/500|Private reason|example\.test/);
    expect(card.stylistIds).toEqual(["steve"]);
  });
});

describe("directory filters", () => {
  const client = (over: Record<string, unknown> = {}) => ({
    lastVisit: "2026-10-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    blocked: false,
    hasUpcoming: false,
    hasNoShows: false,
    totalVisits: 3,
    ...over,
  });

  it("lapsed: visited before, but not within 90 days", () => {
    expect(matchesFilter(client({ lastVisit: "2026-07-01" }), "lapsed", TODAY)).toBe(true);
    expect(matchesFilter(client({ lastVisit: "2026-09-01" }), "lapsed", TODAY)).toBe(false);
    expect(matchesFilter(client({ lastVisit: "", totalVisits: 0 }), "lapsed", TODAY)).toBe(false);
    expect(matchesFilter(client({ lastVisit: "2026-09-01" }), "lapsed", TODAY, 30)).toBe(true); // configurable
  });

  it("new: added within 30 days", () => {
    expect(matchesFilter(client({ createdAt: "2026-10-01T00:00:00.000Z" }), "new", TODAY)).toBe(true);
    expect(matchesFilter(client({ createdAt: "2026-08-01T00:00:00.000Z" }), "new", TODAY)).toBe(false);
  });

  it("blocked, upcoming and no-shows", () => {
    expect(matchesFilter(client({ blocked: true }), "blocked", TODAY)).toBe(true);
    expect(matchesFilter(client(), "blocked", TODAY)).toBe(false);
    expect(matchesFilter(client({ hasUpcoming: true }), "upcoming", TODAY)).toBe(true);
    expect(matchesFilter(client({ hasNoShows: true }), "noshows", TODAY)).toBe(true);
    expect(matchesFilter(client(), "all", TODAY)).toBe(true);
  });
});
