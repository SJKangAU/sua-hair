// tests/unit/bookingHistory.test.ts
// The history log (drawer) and the phase rules (±15 min, Edit phases).
import { describe, expect, it } from "vitest";
import {
  buildHistoryView,
  formatHistoryTime,
  movedHistoryEntry,
  phasesHistoryEntry,
  statusHistoryEntry,
} from "../../src/lib/bookingHistory";
import {
  MAX_PHASE_MINUTES,
  stepPhases,
  steppedPhase,
  validatePhases,
} from "../../src/lib/phases";
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

describe("movedHistoryEntry / phasesHistoryEntry", () => {
  const from = { date: "2026-08-05", time: "10:00 AM", stylistName: "Ethan" };

  it("names the stylists only when they differ", () => {
    expect(
      movedHistoryEntry(from, { ...from, time: "11:00 AM" }).label,
    ).toBe("Moved from Wed 5 Aug, 10:00 AM to Wed 5 Aug, 11:00 AM");
    expect(
      movedHistoryEntry(from, { ...from, stylistName: "Elly" }).label,
    ).toContain("with Ethan");
  });

  it("describes only the phases that changed", () => {
    expect(
      phasesHistoryEntry(
        { activeTime: 45, restTime: 30 },
        { activeTime: 45, restTime: 45 },
      ).label,
    ).toBe("Timings changed: processing 30 to 45 min");
    expect(
      phasesHistoryEntry(
        { activeTime: 45, restTime: 30 },
        { activeTime: 60, restTime: 45 },
      ).label,
    ).toBe("Timings changed: apply 45 to 60 min, processing 30 to 45 min");
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
    const iso = new Date(2026, 7, 5, 14, 5).toISOString();
    expect(formatHistoryTime(iso)).toMatch(/^5 Aug, 2:05 PM$/);
    expect(formatHistoryTime("garbage")).toBe("");
  });
});

describe("phases", () => {
  it("steps processing when the booking has one, otherwise apply", () => {
    expect(steppedPhase({ activeTime: 45, restTime: 30 })).toBe("restTime");
    expect(steppedPhase({ activeTime: 45, restTime: 0 })).toBe("activeTime");
  });

  it("applies a 15-minute step to the right phase", () => {
    expect(stepPhases({ activeTime: 45, restTime: 30 }, 15)).toEqual({
      activeTime: 45,
      restTime: 45,
    });
    expect(stepPhases({ activeTime: 45, restTime: 0 }, -15)).toEqual({
      activeTime: 30,
      restTime: 0,
    });
  });

  it("refuses a step that leaves the allowed range", () => {
    expect(stepPhases({ activeTime: 10, restTime: 0 }, -15)).toBeNull();
    expect(stepPhases({ activeTime: 45, restTime: 10 }, -15)).toBeNull();
    expect(
      stepPhases({ activeTime: 45, restTime: MAX_PHASE_MINUTES }, 15),
    ).toBeNull();
  });

  it("validates both phases", () => {
    expect(validatePhases({ activeTime: 45, restTime: 30 })).toBeNull();
    expect(validatePhases({ activeTime: 0, restTime: 30 })).toMatch(/Apply time/);
    expect(validatePhases({ activeTime: 45, restTime: -5 })).toMatch(/Processing time/);
    expect(validatePhases({ activeTime: Number.NaN, restTime: 0 })).toMatch(/Apply time/);
  });
});
