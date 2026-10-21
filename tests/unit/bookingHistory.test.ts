// tests/unit/bookingHistory.test.ts
// The history log (drawer) and the phase rules (±15 min, Edit phases).
import { describe, expect, it } from "vitest";
import {
  buildHistoryView,
  formatHistoryTime,
  movedHistoryEntry,
  statusHistoryEntry,
} from "../../src/lib/bookingHistory";
import type { Booking } from "../../src/types";

describe("statusHistoryEntry", () => {
  it("labels a normal progression with the new status", () => {
    const e = statusHistoryEntry("pending", "confirmed", "2026-08-05T00:00:00.000Z");
    expect(e).toEqual({
      at: "2026-08-05T00:00:00.000Z",
      type: "status",
      status: "confirmed",
      label: "Confirmed",
    });
  });

  it("calls a return from cancelled / no-show a restore", () => {
    expect(statusHistoryEntry("cancelled", "confirmed").label).toBe(
      "Restored to confirmed",
    );
    expect(statusHistoryEntry("no_show", "pending").label).toBe(
      "Restored to pending",
    );
  });

  it("does not call cancel -> no-show a restore", () => {
    expect(statusHistoryEntry("cancelled", "no_show").label).toBe("No-show");
  });
});

describe("movedHistoryEntry", () => {
  const from = { date: "2026-08-05", time: "10:00 AM", stylistName: "Ethan" };

  it("names the stylists only when they differ", () => {
    expect(
      movedHistoryEntry(from, { ...from, time: "11:00 AM" }).label,
    ).toBe("Moved from Wed 5 Aug, 10:00 AM to Wed 5 Aug, 11:00 AM");
    expect(
      movedHistoryEntry(from, { ...from, stylistName: "Elly" }).label,
    ).toContain("with Ethan");
  });
});

describe("buildHistoryView", () => {
  const base = {
    id: "bk-1",
    bookingType: "customer",
    createdAt: "2026-08-01T00:00:00.000Z",
  } as Booking;

  it("always ends with the derived 'Created' row, even with no stored history", () => {
    const view = buildHistoryView(base);
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ type: "created", label: "Booked online" });
  });

  it("lists newest first and keeps created last", () => {
    const view = buildHistoryView({
      ...base,
      history: [
        { at: "2026-08-02T00:00:00.000Z", type: "status", status: "confirmed", label: "Confirmed" },
        { at: "2026-08-03T00:00:00.000Z", type: "moved", label: "Moved" },
      ],
    });
    expect(view.map((e) => e.label)).toEqual(["Moved", "Confirmed", "Booked online"]);
  });

  it("describes walk-ins and tolerates a malformed history field", () => {
    const view = buildHistoryView({
      ...base,
      bookingType: "walkin",
      history: "nonsense" as unknown as Booking["history"],
    });
    expect(view).toEqual([
      expect.objectContaining({ label: "Walk-in created" }),
    ]);
  });
});

describe("formatHistoryTime", () => {
  it("formats day and 12-hour time, or nothing for a bad timestamp", () => {
    // 14:05 on 5 Aug in Melbourne (UTC+10 in winter), whatever the machine's zone
    const iso = new Date(Date.UTC(2026, 7, 5, 4, 5)).toISOString();
    expect(formatHistoryTime(iso)).toMatch(/^5 Aug, 2:05 PM$/);
    expect(formatHistoryTime("garbage")).toBe("");
  });
});
