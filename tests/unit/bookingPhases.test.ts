// tests/unit/bookingPhases.test.ts
// The phase model (DEC-026): hands-on / processing / return phases, busy-only
// conflicts, the return point, backwards compatibility with active + rest
// bookings, and per-booking customisation. Pure functions; runs without
// Firestore: `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  combinePhases,
  effectivePhases,
  footprintFor,
  phaseTotals,
  phasesFromLegacy,
  resolvePhases,
  returnAtOf,
  segmentsFor,
  validateBookingPhases,
  withPhaseMinutes,
  type Phase,
} from "../../src/lib/bookingPhases";
import { planPhaseEdit, nextFreeReturn } from "../../src/lib/phaseEdit";
import {
  describeConflict,
  findBookingConflict,
  generateSlots,
  isSlotAvailable,
  slotFootprint,
} from "../../src/lib/scheduling";
import type { Booking, SlotBlock, TimeBlock } from "../../src/types";

const h = (hour: number, min = 0) => hour * 60 + min;
const A = (minutes: number): Phase => ({ type: "active", minutes });
const R = (minutes: number): Phase => ({ type: "rest", minutes });

const DATE = "2027-03-10"; // a future Wednesday (no "too soon" rule)
const STYLIST = "steve";

// A booking record with phases (legacy totals kept consistent, as the app does)
const booking = (id: string, time: string, phases: Phase[], over: Partial<Booking> = {}): SlotBlock & Booking => {
  const t = phaseTotals(phases);
  return {
    id,
    stylistId: STYLIST,
    date: DATE,
    time,
    status: "confirmed",
    phases,
    ...t,
    customerName: `Client ${id}`,
    serviceName: "Service",
    bookingType: "customer",
    ...over,
  } as SlotBlock & Booking;
};

const PERM: Phase[] = [A(60), R(30), A(30)]; // Digital perm: hands-on, processing, return

const conflict = (time: string, phases: Phase[], existing: SlotBlock[], excludeId?: string) => {
  const t = phaseTotals(phases);
  return findBookingConflict(
    { stylistId: STYLIST, date: DATE, time, totalTime: t.totalTime, activeTime: t.activeTime, phases, excludeId },
    existing,
  );
};

describe("phases: building and placing", () => {
  it("derives phases from legacy active + rest, and only a hands-on phase when there is no rest", () => {
    expect(phasesFromLegacy(30, 30)).toEqual([A(30), R(30)]);
    expect(phasesFromLegacy(45, 0)).toEqual([A(45)]);
    expect(resolvePhases({ activeTime: 30, restTime: 60 })).toEqual([A(30), R(60)]);
  });

  it("a booking with its own phases uses them, not the legacy numbers", () => {
    expect(resolvePhases({ phases: PERM, activeTime: 1, restTime: 1 })).toEqual(PERM);
  });

  it("an empty phases array falls back to the legacy numbers", () => {
    expect(resolvePhases({ phases: [], activeTime: 30, restTime: 30 })).toEqual([A(30), R(30)]);
  });

  it("when total is longer than active but there is no rest, the whole total stays blocked (as the engine always did)", () => {
    expect(phasesFromLegacy(45, 0, 60)).toEqual([A(60)]);
  });

  it("effective phases drop zero-length phases and merge neighbours of the same type", () => {
    expect(effectivePhases([A(30), R(0), A(30)])).toEqual([A(60)]);
    expect(effectivePhases([A(30), R(30), R(15)])).toEqual([A(30), R(45)]);
  });

  it("totals add up the legacy fields", () => {
    expect(phaseTotals(PERM)).toEqual({ activeTime: 90, restTime: 30, totalTime: 120 });
  });

  it("places phases end to end from the start time", () => {
    expect(segmentsFor(h(10), PERM)).toEqual([
      { type: "active", start: h(10), end: h(11) },
      { type: "rest", start: h(11), end: h(11, 30) },
      { type: "active", start: h(11, 30), end: h(12) },
    ]);
  });

  it("a three-phase booking has two busy blocks and no return point; active + rest has one block and a return point", () => {
    const perm = footprintFor(h(10), PERM);
    expect(perm.busy).toEqual([{ start: h(10), end: h(11) }, { start: h(11, 30), end: h(12) }]);
    expect(perm.returnAt).toBeNull();
    const colour = footprintFor(h(10), [A(30), R(60)]);
    expect(colour.busy).toEqual([{ start: h(10), end: h(10, 30) }]);
    expect(colour.returnAt).toBe(h(11, 30));
    expect(returnAtOf(segmentsFor(h(10), [A(30), R(60)]))).toBe(h(11, 30));
  });
});

