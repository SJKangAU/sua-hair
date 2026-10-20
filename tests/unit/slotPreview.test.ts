// tests/unit/slotPreview.test.ts
// The hover preview on the booking page: 15-minute display snapping on top of
// the engine's start slots (15 minutes, DEC-024). Availability always comes from the real
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

  it("with a 15-minute interval every display row is itself a start; a wider interval resolves taps to the start before", () => {
    expect(bookableStartAtOrBefore(h(11, 15))).toBe(h(11, 15));
    expect(bookableStartAtOrBefore(h(11, 45))).toBe(h(11, 45));
    // if the engine's interval were 30, :15 / :45 taps would resolve backwards
    expect(bookableStartAtOrBefore(h(11, 15), 30)).toBe(h(11, 0));
    expect(bookableStartAtOrBefore(h(11, 45), 30)).toBe(h(11, 30));
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

describe("quarter-hour starts (slotIntervalMinutes = 15, DEC-024)", () => {
  it("the engine offers a start every 15 minutes", () => {
    const starts = slotsFor(60, 60).map((s) => s.time);
    expect(starts.slice(0, 5)).toEqual(["10:00 AM", "10:15 AM", "10:30 AM", "10:45 AM", "11:00 AM"]);
    expect(starts.at(-1)).toBe("5:00 PM"); // last start that still finishes by 6:00 PM
  });

  it(":15 and :45 are real, bookable starts when they are free", () => {
    const slots = slotsFor(60, 60);
    expect(previewAt(h(11, 15), slots, 60, 60)).toMatchObject({
      kind: "ok",
      start: h(11, 15),
      end: h(12, 15),
      label: "11:15 am – 12:15 pm",
    });
    expect(previewAt(h(11, 45), slots, 60, 60).kind).toBe("ok");
  });

  it("a 90-minute service at 11:15 occupies 11:15 am - 12:45 pm", () => {
    const p = previewAt(h(11, 15), slotsFor(90, 60), 90, 60);
    expect(p).toMatchObject({ kind: "ok", end: h(12, 45), activeEnd: h(12, 15), label: "11:15 am – 12:45 pm" });
  });

  it("quarter-hour starts still respect every engine rule", () => {
    const slots = slotsFor(60, 60, [booked({ time: "11:30 AM" })]);
    expect(previewAt(h(10, 30), slots, 60, 60).kind).toBe("ok"); // ends 11:30 exactly
    expect(previewAt(h(10, 45), slots, 60, 60).kind).toBe("unavailable"); // runs into it
    expect(previewAt(h(12, 15), slots, 60, 60).kind).toBe("unavailable"); // starts inside it
    expect(previewAt(h(12, 30), slots, 60, 60).kind).toBe("ok"); // as it ends
    // closing: 60 min starting 5:15 PM would finish 6:15 PM
    expect(previewAt(h(17, 15), slotsFor(60, 60), 60, 60).kind).toBe("outside");
    expect(previewAt(h(17), slotsFor(60, 60), 60, 60).kind).toBe("ok");
  });

  it("a quarter-hour start inside another booking's rest window is allowed if it fits", () => {
    const colour = booked({ time: "10:00 AM", activeTime: 30, restTime: 30, totalTime: 60 });
    // free 10:30 - 11:00: a 15-minute service fits at 10:30, 10:45 (ends 11:00), not at 10:15
    const slots = slotsFor(15, 15, [colour]);
    expect(previewAt(h(10, 45), slots, 15, 15).kind).toBe("ok");
    expect(previewAt(h(10, 15), slots, 15, 15).kind).toBe("unavailable");
  });
});

describe("if the interval is ever set wider than the 15-minute display (e.g. 30)", () => {
  // The same code path as before DEC-024: only engine slots are starts
  const thirty = (total: number, active: number) =>
    slotsFor(total, active).filter((s) => /:(00|30) /.test(s.time));

  it(":15 / :45 positions are off-grid, never highlighted", () => {
    const slots = thirty(60, 60);
    expect(previewAt(h(11, 15), slots, 60, 60, 30)).toEqual({ kind: "off-grid", start: h(11, 15) });
    expect(previewAt(h(11, 45), slots, 60, 60, 30)).toEqual({ kind: "off-grid", start: h(11, 45) });
    expect(previewAt(h(11, 30), slots, 60, 60, 30).kind).toBe("ok");
  });

  it("and describe themselves with the interval", () => {
    expect(describePreview(previewAt(h(14, 15), thirty(60, 60), 60, 60, 30), 30)).toMatch(
      /Bookings start every 30 minutes/,
    );
  });
});

describe("what a screen reader is told", () => {
  it("describes available and unavailable positions", () => {
    const slots = slotsFor(60, 60, [booked({ time: "11:30 AM" })]);
    expect(describePreview(previewAt(h(14), slots, 60, 60))).toBe(
      "2:00 – 3:00 pm, available. Press Enter to choose 2:00 PM.",
    );
    expect(describePreview(previewAt(h(14, 15), slots, 60, 60))).toBe(
      "2:15 – 3:15 pm, available. Press Enter to choose 2:15 PM.",
    );
    expect(describePreview(previewAt(h(11), slots, 60, 60))).toMatch(/^11:00 AM, not available\./);
  });
});
