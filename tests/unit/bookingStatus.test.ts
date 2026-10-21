// tests/unit/bookingStatus.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The booking lifecycle rules: which statuses free a slot, which count as
// revenue, which actions each status offers, and the toast wording.
import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  REVENUE_STATUSES,
  blocksSlot,
  countsAsRevenue,
  describeStatusChange,
  formatClockTime,
  getRestoreStatus,
  getStatusActions,
  isOpenStatus,
  isSlotFreeing,
} from "../../src/lib/bookingStatus";

describe("slot availability by status", () => {
  it("only cancelled and no_show free the slot", () => {
    const freeing = BOOKING_STATUSES.filter(isSlotFreeing);
    expect(freeing).toEqual(["no_show", "cancelled"]);
  });

  it("every other status keeps blocking the chair, completed included", () => {
    for (const status of [
      "pending",
      "confirmed",
      "arrived",
      "in_service",
      "completed",
    ] as const) {
      expect(blocksSlot(status)).toBe(true);
    }
  });
});

describe("revenue and open statuses", () => {
  it("revenue covers confirmed through completed, not pending / no-show / cancelled", () => {
    expect([...REVENUE_STATUSES]).toEqual([
      "confirmed",
      "arrived",
      "in_service",
      "completed",
    ]);
    expect(countsAsRevenue("pending")).toBe(false);
    expect(countsAsRevenue("no_show")).toBe(false);
    expect(countsAsRevenue("cancelled")).toBe(false);
  });

  it("completed, no-show and cancelled are no longer open", () => {
    expect(isOpenStatus("in_service")).toBe(true);
    expect(isOpenStatus("completed")).toBe(false);
    expect(isOpenStatus("no_show")).toBe(false);
    expect(isOpenStatus("cancelled")).toBe(false);
  });
});

describe("getStatusActions", () => {
  const next = (s: Parameters<typeof getStatusActions>[0]) =>
    getStatusActions(s).map((a) => a.status);

  it("walks a booking forward through the lifecycle", () => {
    expect(next("pending")).toEqual(["confirmed", "cancelled"]);
    expect(next("confirmed")).toEqual([
      "arrived",
      "in_service",
      "no_show",
      "cancelled",
    ]);
    expect(next("arrived")).toEqual(["in_service", "cancelled"]);
    expect(next("in_service")).toEqual(["completed"]);
  });

  it("offers nothing once a booking is completed, cancelled or no-show", () => {
    expect(next("completed")).toEqual([]);
    expect(next("cancelled")).toEqual([]);
    expect(next("no_show")).toEqual([]);
  });

  it("never offers a no-show for a client who has already arrived", () => {
    expect(next("arrived")).not.toContain("no_show");
  });
});

describe("getRestoreStatus", () => {
  it("returns the status the booking had before it was released", () => {
    expect(getRestoreStatus({ restoreStatus: "confirmed" })).toBe("confirmed");
    expect(getRestoreStatus({ restoreStatus: "arrived" })).toBe("arrived");
  });

  it("falls back to pending for older records or a bad value", () => {
    expect(getRestoreStatus({})).toBe("pending");
    expect(getRestoreStatus({ restoreStatus: "cancelled" })).toBe("pending");
  });
});

describe("describeStatusChange", () => {
  it("words single and bulk changes", () => {
    expect(describeStatusChange("cancelled", 1)).toBe("Booking cancelled");
    expect(describeStatusChange("confirmed", 12)).toBe("12 bookings confirmed");
    expect(describeStatusChange("no_show", 1)).toBe("Marked as no-show");
    expect(describeStatusChange("completed", 3)).toBe("3 services completed");
  });

  it("uses restore wording when bookings come back", () => {
    expect(describeStatusChange("confirmed", 1, true)).toBe("Booking restored");
    expect(describeStatusChange("confirmed", 4, true)).toBe(
      "4 bookings restored",
    );
  });
});

describe("formatClockTime", () => {
  it("formats an ISO timestamp as a 12-hour clock time on the salon's (Melbourne) clock", () => {
    // 14:05 and 00:30 in Melbourne (AEST, UTC+10), however the test machine is set
    const iso = new Date(Date.UTC(2026, 7, 1, 4, 5)).toISOString();
    expect(formatClockTime(iso)).toBe("2:05 PM");
    expect(
      formatClockTime(new Date(Date.UTC(2026, 6, 31, 14, 30)).toISOString()),
    ).toBe("12:30 AM");
  });

  it("returns null for missing or invalid input", () => {
    expect(formatClockTime(undefined)).toBeNull();
    expect(formatClockTime("not a date")).toBeNull();
  });
});