describe("combining services in one booking", () => {
  it("services shaped like today's combine exactly as before: all hands-on, then all processing", () => {
    const colour = { activeTime: 30, restTime: 30 };
    const cut = { activeTime: 45, restTime: 0 };
    expect(combinePhases([colour, cut])).toEqual([A(75), R(30)]);
    expect(combinePhases([cut, colour])).toEqual([A(75), R(30)]);
    expect(combinePhases([cut])).toEqual([A(45)]);
  });

  it("a service with a return phase makes the services run end to end, in the order chosen", () => {
    const perm = { phases: PERM, activeTime: 90, restTime: 30 };
    const cut = { activeTime: 45, restTime: 0 };
    expect(combinePhases([perm, cut])).toEqual([A(60), R(30), A(75)]);
    expect(combinePhases([cut, perm])).toEqual([A(105), R(30), A(30)]);
  });
});

describe("conflicts: only hands-on blocks, rest gaps are free", () => {
  const perm = booking("perm", "10:00 AM", PERM); // busy 10:00-11:00 and 11:30-12:00

  it("another client can be booked into the processing gap", () => {
    expect(conflict("11:00 AM", [A(30)], [perm])).toBeNull();
  });

  it("a client whose hands-on time runs into the return block is refused, and the perm is named", () => {
    const c = conflict("11:00 AM", [A(45)], [perm]);
    expect(c?.id).toBe("perm");
    expect(describeConflict(c as Booking)).toMatch(/Client perm.*10:00 AM – 12:00 PM/);
  });

  it("a booking that collides with the return block alone is refused (it fits the gap and the start, not the return)", () => {
    // 11:15-11:45 overlaps the return block 11:30-12:00 only
    expect(conflict("11:15 AM", [A(30)], [perm])?.id).toBe("perm");
  });

  it("a booking that collides with the first hands-on block is refused", () => {
    expect(conflict("10:45 AM", [A(30)], [perm])?.id).toBe("perm");
  });

  it("back-to-back segments are allowed: ending as the perm starts, filling the gap exactly, starting as it ends", () => {
    expect(conflict("9:30 AM", [A(30)], [perm])).toBeNull();
    expect(conflict("11:00 AM", [A(30)], [perm])).toBeNull(); // gap 11:00-11:30 exactly
    expect(conflict("12:00 PM", [A(60)], [perm])).toBeNull();
  });

  it("two three-phase bookings can interleave: each one's hands-on blocks sit in the other's gap", () => {
    const first = booking("p1", "10:00 AM", [A(60), R(60), A(30)]); // busy 10-11, 12-12:30
    expect(conflict("11:00 AM", [A(60)], [first])).toBeNull(); // busy 11-12 fits the gap exactly
    // ...but not if the second one's second block lands on the first's return block
    expect(conflict("11:00 AM", [A(30), R(30), A(30)], [first])?.id).toBe("p1"); // busy 11-11:30 ok, 12-12:30 collides
  });

  it("a three-phase booking is offered only where every busy block is free", () => {
    const other = booking("o", "11:15 AM", [A(30)]); // 11:15-11:45
    // perm at 10:00 would put its return block (11:30-12:00) over the 11:15-11:45 booking
    expect(conflict("10:00 AM", PERM, [other])?.id).toBe("o");
    // perm at 10:15 has busy 10:15-11:15 and 11:45-12:15: both clear of 11:15-11:45
    expect(conflict("10:15 AM", PERM, [other])).toBeNull();
  });

  it("cancelled and no-show bookings, other stylists and other days never block", () => {
    expect(conflict("10:00 AM", [A(30)], [booking("c", "10:00 AM", PERM, { status: "cancelled" })])).toBeNull();
    expect(conflict("10:00 AM", [A(30)], [booking("n", "10:00 AM", PERM, { status: "no_show" })])).toBeNull();
    expect(conflict("10:00 AM", [A(30)], [booking("s", "10:00 AM", PERM, { stylistId: "other" })])).toBeNull();
    expect(conflict("10:00 AM", [A(30)], [booking("d", "10:00 AM", PERM, { date: "2027-03-11" })])).toBeNull();
  });

  it("ignores its own record when a booking is edited", () => {
    expect(conflict("10:00 AM", PERM, [perm], "perm")).toBeNull();
    expect(conflict("10:00 AM", PERM, [perm])?.id).toBe("perm");
  });

  it("the PII-free slotBlocks projection (busy blocks + return point) gives the same answers as the full booking", () => {
    const fp = slotFootprint(perm);
    const projection: SlotBlock = {
      id: "perm", stylistId: STYLIST, date: DATE, time: "10:00 AM", status: "confirmed",
      activeTime: 90, restTime: 30, totalTime: 120, busy: fp.busy, returnAt: fp.returnAt,
    };
    for (const [time, phases] of [["11:00 AM", [A(30)]], ["11:00 AM", [A(45)]], ["11:15 AM", [A(30)]], ["12:00 PM", [A(60)]]] as const) {
      expect(!!conflict(time, [...phases], [projection])).toBe(!!conflict(time, [...phases], [perm]));
    }
  });
});

