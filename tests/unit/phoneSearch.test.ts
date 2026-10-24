// tests/unit/phoneSearch.test.ts
// Finding a number however it is typed, and showing it readably. Fake numbers only.
import { describe, expect, it } from "vitest";
import { formatMobile, phoneMatches, phoneQueryDigits } from "../../src/lib/phoneSearch";
import { filterBookings, DEFAULT_FILTERS } from "../../src/lib/bookingFilters";
import type { Booking } from "../../src/types";

describe("phoneQueryDigits", () => {
  it("reads spaces, dashes, brackets and the international form", () => {
    expect(phoneQueryDigits("0400 000 001")).toBe("0400000001");
    expect(phoneQueryDigits("0400-000-001")).toBe("0400000001");
    expect(phoneQueryDigits("+61 400 000 001")).toBe("0400000001");
    expect(phoneQueryDigits("(0400) 000")).toBe("0400000");
  });
  it("is empty for names and for too few digits", () => {
    expect(phoneQueryDigits("Test Person")).toBe("");
    expect(phoneQueryDigits("04")).toBe("");
    expect(phoneQueryDigits("0400 abc")).toBe("");
  });
});

describe("phoneMatches", () => {
  it("finds part of a stored number, however typed", () => {
    expect(phoneMatches("0400000001", "0400 000")).toBe(true);
    expect(phoneMatches("0400000001", "+61 400 000 001")).toBe(true);
    expect(phoneMatches("0400000001", "000 001")).toBe(true);
    expect(phoneMatches("0400000001", "0411")).toBe(false);
    expect(phoneMatches("", "0400")).toBe(false);
    expect(phoneMatches(undefined, "0400")).toBe(false);
  });
});

describe("formatMobile", () => {
  it("spaces a mobile and leaves anything else alone", () => {
    expect(formatMobile("0400000001")).toBe("0400 000 001");
    expect(formatMobile("0400 000 001")).toBe("0400 000 001");
    expect(formatMobile("03 9000 0000")).toBe("03 9000 0000");
  });
});

describe("bookings list search", () => {
  const b = (id: string, name: string, phone: string) =>
    ({ id, customerName: name, customerPhone: phone, status: "confirmed", date: "2027-01-01", stylistId: "s" }) as Booking;
  const list = [b("1", "Test One", "0400000001"), b("2", "Test Two", "0400000002")];
  it("finds a booking by a number typed with spaces or +61", () => {
    expect(filterBookings(list, DEFAULT_FILTERS, "0400 000 002").map((x) => x.id)).toEqual(["2"]);
    expect(filterBookings(list, DEFAULT_FILTERS, "+61 400 000 001").map((x) => x.id)).toEqual(["1"]);
    expect(filterBookings(list, DEFAULT_FILTERS, "two").map((x) => x.id)).toEqual(["2"]);
  });
});
