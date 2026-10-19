// tests/unit/agenda.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The phone agenda (bookings and free stretches in one list) and the Today
// page's keyboard shortcuts.
import { describe, expect, it } from "vitest";
import {
  buildAgenda,
  formatFreeDuration,
  type AgendaStylist,
} from "../../src/lib/agenda";
import { isTypingTarget, todayShortcut } from "../../src/lib/shortcuts";
import type { Booking } from "../../src/types";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const mk = (overrides: Partial<Booking>): Booking =>
  ({
    id: "bk",
    bookingType: "customer",
    status: "confirmed",
    customerName: "Jane",
    stylistId: "steve",
    stylistName: "Steve",
    serviceName: "Cut",
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
    date: "2026-10-20",
    time: "10:00 AM",
    ...overrides,
  }) as Booking;

const stylists: AgendaStylist[] = [
  { id: "steve", name: "Steve Hwang", hours: { open: 10, close: 14 } },
  { id: "ethan", name: "Ethan Le", hours: { open: 10, close: 14 } },
  { id: "elly", name: "Elly Lee", hours: null }, // off today
];

const base = {
  stylists,
  filter: "all",
  isToday: false,
  isPast: false,
  nowMinutes: 0,
};

describe("buildAgenda", () => {
  it("interleaves bookings and free stretches in time order", () => {
    const items = buildAgenda({
      ...base,
      filter: "steve",
      dayBookings: [mk({ id: "a", time: "11:00 AM" })],
    });
    expect(items.map((i) => [i.kind, i.start])).toEqual([
      ["free", h(10)], // 10:00-11:00
      ["booking", h(11)],
      ["free", h(12)], // 12:00-14:00
    ]);
    const first = items[0];
    expect(first.kind === "free" && first.end).toBe(h(11));
  });

  it("narrows to one stylist and drops cancelled / no-show bookings", () => {
    const items = buildAgenda({
      ...base,
      filter: "ethan",
      dayBookings: [
        mk({ id: "a", stylistId: "steve" }),
        mk({ id: "b", stylistId: "ethan", status: "cancelled" }),
        mk({ id: "c", stylistId: "ethan", time: "12:00 PM", status: "pending" }),
      ],
    });
    const bookings = items.filter((i) => i.kind === "booking");
    expect(bookings).toHaveLength(1);
    expect(bookings[0].kind === "booking" && bookings[0].booking.id).toBe("c");
  });

  it("offers no free time for an off stylist or a past day", () => {
    expect(
      buildAgenda({ ...base, filter: "elly", dayBookings: [] }),
    ).toEqual([]);
    expect(buildAgenda({ ...base, isPast: true, dayBookings: [] })).toEqual([]);
  });

  it("starts today's free time at the next quarter hour after now", () => {
    const items = buildAgenda({
      ...base,
      filter: "steve",
      isToday: true,
      nowMinutes: h(11, 5),
      dayBookings: [],
    });
    expect(items).toHaveLength(1);
    expect(items[0].start).toBe(h(11, 15));
  });

  it("skips free stretches shorter than 45 minutes", () => {
    const items = buildAgenda({
      ...base,
      filter: "steve",
      dayBookings: [
        mk({ id: "a", time: "10:30 AM", totalTime: 210 }), // 10:30-14:00
      ],
    });
    // 10:00-10:30 is only 30 minutes
    expect(items.filter((i) => i.kind === "free")).toEqual([]);
  });
});

describe("formatFreeDuration", () => {
  it("reads as minutes, hours, or both", () => {
    expect(formatFreeDuration(45)).toBe("45 min");
    expect(formatFreeDuration(120)).toBe("2 h");
    expect(formatFreeDuration(90)).toBe("1 h 30 min");
  });
});

describe("todayShortcut", () => {
  const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey", boolean>> = {}) =>
    todayShortcut({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it("maps N, the arrows and T", () => {
    expect(key("n")).toBe("new");
    expect(key("N")).toBe("new");
    expect(key("ArrowLeft")).toBe("prev");
    expect(key("ArrowRight")).toBe("next");
    expect(key("t")).toBe("today");
  });

  it("leaves modified keys to the browser and the search box", () => {
    expect(key("k", { ctrlKey: true })).toBeNull();
    expect(key("n", { metaKey: true })).toBeNull();
    expect(key("t", { altKey: true })).toBeNull();
  });

  it("ignores everything else", () => {
    expect(key("x")).toBeNull();
    expect(key("Enter")).toBeNull();
  });
});

describe("isTypingTarget", () => {
  const el = (tagName: string, isContentEditable = false) =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it("is true for form fields and editable content only", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", true))).toBe(true);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