describe("the return point of a booking that ends in processing", () => {
  const colour = booking("col", "10:00 AM", [A(30), R(60)]); // busy 10:00-10:30, due back 11:30

  it("a client may use the gap, but not straddle the moment the stylist is due back", () => {
    expect(conflict("10:30 AM", [A(60)], [colour])).toBeNull(); // ends 11:30 exactly
    expect(conflict("10:30 AM", [A(75)], [colour])?.id).toBe("col"); // runs over the return
    expect(conflict("11:30 AM", [A(30)], [colour])).toBeNull(); // starts as she returns
  });

  it("the same protection works the other way round: a new colour's return cannot land inside an existing hands-on block", () => {
    const cut = booking("cut", "11:00 AM", [A(60)]); // 11:00-12:00
    // new colour 10:00: hands-on 10-10:30, due back 11:30 - inside the cut
    expect(conflict("10:00 AM", [A(30), R(60)], [cut])?.id).toBe("cut");
    // due back at 12:00 exactly, as the cut ends: fine
    expect(conflict("10:00 AM", [A(30), R(90)], [cut])).toBeNull();
  });
});

describe("services with no phases behave as they always did", () => {
  // The previous rule, kept here only as the reference to compare against
  const legacy = (nStart: number, nActive: number, nTotal: number, e: TimeBlock): boolean => {
    const nEnd = nStart + nTotal;
    if (!(nStart < e.totalEndMinutes && nEnd > e.startMinutes)) return true;
    if (e.isRestPeriod) {
      return nStart >= e.activeEndMinutes && nStart + nActive <= e.totalEndMinutes;
    }
    return false;
  };
  const block = (start: number, a: number, r: number): TimeBlock => ({
    stylistId: "s", date: "d", startMinutes: start, activeEndMinutes: start + a,
    totalEndMinutes: start + a + r, isRestPeriod: r > 0,
  });

  it("never refuses a time the previous rule allowed (15,625 combinations)", () => {
    const sizes = [15, 30, 45, 60, 90];
    const rests = [0, 15, 30, 45, 60];
    let combos = 0;
    let newlyAllowed = 0;
    for (const ea of sizes) for (const er of rests) {
      const e = block(h(10), ea, er);
      for (const na of sizes) for (const nr of rests) {
        for (let ns = h(8); ns <= h(14); ns += 15) {
          combos++;
          const before = legacy(ns, na, na + nr, e);
          const now = isSlotAvailable(ns, na + nr, na, [e]);
          if (before) expect(now, `existing ${ea}+${er}, new ${na}+${nr} at ${ns}`).toBe(true);
          if (!before && now) {
            newlyAllowed++;
            // The one deliberate change (DEC-026): the NEW booking's own processing
            // gap runs over the existing booking, but its hands-on time and its
            // return both miss the existing hands-on time. The previous rule only
            // let a gap be used by bookings placed AFTER the one that owns it.
            const nEnd = ns + na + nr;
            expect(ns + na <= e.startMinutes || ns >= e.activeEndMinutes, "new hands-on must clear the existing hands-on").toBe(true);
            expect(nEnd > e.startMinutes, "the new total window overlapped the existing booking").toBe(true);
          }
        }
      }
    }
    expect(combos).toBe(15625);
    expect(newlyAllowed).toBeGreaterThan(0); // it IS more permissive in that one case
  });

  it("the previously-protected return moment stays protected: hands-on may not run past the end of an existing processing gap", () => {
    const e = block(h(10), 15, 15); // hands-on 10:00-10:15, due back 10:30
    expect(isSlotAvailable(h(10, 15), 30, 30, [e])).toBe(false); // 10:15-10:45 runs over 10:30
    expect(isSlotAvailable(h(10, 15), 15, 15, [e])).toBe(true); // 10:15-10:30 fits
  });

  it("generateSlots with no phases argument offers exactly what a legacy two-phase request offers", () => {
    const existing = [booking("e", "11:00 AM", [A(30), R(30)])];
    const plain = generateSlots(DATE, STYLIST, 75, 45, existing);
    const withPhases = generateSlots(DATE, STYLIST, 75, 45, existing, undefined, undefined, [A(45), R(30)]);
    expect(withPhases).toEqual(plain);
  });
});

