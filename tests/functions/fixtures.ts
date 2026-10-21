// tests/functions/fixtures.ts
// A small fake salon for the booking-command tests: five stylists, a handful of
// services (including a colour with processing time and a three-phase perm), Monday
// closed, 25 Dec closed. Fake people only.
import type { Firestore } from "firebase-admin/firestore";
import { businessInstant } from "../../src/lib/businessTime";
import { toSlotBlock } from "../../src/lib/slotBlockData";

/** "Now" for the commands: Tuesday 1 Dec 2026, 09:00 in Melbourne (AEDT). */
export const NOW = businessInstant("2026-12-01", 9 * 60) as number;
export const at = (date: string, hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return businessInstant(date, h * 60 + m) as number;
};

export const THURSDAY = "2026-12-03";
export const FRIDAY = "2026-12-04";
export const SATURDAY = "2026-12-05";
export const MONDAY = "2026-12-07"; // closed
export const CHRISTMAS = "2026-12-25"; // closed by override

const tier = (director: number, senior: number, junior: number) => ({ director, senior, junior });

export const STYLISTS = [
  { id: "steve", name: "Steve Hwang", level: "director", order: 0 },
  { id: "yuto", name: "Yuto Hirakawa", level: "senior", order: 1 },
  { id: "elly", name: "Elly Lee", level: "senior", order: 2 },
  { id: "ethan", name: "Ethan Le", level: "junior", order: 3 },
  { id: "harry", name: "Harry Yang", level: "junior", order: 4 },
] as const;

export const SERVICES = [
  { id: "mens-cut", name: "Men's Cut", activeTime: 45, restTime: 0, price: tier(75, 65, 55) },
  { id: "ladies-cut", name: "Ladies Cut", activeTime: 60, restTime: 0, price: tier(95, 85, 75) },
  { id: "beard-trim", name: "Beard Trim", activeTime: 15, restTime: 0, price: tier(30, 25, 20) },
  { id: "colour", name: "Colour (Regrowth)", activeTime: 30, restTime: 30, price: tier(160, 140, 120) },
  {
    id: "perm", name: "Digital Perm", activeTime: 90, restTime: 30,
    phases: [
      { type: "active", minutes: 60 },
      { type: "rest", minutes: 30 },
      { type: "active", minutes: 30 },
    ],
    price: tier(300, 260, 220),
  },
] as const;

export async function seedSalon(db: Firestore): Promise<void> {
  const now = new Date(NOW).toISOString();
  for (const s of STYLISTS) {
    await db.doc(`stylists/${s.id}`).set({
      name: s.name, role: "Stylist", level: s.level, order: s.order, status: "active",
      isTrainer: false, startDate: "2024-01-01", createdAt: now,
    });
  }
  let order = 0;
  for (const s of SERVICES) {
    await db.doc(`services/${s.id}`).set({
      name: s.name, category: "cut", activeTime: s.activeTime, restTime: s.restTime,
      totalTime: s.activeTime + s.restTime,
      ...("phases" in s ? { phases: s.phases } : {}),
      price: s.price, status: "active", sortOrder: order++, priceHistory: [], createdAt: now,
    });
  }
  await db.doc("services/retired").set({
    name: "Retired", activeTime: 30, restTime: 0, totalTime: 30, price: tier(1, 1, 1),
    status: "inactive", sortOrder: 99, priceHistory: [], createdAt: now,
  });
  const open = { isOpen: true, open: 10, close: 18 };
  await db.doc("salonSettings/main").set({
    weeklySchedule: {
      sun: open, mon: { isOpen: false, open: 10, close: 18 }, tue: open, wed: open, thu: open, fri: open, sat: open,
    },
    dateOverrides: { [CHRISTMAS]: { closed: true } },
  });
}

let counter = 0;
/** A valid request body; override anything. Each call gets its own phone number. */
export function request(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    serviceIds: ["mens-cut"],
    stylistId: "steve",
    date: THURSDAY,
    time: "10:00 AM",
    customerName: "Jane Citizen",
    customerPhone: `04${String(10_000_000 + counter).padStart(8, "0")}`,
    consent: true,
    ...overrides,
  };
}

/** A confirmed booking written straight into Firestore (an admin walk-in / legacy record). */
export async function seedBooking(
  db: Firestore,
  id: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const b = {
    bookingType: "walkin", status: "confirmed", customerName: "Walk In", customerNameLower: "walk in",
    customerPhone: "", stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director",
    serviceId: "mens-cut", serviceName: "Men's Cut", servicePrice: 75,
    activeTime: 45, restTime: 0, totalTime: 45, date: THURSDAY, time: "10:00 AM",
    createdAt: new Date(NOW).toISOString(), ...overrides,
  };
  await db.doc(`bookings/${id}`).set(b);
  await db.doc(`slotBlocks/${id}`).set(toSlotBlock(b as Parameters<typeof toSlotBlock>[0]));
}
