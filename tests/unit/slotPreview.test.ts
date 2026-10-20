// tests/unit/slotPreview.test.ts
// The hover preview on the booking page: 15-minute display snapping on top of
// the engine's 30-minute start grid. Availability always comes from the real
// scheduling engine (generateSlots), never re-implemented here.
import { describe, expect, it } from "vitest";
import {
  PREVIEW_SNAP_MINUTES,
  bookableStartAtOrBefore,
  describePreview,
  previewAt,
  snapToPreviewGrid,
  stepCursor,
} from "../../src/lib/slotPreview";
import { generateSlots } from "../../src/lib/scheduling";
import type { SlotBlock } from "../../src/types";

const h = (hour: number, min = 0) => hour * 60 + min;
const STYLIST = "steve";
const DATE = "2027-03-10"; // a future Wednesday, so "too soon" never applies

const booked = (over: Partial<SlotBlock>): SlotBlock => ({
  id: "b1",
  stylistId: STYLIST,
  date: DATE,
  time: "10:00 AM",
  activeTime: 60,
  restTime: 0,
  totalTime: 60,
  status: "confirmed",
  ...over,
});

const slotsFor = (total: number, active: number, existing: SlotBlock[] = []) =>
  generateSlots(DATE, STYLIST, total, active, existing);

describe("snapping to the 15-minute display grid", () => {
  it("floors a position to the 15-minute row it is in", () => {
    expect(PREVIEW_SNAP_MINUTES).toBe(15);
    expect(snapToPreviewGrid(h(11, 0))).toBe(h(11, 0));
    expect(snapToPreviewGrid(h(11, 7))).toBe(h(11, 0));
    expect(snapToPreviewGrid(h(11, 14))).toBe(h(11, 0));
    expect(snapToPreviewGrid(h(11, 15))).toBe(h(11, 15));
    expect(snapToPreviewGrid(h(11, 29))).toBe(h(11, 15));
    expect(snapToPreviewGrid(h(11, 44))).toBe(h(11, 30));
    expect(snapToPreviewGrid(h(11, 59))).toBe(h(11, 45));
  });

  it("a finger tap on a :15 / :45 row resolves to the start at or before it", () => {
    expect(bookableStartAtOrBefore(h(11, 15))).toBe(h(11, 0));
    expect(bookableStartAtOrBefore(h(11, 45))).toBe(h(11, 30));
    expect(bookableStartAtOrBefore(h(11, 30))).toBe(h(11, 30));
  });

  it("keyboard steps move 15 minutes and stay inside the day", () => {
    expect(stepCursor(h(11, 0), 15, h(10), h(18))).toBe(h(11, 15));
    expect(stepCursor(h(11, 0), -15, h(10), h(18))).toBe(h(10, 45));
    expect(stepCursor(h(10, 0), -15, h(10), h(18))).toBe(h(10, 0)); // top
    expect(stepCursor(h(17, 45), 15, h(10), h(18))).toBe(h(17, 45)); // bottom
    expect(stepCursor(h(11, 0), 60, h(10), h(18))).toBe(h(12, 0));
  });
});

describe("the block shown is exactly the service's total time", () => {
  it("a 45-minute service at 11:00 occupies 11:00 - 11:45", () => {
    const p = previewAt(h(11), slotsFor(45, 45), 45, 45);
    expect(p).toMatchObject({ kind: "ok", start: h(11), end: h(11, 45), time: "11:00 AM" });
  });

  it("a 90-minute service (60 hands-on + 30 processing) occupies 90 minutes, split into the two phases", () => {
    const p = previewAt(h(11, 30), slotsFor(90, 60), 90, 60);
    expect(p).toMatchObject({
      kind: "ok",
      start: h(11, 30),
      end: h(13),
      activeEnd: h(12, 30),
    });
    if (p.kind === "ok") expect(p.end - p.start).toBe(90);
  });

  it("a service with no processing time is all hands-on", () => {
    const p = previewAt(h(11), slotsFor(60, 60), 60, 60);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.activeEnd).toBe(p.end);
  });

  it("the label spells out the range, with both am/pm when it crosses noon", () => {
    const p = previewAt(h(11, 30), slotsFor(90, 60), 90, 60);
    if (p.kind !== "ok") throw new Error("expected ok");
    expect(p.label).toBe("11:30 am – 1:00 pm");
    const q = previewAt(h(14), slotsFor(60, 60), 60, 60);
    if (q.kind !== "ok") throw new Error("expected ok");
    expect(q.label).toBe("2:00 – 3:00 pm");
  });

  it("hovering anywhere inside a start's row gives the same block", () => {
    const slots = slotsFor(60, 60);
    expect(previewAt(h(11, 0), slots, 60, 60)).toEqual(previewAt(h(11, 14), slots, 60, 60));
  });
});

