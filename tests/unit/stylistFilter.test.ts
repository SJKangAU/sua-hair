// tests/unit/stylistFilter.test.ts
// The stylist filter (batch 1, item 4): saved choice parsing, toggling, "All".
import { describe, expect, it } from "vitest";
import {
  effectivePicked,
  parseStoredFilter,
  stylistFilterKey,
  toggleIds,
} from "../../src/lib/stylistFilter";
import { filterBookings, DEFAULT_FILTERS, hasActiveFilters } from "../../src/lib/bookingFilters";
import { buildAgenda } from "../../src/lib/agenda";
import type { Booking } from "../../src/types";

describe("saved choice", () => {
  it("is kept per signed-in account", () => {
    expect(stylistFilterKey("u1")).not.toBe(stylistFilterKey("u2"));
  });
  it("reads a saved list back", () => {
    expect(parseStoredFilter('["steve","elly"]')).toEqual(["steve", "elly"]);
  });
  it("is All (empty) when nothing is saved or the saved text is damaged", () => {
    expect(parseStoredFilter(null)).toEqual([]);
    expect(parseStoredFilter("")).toEqual([]);
    expect(parseStoredFilter("{not json")).toEqual([]);
    expect(parseStoredFilter('{"a":1}')).toEqual([]);
    expect(parseStoredFilter('"steve"')).toEqual([]);
  });
  it("drops non-text and repeated entries", () => {
    expect(parseStoredFilter('["steve",3,null,"steve",""]')).toEqual(["steve"]);
  });
});

describe("toggleIds", () => {
  it("adds a stylist, several can be on at once", () => {
    expect(toggleIds([], ["steve"])).toEqual(["steve"]);
    expect(toggleIds(["steve"], ["elly"])).toEqual(["steve", "elly"]);
  });
  it("removes a stylist that is already on", () => {
    expect(toggleIds(["steve", "elly"], ["steve"])).toEqual(["elly"]);
  });
  it("a group chip adds everyone, or removes everyone if all are already on", () => {
    expect(toggleIds(["steve"], ["elly", "yuto"])).toEqual(["steve", "elly", "yuto"]);
    expect(toggleIds(["elly", "yuto"], ["elly", "yuto"])).toEqual([]);
  });
});

describe("effectivePicked", () => {
  it("keeps picks that this screen can show", () => {
    expect(effectivePicked(["steve", "elly"], ["steve", "elly", "yuto"])).toEqual(["steve", "elly"]);
  });
  it("shows everyone (empty) when none of the picks are there", () => {
    expect(effectivePicked(["elly"], ["steve", "yuto"])).toEqual([]);
    expect(effectivePicked([], ["steve"])).toEqual([]);
  });
});

const booking = (id: string, stylistId: string) =>
  ({
    id,
    stylistId,
    customerName: id,
    customerPhone: "",
    status: "confirmed",
    date: "2027-03-02",
    time: "10:00 AM",
    totalTime: 30,
  }) as Booking;

describe("bookings list", () => {
  const list = [booking("1", "steve"), booking("2", "elly"), booking("3", "yuto")];
  it("shows everything by default", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(filterBookings(list, DEFAULT_FILTERS)).toHaveLength(3);
  });
  it("shows only the picked stylists, several at once", () => {
    const f = { ...DEFAULT_FILTERS, stylistIds: ["steve", "yuto"] };
    expect(hasActiveFilters(f)).toBe(true);
    expect(filterBookings(list, f).map((b) => b.id)).toEqual(["1", "3"]);
  });
});

describe("today list on a phone", () => {
  const stylists = [
    { id: "steve", name: "Steve", hours: { open: 10, close: 11 } },
    { id: "elly", name: "Elly", hours: { open: 10, close: 11 } },
    { id: "yuto", name: "Yuto", hours: { open: 10, close: 11 } },
  ];
  const args = { stylists, isToday: false, isPast: false, nowMinutes: 0 };
  const dayBookings = [booking("1", "steve"), booking("2", "elly"), booking("3", "yuto")];
  const bookingIds = (filter: string | string[]) =>
    buildAgenda({ ...args, dayBookings, filter })
      .filter((i) => i.kind === "booking")
      .map((i) => (i.kind === "booking" ? i.booking.id : ""));
  it("an empty list, or 'all', shows everyone", () => {
    expect(bookingIds([])).toEqual(["1", "2", "3"]);
    expect(bookingIds("all")).toEqual(["1", "2", "3"]);
  });
  it("a list shows just those stylists", () => {
    expect(bookingIds(["steve", "yuto"])).toEqual(["1", "3"]);
  });
});
