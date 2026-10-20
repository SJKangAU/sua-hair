// tests/unit/adminLifecycle.test.ts
// ─────────────────────────────────────────────────────────────────────────
// Pure-logic evidence for defects D2 (cancel / undo / restore), D3 (the admin
// timeline follows the configured opening hours for each date) and D4
// (upcoming-first ordering). The write paths themselves are exercised against
// the Firestore emulator in tests/firestore/admin*.test.ts.
import { describe, expect, it } from "vitest";
import { deleteField } from "firebase/firestore";
import { buildStatusPatch } from "../../src/lib/statusPatch";
import {
  getRestoreStatus,
  describeStatusChange,
} from "../../src/lib/bookingStatus";
import { getSalonHoursForDate } from "../../src/lib/scheduling";
import { computeDayRange } from "../../src/lib/timelineLayout";
import { groupBookingsByDate } from "../../src/lib/bookingGroups";
import { filterBookings, DEFAULT_FILTERS } from "../../src/lib/bookingFilters";
import type { Booking, SalonSettings } from "../../src/types";

const booking = (over: Partial<Booking> = {}): Booking =>
  ({
    id: "b1",
    status: "confirmed",
    customerName: "Jane",
    customerPhone: "0412345678",
    date: "2026-12-01",
    time: "10:00 AM",
    ...over,
  }) as Booking;

describe("D2 — cancel records what to restore, restore clears it", () => {
  it("cancelling remembers the previous status for Restore", () => {
    const { patch, local } = buildStatusPatch(
      booking({ status: "confirmed" }),
      "cancelled",
    );
    expect(patch.status).toBe("cancelled");
    expect(patch.restoreStatus).toBe("confirmed");
    expect(local.restoreStatus).toBe("confirmed");
  });

  it("restoring returns to the remembered status and clears the marker", () => {
    const cancelled = booking({ status: "cancelled", restoreStatus: "arrived" });
    const target = getRestoreStatus(cancelled);
    expect(target).toBe("arrived");
    const { patch, local } = buildStatusPatch(cancelled, target);
    expect(patch.status).toBe("arrived");
    expect(
      (patch.restoreStatus as ReturnType<typeof deleteField>).isEqual(
        deleteField(),
      ),
    ).toBe(true);
    expect(local.restoreStatus).toBeUndefined();
  });

  it("an old cancelled record with no marker restores to pending", () => {
    expect(getRestoreStatus(booking({ status: "cancelled" }))).toBe("pending");
  });

  it("no-show is released and restorable exactly like cancelled", () => {
    const { patch } = buildStatusPatch(booking({ status: "pending" }), "no_show");
    expect(patch.restoreStatus).toBe("pending");
  });

  it("moving between two live statuses touches neither restoreStatus nor release state", () => {
    const { patch } = buildStatusPatch(booking({ status: "pending" }), "confirmed");
    expect("restoreStatus" in patch).toBe(false);
  });

  it("every change appends one history line", () => {
    const { local } = buildStatusPatch(
      booking({ status: "pending", history: [] }),
      "confirmed",
    );
    expect(local.history).toHaveLength(1);
  });

  it("a cancelled booking still appears in the Bookings list when the status filter asks for it", () => {
    const list = [
      booking({ id: "live", status: "confirmed" }),
      booking({ id: "gone", status: "cancelled" }),
    ];
    expect(filterBookings(list, DEFAULT_FILTERS).map((b) => b.id)).toEqual([
      "live",
      "gone",
    ]);
    expect(
      filterBookings(list, { ...DEFAULT_FILTERS, status: "cancelled" }).map(
        (b) => b.id,
      ),
    ).toEqual(["gone"]);
  });

  it("bulk changes are worded as one summary, not one message per booking", () => {
    expect(describeStatusChange("confirmed", 7)).toBe("7 bookings confirmed");
    expect(describeStatusChange("cancelled", 3)).toBe("3 bookings cancelled");
    expect(describeStatusChange("confirmed", 7, true)).toBe(
      "7 bookings restored",
    );
  });
});

describe("D3 — the admin timeline follows the configured hours for each date", () => {
  const day = (open: number, close: number) => ({ isOpen: true, open, close });
  const settings: SalonSettings = {
    weeklySchedule: {
      sun: day(11, 16),
      mon: { isOpen: false, open: 10, close: 18 },
      tue: day(10, 18),
      wed: day(10, 18),
      thu: day(10, 20), // late night Thursday
      fri: day(10, 18),
      sat: day(9, 17),
    },
    dateOverrides: {
      "2026-12-25": { closed: true },
      "2026-12-28": { open: 12, close: 15 }, // a Monday opened specially
    },
  };
  const rangeFor = (date: string, bookings: Pick<Booking, "time" | "totalTime">[] = []) =>
    computeDayRange(getSalonHoursForDate(date, settings), bookings);
  const h = (n: number) => n * 60;

  it("a normal weekday uses the weekly schedule", () => {
    expect(rangeFor("2026-12-02")).toMatchObject({ start: h(10), end: h(18) }); // Wed
  });

  it("different weekdays get different grids (Thu late, Sat early, Sun short)", () => {
    expect(rangeFor("2026-12-03")).toMatchObject({ start: h(10), end: h(20) });
    expect(rangeFor("2026-12-05")).toMatchObject({ start: h(9), end: h(17) });
    expect(rangeFor("2026-12-06")).toMatchObject({ start: h(11), end: h(16) });
  });

  it("a date override beats the weekly schedule", () => {
    expect(rangeFor("2026-12-28")).toMatchObject({
      start: h(12),
      end: h(15),
      closed: false,
    });
  });

  it("a closed day is flagged closed", () => {
    expect(rangeFor("2026-12-25").closed).toBe(true); // override
    expect(rangeFor("2026-11-30").closed).toBe(true); // Monday
  });

  it("a booking outside the hours still shows (grid stretches, never hides it)", () => {
    const r = rangeFor("2026-12-05", [{ time: "5:30 PM", totalTime: 60 }]); // Sat 9-17
    expect(r.end).toBe(h(19));
  });
});

describe("D4 — upcoming bookings come first", () => {
  const mk = (id: string, date: string, time = "10:00 AM"): Booking =>
    booking({ id, date, time });

  it("soonest upcoming day first, oldest history last and hidden by default", () => {
    const today = "2026-12-01";
    const list = [
      mk("past", "2026-11-01"),
      mk("later", "2026-12-20"),
      mk("soon", "2026-12-02"),
      mk("now", "2026-12-01"),
    ];
    const hidden = groupBookingsByDate(list, today, false);
    expect(hidden.groups.flatMap((g) => g.bookings.map((b) => b.id))).toEqual([
      "now",
      "soon",
      "later",
    ]);
    expect(hidden.pastCount).toBe(1);
    const shown = groupBookingsByDate(list, today, true);
    expect(shown.groups.at(-1)?.bookings[0].id).toBe("past");
  });
});