describe("the public availability engine offers only starts where every busy block is free", () => {
  const existing = [booking("o", "11:15 AM", [A(30)])]; // busy 11:15-11:45
  const perm = generateSlots(DATE, STYLIST, 120, 90, existing, undefined, undefined, PERM);
  const at = (t: string) => perm.find((s) => s.time === t)?.available;

  it("10:00: the return block (11:30-12:00) would land on the other booking - not offered", () => {
    expect(at("10:00 AM")).toBe(false);
  });
  it("10:15 (busy 10:15-11:15, 11:45-12:15) is offered, and a start inside the other booking is not", () => {
    expect(at("10:15 AM")).toBe(true);
    expect(at("11:00 AM")).toBe(false);
  });
  it("a plain two-phase request of the same total length gets different answers (the gap is not the return)", () => {
    const twoPhase = generateSlots(DATE, STYLIST, 120, 90, existing);
    // 90 min hands-on straight through: 10:00-11:30 hits the 11:15 booking
    expect(twoPhase.find((s) => s.time === "10:00 AM")?.available).toBe(false);
  });
  it("the whole booking must still finish before closing", () => {
    const last = perm.at(-1)?.time;
    expect(last).toBe("4:00 PM"); // 4:00 + 120 min = 6:00 PM
  });
});

