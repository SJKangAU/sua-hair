// tests/unit/createBooking.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Create-booking rules: combining several services into one walk-in, the
// "fits the gap" check, the phone lookup wording, and the Bookings list's
// grouping by day.
import { describe, expect, it } from "vitest";
import {
  combineServices,
  fitsGap,
  type ServiceSource,
} from "../../src/lib/walkinServices";
import {
  nextAutofillName,
  returningClientLabel,
} from "../../src/lib/customerLookup";
import {
  dateGroupLabel,
  groupBookingsByDate,
} from "../../src/lib/bookingGroups";
import type { Booking } from "../../src/types";

const cut: ServiceSource = {
  id: "cut",
  name: "Cut",
  activeTime: 45,
  restTime: 0,
  totalTime: 45,
  price: { director: 120, senior: 90, junior: 60 },
};
const colour: ServiceSource = {
  id: "colour",
  name: "Colour",
  activeTime: 30,
  restTime: 60,
  totalTime: 90,
  price: { director: 220, senior: 180, junior: 140 },
};

describe("combineServices", () => {
  it("is null with nothing selected", () => {
    expect(combineServices([], "junior")).toBeNull();
  });

  it("adds apply and total time and prices at the stylist's level", () => {
    const c = combineServices([cut, colour], "senior");
    expect(c).toMatchObject({
      serviceId: "cut",
      serviceName: "Cut + Colour",
      servicePrice: 270,
      activeTime: 75,
      restTime: 60,
      totalTime: 135,
    });
    expect(c?.services.map((s) => s.price)).toEqual([90, 180]);
  });

  it("a single service combines to itself", () => {
    expect(combineServices([colour], "junior")).toMatchObject({
      serviceName: "Colour",
      servicePrice: 140,
      activeTime: 30,
      restTime: 60,
      totalTime: 90,
    });
  });
});

describe("fitsGap", () => {
  it("counts the hands-on time already chosen", () => {
    expect(fitsGap([], cut, 60)).toBe(true);
    expect(fitsGap([cut], colour, 60)).toBe(false); // 45 + 30 > 60
    expect(fitsGap([colour], colour, 60)).toBe(true); // 30 + 30 = 60
  });
});

describe("phone lookup wording and autofill", () => {
  it("describes a returning client", () => {
    expect(returningClientLabel(5, "2026-10-03")).toBe(
      "Returning client · 5 visits · last visit Sat 3 Oct",
    );
    expect(returningClientLabel(1)).toBe("Returning client · 1 visit");
    expect(returningClientLabel(0, "garbage")).toBe("Returning client");
  });

  it("fills an empty name or one a lookup put there, never a typed one", () => {
    expect(nextAutofillName("", "", "Jane Smith")).toBe("Jane Smith");
    expect(nextAutofillName("Jane Smith", "Jane Smith", "Mia Chen")).toBe(
      "Mia Chen",
    );
    expect(nextAutofillName("Typed Name", "Jane Smith", "Mia Chen")).toBe(
      "Typed Name",
    );
    expect(nextAutofillName("Typed Name", "", undefined)).toBe("Typed Name");
  });
});

const mk = (id: string, date: string, time: string): Booking =>
  ({ id, date, time, customerName: id }) as Booking;

describe("groupBookingsByDate", () => {
  const today = "2026-10-20";
  const list = [
    mk("late", "2026-10-22", "2:00 PM"),
    mk("today-pm", "2026-10-20", "2:00 PM"),
    mk("today-am", "2026-10-20", "9:30 AM"),
    mk("tomorrow", "2026-10-21", "11:00 AM"),
    mk("yesterday", "2026-10-19", "10:00 AM"),
    mk("old", "2026-09-01", "10:00 AM"),
  ];

  it("lists upcoming days soonest first, times in order within a day", () => {
    const { groups } = groupBookingsByDate(list, today, false);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Tomorrow",
      "Thu 22 Oct",
    ]);
    expect(groups[0].bookings.map((b) => b.id)).toEqual(["today-am", "today-pm"]);
  });

  it("hides past days by default but reports how many there are", () => {
    const { groups, pastCount } = groupBookingsByDate(list, today, false);
    expect(groups.some((g) => g.isPast)).toBe(false);
    expect(pastCount).toBe(2);
  });

  it("puts past days after the upcoming ones, most recent first", () => {
    const { groups } = groupBookingsByDate(list, today, true);
    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Tomorrow",
      "Thu 22 Oct",
      "Yesterday",
      "Tue 1 Sep",
    ]);
    expect(groups.filter((g) => g.isPast)).toHaveLength(2);
  });

  it("names Today, Tomorrow and Yesterday and adds the year only when it differs", () => {
    expect(dateGroupLabel("2026-10-20", today)).toBe("Today");
    expect(dateGroupLabel("2026-10-21", today)).toBe("Tomorrow");
    expect(dateGroupLabel("2026-10-19", today)).toBe("Yesterday");
    expect(dateGroupLabel("2027-01-05", today)).toBe("Tue 5 Jan 2027");
  });
});
