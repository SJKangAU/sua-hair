// tests/unit/phaseResize.test.ts
// Dragging the bottom edge of one phase on the timeline: the booking's new
// phases, snapped to 15 minutes, with everything after the phase moving along.
// The allowed/refused decision is planPhaseEdit's (see bookingPhases.test.ts).
import { describe, expect, it } from "vitest";
import { drawnPhases, edgeOf, phasesAfterEdgeDrag } from "../../src/lib/phaseResize";
import { planPhaseEdit } from "../../src/lib/phaseEdit";
import { describeConflict } from "../../src/lib/scheduling";
import { phaseTotals, type Phase } from "../../src/lib/bookingPhases";
import type { Booking, SlotBlock } from "../../src/types";

const h = (hour: number, min = 0) => hour * 60 + min;
const A = (minutes: number): Phase => ({ type: "active", minutes });
const R = (minutes: number): Phase => ({ type: "rest", minutes });
const DATE = "2027-03-10";

const booking = (id: string, time: string, phases: Phase[]): SlotBlock & Booking =>
  ({
    id,
    stylistId: "steve",
    date: DATE,
    time,
    status: "confirmed",
    phases,
    ...phaseTotals(phases),
    customerName: `Client ${id}`,
    serviceName: "Service",
    bookingType: "customer",
  }) as SlotBlock & Booking;

const perm = booking("perm", "10:00 AM", [A(60), R(30), A(30)]);

describe("phase edge drag", () => {
  it("lists the drawn phases and where each starts", () => {
    const drawn = drawnPhases(perm);
    expect(drawn.phases).toEqual([A(60), R(30), A(30)]);
    expect(drawn.starts).toEqual([h(10), h(11), h(11, 30)]);
    // a legacy two-phase booking has its phases derived
    const legacy = drawnPhases({ time: "9:00 AM", activeTime: 30, restTime: 45, totalTime: 75 });
    expect(legacy.phases).toEqual([A(30), R(45)]);
  });

  it("dragging the processing edge lengthens it and moves the return later", () => {
    const drawn = drawnPhases(perm);
    const next = phasesAfterEdgeDrag(drawn, 1, h(11, 45))!;
    expect(next).toEqual([A(60), R(45), A(30)]);
    expect(edgeOf(drawn, 1, next)).toBe(h(11, 45));
  });

  it("dragging the last edge changes the booking's end; the first edge moves the later phases", () => {
    const drawn = drawnPhases(perm);
    expect(phasesAfterEdgeDrag(drawn, 2, h(12, 30))).toEqual([A(60), R(30), A(60)]);
    expect(phasesAfterEdgeDrag(drawn, 0, h(10, 45))).toEqual([A(45), R(30), A(30)]);
  });

  it("snaps to 15 minutes", () => {
    const drawn = drawnPhases(perm);
    expect(phasesAfterEdgeDrag(drawn, 1, h(11, 36))).toEqual([A(60), R(30), A(30)]);
    expect(phasesAfterEdgeDrag(drawn, 1, h(11, 38))).toEqual([A(60), R(45), A(30)]); // nearest 15
  });

  it("keeps hands-on at 15 minutes or more; processing can go to 0", () => {
    const drawn = drawnPhases(perm);
    expect(phasesAfterEdgeDrag(drawn, 0, h(9))).toEqual([A(15), R(30), A(30)]);
    expect(phasesAfterEdgeDrag(drawn, 1, h(10))).toEqual([A(60), R(0), A(30)]);
  });

  it("returns null for a phase that is not there", () => {
    expect(phasesAfterEdgeDrag(drawnPhases(perm), 5, h(12))).toBeNull();
  });
});

describe("phase edge drag meets the conflict check", () => {
  const plan = (existing: SlotBlock[], phases: Phase[]) =>
    planPhaseEdit(
      { id: "perm", stylistId: "steve", date: DATE, time: "10:00 AM" },
      phases,
      existing,
      h(18),
      describeConflict as never,
      perm.phases,
    );

  it("lengthening the processing is fine until the return block reaches another client", () => {
    const later = booking("later", "12:15 PM", [A(60)]);
    const drawn = drawnPhases(perm);
    // return would be 11:45-12:15: touches 12:15, fine
    expect(plan([perm, later], phasesAfterEdgeDrag(drawn, 1, h(11, 45))!).ok).toBe(true);
    // processing to 12:00 puts the return on 12:00-12:30, onto the client at 12:15
    const clash = plan([perm, later], phasesAfterEdgeDrag(drawn, 1, h(12))!);
    expect(clash.ok).toBe(false);
    if (!clash.ok && clash.reason === "conflict") {
      expect(clash.message).toContain("Client later");
      expect(clash.suggestion).not.toBeNull();
    }
  });

  it("shortening the processing is refused while another client sits in the gap", () => {
    const gary = booking("gary", "11:00 AM", [A(30)]);
    const drawn = drawnPhases(perm);
    const result = plan([perm, gary], phasesAfterEdgeDrag(drawn, 1, h(11, 15))!);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Client gary");
  });

  it("past closing is refused", () => {
    const drawn = drawnPhases(perm);
    const result = plan([perm], phasesAfterEdgeDrag(drawn, 2, h(19))!);
    expect(result.ok).toBe(false);
  });
});