describe("the block is rejected when it does not fit", () => {
  it("overlapping another booking is unavailable, with no block", () => {
    // Steve booked 11:30 - 12:30; a 60-min service at 11:00 would run into it
    const slots = slotsFor(60, 60, [booked({ time: "11:30 AM" })]);
    const p = previewAt(h(11), slots, 60, 60);
    expect(p.kind).toBe("unavailable");
    expect("end" in p).toBe(false);
  });

  it("the same service fits where it ends exactly as the next booking starts", () => {
    const slots = slotsFor(60, 60, [booked({ time: "12:00 PM" })]);
    expect(previewAt(h(11), slots, 60, 60).kind).toBe("ok");
  });

  it("a block that would run past closing is not offered", () => {
    // 90 min starting 5:00 PM would end 6:30 PM; the salon closes at 6:00 PM
    const slots = slotsFor(90, 60);
    expect(previewAt(h(17), slots, 90, 60).kind).toBe("outside");
    expect(previewAt(h(16, 30), slots, 90, 60).kind).toBe("ok"); // ends exactly at close
  });

  it("before opening is outside", () => {
    expect(previewAt(h(9), slotsFor(60, 60), 60, 60).kind).toBe("outside");
  });

  it("cancelled bookings do not block", () => {
    const slots = slotsFor(60, 60, [booked({ time: "11:00 AM", status: "cancelled" })]);
    expect(previewAt(h(11), slots, 60, 60).kind).toBe("ok");
  });
});

describe("a block inside another booking's rest window is allowed (existing rule, unchanged)", () => {
  // Colour at 10:00: 30 min hands-on, 30 min processing -> Steve is free 10:30 - 11:00
  const colour = booked({ time: "10:00 AM", activeTime: 30, restTime: 30, totalTime: 60 });

  it("a 20-minute service whose hands-on time fits the window is offered at 10:30", () => {
    expect(previewAt(h(10, 30), slotsFor(20, 20, [colour]), 20, 20)).toMatchObject({
      kind: "ok",
      start: h(10, 30),
      end: h(10, 50),
    });
  });

  it("a 45-minute service does not fit that 30-minute window", () => {
    expect(previewAt(h(10, 30), slotsFor(45, 45, [colour]), 45, 45).kind).toBe("unavailable");
  });

  it("the colour's own hands-on time stays blocked", () => {
    expect(previewAt(h(10), slotsFor(20, 20, [colour]), 20, 20).kind).toBe("unavailable");
  });
});

describe("15-minute display positions are never offered as start times", () => {
  it(":15 and :45 are off-grid even in completely free time", () => {
    const slots = slotsFor(60, 60);
    expect(previewAt(h(11, 15), slots, 60, 60)).toEqual({ kind: "off-grid", start: h(11, 15) });
    expect(previewAt(h(11, 45), slots, 60, 60)).toEqual({ kind: "off-grid", start: h(11, 45) });
    expect(previewAt(h(11, 0), slots, 60, 60).kind).toBe("ok");
    expect(previewAt(h(11, 30), slots, 60, 60).kind).toBe("ok");
  });

  it("the engine itself still only produces 30-minute starts", () => {
    const starts = slotsFor(60, 60).map((s) => s.time);
    expect(starts.every((t) => /:(00|30) /.test(t))).toBe(true);
  });
});

describe("what a screen reader is told", () => {
  it("describes available, unavailable and off-grid positions", () => {
    const slots = slotsFor(60, 60, [booked({ time: "11:30 AM" })]);
    expect(describePreview(previewAt(h(14), slots, 60, 60))).toBe(
      "2:00 – 3:00 pm, available. Press Enter to choose 2:00 PM.",
    );
    expect(describePreview(previewAt(h(11), slots, 60, 60))).toMatch(/^11:00 AM, not available\./);
    expect(describePreview(previewAt(h(14, 15), slots, 60, 60))).toMatch(/hour or half hour/);
  });
});
