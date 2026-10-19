// tests/unit/todayPage.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The logic behind the Today page: the glance numbers, the next free opening,
// the suggested-time and waitlist-offer texts, the revenue total, the search's
// client grouping, and the shared open-slot rules.
import { describe, expect, it } from "vitest";
import { findNextOpening, summariseDay } from "../../src/lib/dayGlance";
import {
  buildOfferSlotMessage,
  buildSuggestTimeMessage,
  firstNameOf,
  smsHref,
  suggestAlternativeStart,
} from "../../src/lib/suggestions";
import { sumRevenue } from "../../src/lib/revenue";
import { groupClientHits } from "../../src/lib/clientHits";
import { computeOpenSlots } from "../../src/lib/timelineLayout";
import type { Booking, SalonSettings, StylistWeeklyHours } from "../../src/types";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const DATE = "2026-10-20"; // a Tuesday

const mk = (overrides: Partial<Booking> = {}): Booking =>
  ({
    id: "bk",
    bookingType: "customer",
    status: "confirmed",
    customerName: "Jane Smith",
    customerPhone: "0412345678",
    stylistId: "steve",
    stylistName: "Steve Hwang",
    stylistLevel: "director",
    serviceId: "cut",
    serviceName: "Cut",
    servicePrice: 100,
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    date: DATE,
    time: "10:00 AM",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  }) as Booking;

const open = { isOpen: true, open: 10, close: 18 };
const settings: SalonSettings = {
  weeklySchedule: {
    sun: open,
    mon: { isOpen: false, open: 10, close: 18 },
    tue: open,
    wed: open,
    thu: open,
    fri: open,
    sat: open,
  },
  dateOverrides: {},
};
const steve = { id: "steve", name: "Steve Hwang" };
const ethan = { id: "ethan", name: "Ethan Le" };

describe("summariseDay", () => {
  it("counts clients on the book, done, in progress and waiting", () => {
    const s = summariseDay([
      mk({ id: "1", status: "completed" }),
      mk({ id: "2", status: "in_service" }),
      mk({ id: "3", status: "arrived" }),
      mk({ id: "4", status: "confirmed" }),
      mk({ id: "5", status: "pending" }),
    ]);
    expect(s).toEqual({ total: 5, done: 1, inProgress: 1, waiting: 1 });
  });

  it("ignores cancelled, no-show, breaks and training", () => {
    const s = summariseDay([
      mk({ id: "1", status: "cancelled" }),
      mk({ id: "2", status: "no_show" }),
      mk({ id: "3", bookingType: "break" }),
      mk({ id: "4", bookingType: "training" }),
      mk({ id: "5", bookingType: "walkin" }),
    ]);
    expect(s.total).toBe(1);
  });
});

describe("findNextOpening", () => {
  const base = {
    date: DATE,
    today: "2026-10-19",
    nowMinutes: h(9),
    stylists: [steve, ethan],
    settings,
  };

  it("is the start of the working day when nothing is booked", () => {
    expect(findNextOpening({ ...base, bookings: [] })).toEqual({
      stylistId: "steve",
      stylistName: "Steve Hwang",
      start: h(10),
    });
  });

  it("skips a booked stretch and picks whoever is free earliest", () => {
    const bookings = [
      mk({ id: "a", stylistId: "steve", time: "10:00 AM", totalTime: 90 }),
    ];
    expect(findNextOpening({ ...base, bookings })).toMatchObject({
      stylistId: "ethan",
      start: h(10),
    });
  });

  it("never returns a time that has already passed today", () => {
    const r = findNextOpening({
      ...base,
      date: "2026-10-20",
      today: "2026-10-20",
      nowMinutes: h(13, 10),
      bookings: [],
    });
    expect(r?.start).toBe(h(13, 15));
  });

  it("is null on a closed day, a past date or a full day", () => {
    expect(findNextOpening({ ...base, date: "2026-10-19", bookings: [] })).toBeNull(); // Monday
    expect(
      findNextOpening({ ...base, today: "2026-10-25", bookings: [] }),
    ).toBeNull();
    const full = [
      mk({ id: "a", stylistId: "steve", time: "10:00 AM", totalTime: 480 }),
      mk({ id: "b", stylistId: "ethan", time: "10:00 AM", totalTime: 480 }),
    ];
    expect(findNextOpening({ ...base, bookings: full })).toBeNull();
  });

  it("can be limited to one stylist, and treats 'any' as everyone", () => {
    const bookings = [] as Booking[];
    expect(
      findNextOpening({ ...base, bookings, onlyStylistId: "ethan" })?.stylistId,
    ).toBe("ethan");
    expect(
      findNextOpening({ ...base, bookings, onlyStylistId: "any" })?.stylistId,
    ).toBe("steve");
  });

  it("respects a stylist's own hours", () => {
    const late: StylistWeeklyHours = (() => {
      const d = { isWorking: true, start: 13, end: 18 };
      return { sun: d, mon: d, tue: d, wed: d, thu: d, fri: d, sat: d };
    })();
    const r = findNextOpening({
      ...base,
      stylists: [{ ...steve, workingHours: late }],
      bookings: [],
    });
    expect(r?.start).toBe(h(13));
  });
});