describe("customising one booking's phases", () => {
  const target = { id: "mine", stylistId: STYLIST, date: DATE, time: "10:00 AM" };
  const mine = booking("mine", "10:00 AM", PERM);
  const describe_ = (b: Booking) => describeConflict(b);
  const plan = (phases: Phase[], existing: SlotBlock[] = [mine], close: number | null = h(18)) =>
    planPhaseEdit(target, phases, existing, close, describe_ as never);

  it("longer processing pushes the return later and reports the new end time", () => {
    const r = plan(withPhaseMinutes(PERM, 1, 60));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments.map((s) => [s.type, s.start, s.end])).toEqual([
      ["active", h(10), h(11)], ["rest", h(11), h(12)], ["active", h(12), h(12, 30)],
    ]);
    expect(r.endsAt).toBe(h(12, 30));
    expect(r.endsAtLabel).toBe("12:30 PM");
    expect(r.totalTime).toBe(150);
  });

  it("shorter processing pulls the return earlier", () => {
    const r = plan(withPhaseMinutes(PERM, 1, 15));
    expect(r.ok && r.endsAt).toBe(h(11, 45));
  });

  it("longer hands-on pushes the later phases back", () => {
    const r = plan(withPhaseMinutes(PERM, 0, 90));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[2]).toMatchObject({ type: "active", start: h(12), end: h(12, 30) });
  });

  it("processing can be 0 (the two hands-on phases then run together)", () => {
    const r = plan(withPhaseMinutes(PERM, 1, 0));
    expect(r.ok && r.activeTime).toBe(90);
    expect(r.ok && r.restTime).toBe(0);
    expect(r.ok && r.segments.length).toBe(1);
  });

  it("refuses a hands-on phase under 15 minutes, a step that is not 15, and a booking with no hands-on", () => {
    expect(plan(withPhaseMinutes(PERM, 0, 0))).toMatchObject({ ok: false, reason: "invalid" });
    expect(plan(withPhaseMinutes(PERM, 2, 10))).toMatchObject({ ok: false, reason: "invalid" });
    expect(plan(withPhaseMinutes(PERM, 0, 20))).toMatchObject({ ok: false, reason: "invalid" });
    expect(plan([R(30)])).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a booking that would end after closing", () => {
    const r = plan(withPhaseMinutes(PERM, 1, 600 - 30), [mine], h(13)); // far too long
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(validateBookingPhases(PERM, h(17), h(18))).toMatch(/closing/);
    expect(validateBookingPhases(PERM, h(16), h(18))).toBeNull(); // ends exactly at 6:00 PM
  });

  it("refuses to shorten processing while another client is booked in the gap, and names them", () => {
    // another client is in the gap 11:00-11:30; shortening processing to 15 min
    // pulls the return block (11:15-11:45) onto them
    const inGap = booking("gap", "11:00 AM", [A(30)]);
    const r = plan(withPhaseMinutes(PERM, 1, 15), [mine, inGap]);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "conflict") throw new Error("expected a conflict");
    expect(r.conflict.id).toBe("gap");
    expect(r.message).toMatch(/Client gap/);
    // the smallest fix: put the processing back so the return clears them
    expect(r.suggestion?.[1]).toEqual(R(30));
  });

  it("refuses to lengthen processing onto another booking, and offers the next free return time", () => {
    const later = booking("later", "12:00 PM", [A(60)]); // busy 12:00-13:00
    // processing 60 -> return block 12:00-12:30 collides with 'later'
    const r = plan(withPhaseMinutes(PERM, 1, 60), [mine, later]);
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== "conflict") throw new Error("expected a conflict");
    expect(r.conflict.id).toBe("later");
    // next free: 10:00 + 60 hands-on + 120 processing -> return block 13:00-13:30
    expect(r.suggestion).toEqual([A(60), R(120), A(30)]);
    const t = phaseTotals(r.suggestion as Phase[]);
    expect(findBookingConflict({ ...target, totalTime: t.totalTime, activeTime: t.activeTime, phases: r.suggestion as Phase[], excludeId: "mine" }, [mine, later])).toBeNull();
  });

  it("offers no suggestion when nothing before closing fits", () => {
    const wall = booking("wall", "11:30 AM", [A(480)]);
    expect(nextFreeReturn(target, withPhaseMinutes(PERM, 1, 60), [mine, wall], h(18))).toBeNull();
  });

  it("an edit uses the booking's own phases: the service defaults are untouched", () => {
    const serviceDefaults: Phase[] = [A(60), R(30), A(30)];
    const frozen = JSON.stringify(serviceDefaults);
    const edited = withPhaseMinutes(serviceDefaults, 1, 90);
    expect(plan(edited).ok).toBe(true);
    expect(JSON.stringify(serviceDefaults)).toBe(frozen); // the edit made a copy
    expect(edited).not.toBe(serviceDefaults);
    expect(withPhaseMinutes(serviceDefaults, 0, 15)[1]).not.toBe(serviceDefaults[1]);
  });

  it("an edit never conflicts with the booking's own old record", () => {
    expect(plan(withPhaseMinutes(PERM, 1, 45), [mine]).ok).toBe(true);
  });

  it("a legacy booking (no phases) can be edited too: it is edited as hands-on + processing", () => {
    const legacyBooking = booking("mine", "10:00 AM", [A(30), R(60)]);
    delete (legacyBooking as { phases?: Phase[] }).phases;
    const phases = resolvePhases(legacyBooking);
    expect(phases).toEqual([A(30), R(60)]);
    const r = plan(withPhaseMinutes(phases, 1, 75), [legacyBooking]);
    expect(r.ok && r.endsAt).toBe(h(11, 45));
  });
});

describe("older bookings whose lengths are not multiples of 15", () => {
  it("a phase left as it is is not re-judged, so one other phase can still be edited", () => {
    const beardAndSet: Phase[] = [A(20), R(30)]; // 20-minute hands-on from an older service
    expect(validateBookingPhases([A(20), R(45)], h(10), h(18), beardAndSet)).toBeNull();
    expect(validateBookingPhases([A(20), R(45)], h(10), h(18))).toMatch(/15-minute steps/);
    // ...but a phase that IS changed must follow the 15-minute step
    expect(validateBookingPhases([A(25), R(30)], h(10), h(18), beardAndSet)).toMatch(/15-minute steps/);
  });
});
