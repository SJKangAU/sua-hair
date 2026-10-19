// tests/unit/reschedule.test.ts
// ─────────────────────────────────────────────────────────────────────────
// What changes when a booking is moved to another time / stylist: the new
// stylist's details, the recomputed return time, repricing by stylist level,
// and the history line written for it.
import { describe, expect, it } from "vitest";
import {
  buildReschedule,
  isSameSlot,
  type PriceSource,
  type StylistInfo,
} from "../../src/lib/reschedule";
import type { Booking } from "../../src/types";

const AT = "2026-08-05T01:00:00.000Z";

const junior: StylistInfo = { id: "ethan", name: "Ethan", level: "junior" };
const senior: StylistInfo = { id: "elly", name: "Elly", level: "senior" };
const director: StylistInfo = { id: "steve", name: "Steve", level: "director" };

const catalogue: PriceSource[] = [
  { id: "cut", price: { director: 120, senior: 90, junior: 60 } },
  { id: "colour", price: { director: 220, senior: 180, junior: 140 } },
];

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    id: "bk-1",
    bookingType: "customer",
    status: "confirmed",
    customerName: "Jane Smith",
    customerPhone: "0412345678",
    stylistId: "ethan",
    stylistName: "Ethan",
    stylistLevel: "junior",
    serviceId: "cut",
    serviceName: "Cut",
    servicePrice: 60,
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    date: "2026-08-05",
    time: "10:00 AM",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  }) as Booking;

describe("isSameSlot", () => {
  it("is true only when date, time and stylist all match", () => {
    const b = booking();
    expect(isSameSlot(b, { date: "2026-08-05", time: "10:00 AM", stylistId: "ethan" })).toBe(true);
    expect(isSameSlot(b, { date: "2026-08-06", time: "10:00 AM", stylistId: "ethan" })).toBe(false);
    expect(isSameSlot(b, { date: "2026-08-05", time: "10:30 AM", stylistId: "ethan" })).toBe(false);
    expect(isSameSlot(b, { date: "2026-08-05", time: "10:00 AM", stylistId: "elly" })).toBe(false);
  });
});

describe("buildReschedule", () => {
  it("moves the time and keeps price when the stylist level is unchanged", () => {
    const r = buildReschedule(
      booking(),
      { date: "2026-08-06", time: "2:30 PM", stylistId: "ethan" },
      junior,
      catalogue,
      AT,
    );
    expect(r.fields).toMatchObject({
      date: "2026-08-06",
      time: "2:30 PM",
      stylistId: "ethan",
      servicePrice: 60,
    });
    expect(r.priceChange).toBeNull();
    expect(r.entry.type).toBe("moved");
    expect(r.entry.label).toBe("Moved from Wed 5 Aug, 10:00 AM to Thu 6 Aug, 2:30 PM");
  });

  it("recomputes the locked-in return time from the new start", () => {
    const r = buildReschedule(
      booking({ activeTime: 30, restTime: 60, totalTime: 90, returnTime: "11:30 AM" }),
      { date: "2026-08-05", time: "1:00 PM", stylistId: "ethan" },
      junior,
      catalogue,
      AT,
    );
    expect(r.fields.returnTime).toBe("2:30 PM");
  });

  it("clears the return time for a booking with no processing phase", () => {
    const r = buildReschedule(
      booking({ returnTime: "10:45 AM" }),
      { date: "2026-08-05", time: "1:00 PM", stylistId: "ethan" },
      junior,
      catalogue,
      AT,
    );
    expect(r.fields.returnTime).toBeUndefined();
  });

  it("reprices a single-service booking for a higher-level stylist", () => {
    const r = buildReschedule(
      booking(),
      { date: "2026-08-05", time: "10:00 AM", stylistId: "elly" },
      senior,
      catalogue,
      AT,
    );
    expect(r.fields).toMatchObject({
      stylistId: "elly",
      stylistName: "Elly",
      stylistLevel: "senior",
      servicePrice: 90,
    });
    expect(r.priceChange).toEqual({ from: 60, to: 90 });
    expect(r.entry.label).toContain("with Ethan to");
    expect(r.entry.label).toContain("with Elly");
    expect(r.entry.label).toContain("(price $60 to $90)");
  });

  it("reprices every service of a multi-service booking", () => {
    const multi = booking({
      services: [
        { id: "cut", name: "Cut", price: 60, activeTime: 45, restTime: 0, totalTime: 45 },
        { id: "colour", name: "Colour", price: 140, activeTime: 45, restTime: 0, totalTime: 45 },
      ],
      servicePrice: 200,
    });
    const r = buildReschedule(
      multi,
      { date: "2026-08-05", time: "10:00 AM", stylistId: "steve" },
      director,
      catalogue,
      AT,
    );
    expect(r.fields.services?.map((s) => s.price)).toEqual([120, 220]);
    expect(r.fields.servicePrice).toBe(340);
    expect(r.priceChange).toEqual({ from: 200, to: 340 });
  });

  it("keeps the old price for a service that is no longer in the catalogue", () => {
    const r = buildReschedule(
      booking({ serviceId: "retired", servicePrice: 75 }),
      { date: "2026-08-05", time: "10:00 AM", stylistId: "elly" },
      senior,
      catalogue,
      AT,
    );
    expect(r.fields.servicePrice).toBe(75);
    expect(r.priceChange).toBeNull();
  });

  it("assigning an 'any available stylist' booking to a real stylist reprices it", () => {
    const r = buildReschedule(
      booking({ stylistId: "any", stylistName: "Any available stylist" }),
      { date: "2026-08-05", time: "10:00 AM", stylistId: "ethan" },
      junior,
      catalogue,
      AT,
    );
    expect(r.fields.stylistName).toBe("Ethan");
    expect(r.fields.servicePrice).toBe(60);
  });
});