describe("suggestAlternativeStart", () => {
  const hours = { open: 10, close: 18 };
  const asked = mk({ id: "ask", status: "pending", time: "10:00 AM" });

  it("picks the closest free time to the one asked for", () => {
    const taken = mk({ id: "t", time: "10:00 AM", totalTime: 60 });
    // 10:00-11:00 is taken, so the nearest 45-min fit is 11:00
    expect(suggestAlternativeStart(asked, [taken, asked], hours)).toBe(h(11));
  });

  it("never suggests the requested time itself", () => {
    expect(suggestAlternativeStart(asked, [asked], hours)).toBe(h(10, 15));
  });

  it("skips times already past today", () => {
    expect(suggestAlternativeStart(asked, [asked], hours, h(12, 5))).toBe(h(12, 15));
  });

  it("is null when the stylist is off or nothing fits", () => {
    expect(suggestAlternativeStart(asked, [asked], null)).toBeNull();
    const wall = mk({ id: "w", time: "10:00 AM", totalTime: 480 });
    expect(suggestAlternativeStart(asked, [wall, asked], hours)).toBeNull();
  });
});

describe("text messages", () => {
  it("builds an sms link with the text url-encoded", () => {
    expect(smsHref("0412345678", "Hi there & welcome")).toBe(
      "sms:0412345678?body=Hi%20there%20%26%20welcome",
    );
  });

  it("uses a first name, and a neutral greeting when there isn't one", () => {
    expect(firstNameOf("  Jane   Smith ")).toBe("Jane");
    expect(firstNameOf("   ")).toBe("there");
  });

  it("offers an alternative time, or asks for one when there is none", () => {
    const b = mk({ date: DATE, time: "10:00 AM" });
    expect(buildSuggestTimeMessage(b, h(11, 30))).toBe(
      "Hi Jane, thanks for booking with Sua Hair Studio. Unfortunately we can't do Tue 20 Oct, 10:00 AM. Would Tue 20 Oct, 11:30 AM work instead? Reply to confirm.",
    );
    expect(buildSuggestTimeMessage(b, null)).toContain(
      "Could you let us know another day or time",
    );
  });

  it("writes the waitlist offer", () => {
    expect(buildOfferSlotMessage("Mia Chen", DATE, h(14), "Steve Hwang")).toBe(
      "Hi Mia, a spot has opened up at Sua Hair Studio: Tue 20 Oct, 2:00 PM with Steve Hwang. Would you like it? Reply to confirm.",
    );
  });
});

describe("sumRevenue", () => {
  it("counts confirmed through completed service bookings only", () => {
    const total = sumRevenue([
      mk({ id: "1", status: "confirmed", servicePrice: 100 }),
      mk({ id: "2", status: "completed", servicePrice: 50 }),
      mk({ id: "3", status: "pending", servicePrice: 999 }),
      mk({ id: "4", status: "cancelled", servicePrice: 999 }),
      mk({ id: "5", status: "no_show", servicePrice: 999 }),
      mk({ id: "6", bookingType: "break", servicePrice: 999 }),
      mk({ id: "7", bookingType: "training", servicePrice: 999 }),
    ]);
    expect(total).toBe(150);
  });
});

describe("groupClientHits", () => {
  it("makes one row per phone number, most recent first, counting real visits", () => {
    const hits = groupClientHits([
      mk({ id: "1", customerName: "Jane Smith", customerPhone: "0411", date: "2026-09-01" }),
      mk({ id: "2", customerName: "Jane Smith", customerPhone: "0411", date: "2026-10-01" }),
      mk({ id: "3", customerName: "Jane Smith", customerPhone: "0411", date: "2026-08-01", status: "cancelled" }),
      mk({ id: "4", customerName: "Mia Chen", customerPhone: "0422", date: "2026-10-10" }),
    ]);
    expect(hits.map((c) => c.name)).toEqual(["Mia Chen", "Jane Smith"]);
    expect(hits[1]).toMatchObject({ visits: 2, lastVisit: "2026-10-01" });
  });

  it("falls back to the name when there is no phone number", () => {
    const hits = groupClientHits([
      mk({ id: "1", customerName: "Walk In", customerPhone: "" }),
      mk({ id: "2", customerName: "Walk In", customerPhone: "" }),
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].visits).toBe(2);
  });
});

describe("computeOpenSlots", () => {
  const range = { start: h(10), end: h(18), closed: false };
  const args = {
    hours: { open: 10, close: 18 },
    range,
    isPast: false,
    isToday: false,
    nowMinutes: 0,
    occupied: [],
  };

  it("tiles a free working day into hour-long slots", () => {
    expect(computeOpenSlots(args)).toHaveLength(8);
  });

  it("offers nothing for an off stylist, a closed day or a past date", () => {
    expect(computeOpenSlots({ ...args, hours: null })).toEqual([]);
    expect(computeOpenSlots({ ...args, range: { ...range, closed: true } })).toEqual([]);
    expect(computeOpenSlots({ ...args, isPast: true })).toEqual([]);
  });

  it("starts after now today, rounded up to the next quarter hour", () => {
    const slots = computeOpenSlots({ ...args, isToday: true, nowMinutes: h(11, 5) });
    expect(slots[0].start).toBe(h(11, 15));
  });

  it("stays inside the stylist's hours and around bookings", () => {
    const slots = computeOpenSlots({
      ...args,
      hours: { open: 12, close: 15 },
      occupied: [{ start: h(13), end: h(14) }],
    });
    expect(slots).toEqual([
      { start: h(12), end: h(13) },
      { start: h(14), end: h(15) },
    ]);
  });
});
