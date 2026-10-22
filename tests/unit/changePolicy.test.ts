// tests/unit/changePolicy.test.ts
// The cancellation and change policy (FR-028, DEC-054): defaults, bad stored values, and
// what a customer may do with a booking right now. Times are the salon's (Melbourne).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANGE_POLICY,
  MAX_CUTOFF_HOURS,
  MAX_MESSAGE_LENGTH,
  changeRights,
  effectivePolicy,
  policyProblems,
} from "../../src/lib/changePolicy";
import { businessInstant } from "../../src/lib/businessTime";

const HOUR = 3_600_000;
// Thursday 3 Dec 2026, 10:00 AM in Melbourne
const START = businessInstant("2026-12-03", 10 * 60) as number;
const confirmed = { bookingType: "customer", status: "confirmed", date: "2026-12-03", time: "10:00 AM" };

describe("effectivePolicy", () => {
  it("nothing stored -> the defaults: cancel and move allowed, 24 hours, a move is a request", () => {
    for (const raw of [undefined, null, "x", 5, {}]) expect(effectivePolicy(raw)).toEqual(DEFAULT_CHANGE_POLICY);
    expect(DEFAULT_CHANGE_POLICY).toMatchObject({ allowCancel: true, allowReschedule: true, cutoffHours: 24, rescheduleMode: "request" });
  });

  it("keeps what the owner set", () => {
    expect(
      effectivePolicy({ allowCancel: false, allowReschedule: true, cutoffHours: 48, rescheduleMode: "instant", pastCutoffMessage: "Call us." }),
    ).toEqual({ allowCancel: false, allowReschedule: true, cutoffHours: 48, rescheduleMode: "instant", pastCutoffMessage: "Call us." });
  });

  it("a bad field falls back to its default, never to something unsafe", () => {
    const p = effectivePolicy({ allowCancel: "no", cutoffHours: 1.5, rescheduleMode: "whenever", pastCutoffMessage: 7 });
    expect(p).toEqual(DEFAULT_CHANGE_POLICY);
    expect(effectivePolicy({ cutoffHours: -1 }).cutoffHours).toBe(24);
    expect(effectivePolicy({ cutoffHours: MAX_CUTOFF_HOURS + 1 }).cutoffHours).toBe(24);
    expect(effectivePolicy({ pastCutoffMessage: "  " }).pastCutoffMessage).toBe(DEFAULT_CHANGE_POLICY.pastCutoffMessage);
    expect(effectivePolicy({ cutoffHours: 0 }).cutoffHours).toBe(0);
  });
});

describe("policyProblems", () => {
  it("names each thing wrong, in words for the owner", () => {
    expect(policyProblems(DEFAULT_CHANGE_POLICY)).toEqual([]);
    expect(policyProblems({ ...DEFAULT_CHANGE_POLICY, cutoffHours: 1.5 })[0]).toMatch(/whole number/);
    expect(policyProblems({ ...DEFAULT_CHANGE_POLICY, cutoffHours: -2 })[0]).toMatch(/whole number/);
    expect(policyProblems({ ...DEFAULT_CHANGE_POLICY, cutoffHours: MAX_CUTOFF_HOURS + 1 })[0]).toMatch(/whole number/);
    expect(policyProblems({ ...DEFAULT_CHANGE_POLICY, pastCutoffMessage: "" })[0]).toMatch(/Write what/);
    expect(policyProblems({ ...DEFAULT_CHANGE_POLICY, pastCutoffMessage: "x".repeat(MAX_MESSAGE_LENGTH + 1) })[0]).toMatch(/or fewer/);
  });
});

describe("changeRights: a confirmed booking", () => {
  it("both open before the cutoff, closing exactly at start minus the cutoff", () => {
    const r = changeRights(DEFAULT_CHANGE_POLICY, confirmed, START - 30 * HOUR);
    expect(r).toEqual({ canCancel: true, canChange: true, reason: null, closesAt: START - 24 * HOUR });
    expect(changeRights(DEFAULT_CHANGE_POLICY, confirmed, START - 24 * HOUR).canCancel).toBe(true); // on the line
    const late = changeRights(DEFAULT_CHANGE_POLICY, confirmed, START - 24 * HOUR + 1);
    expect(late).toMatchObject({ canCancel: false, canChange: false, reason: DEFAULT_CHANGE_POLICY.pastCutoffMessage });
  });

  it("uses the owner's cutoff and message", () => {
    const p = { ...DEFAULT_CHANGE_POLICY, cutoffHours: 2, pastCutoffMessage: "Please ring us." };
    expect(changeRights(p, confirmed, START - 3 * HOUR).canCancel).toBe(true);
    expect(changeRights(p, confirmed, START - HOUR)).toMatchObject({ canCancel: false, reason: "Please ring us." });
    const zero = { ...DEFAULT_CHANGE_POLICY, cutoffHours: 0 };
    expect(changeRights(zero, confirmed, START - 1).canCancel).toBe(true);
    expect(changeRights(zero, confirmed, START + 1).canCancel).toBe(false);
  });

  it("cancel and move can each be switched off, with a reason that says which", () => {
    const now = START - 48 * HOUR;
    const noCancel = changeRights({ ...DEFAULT_CHANGE_POLICY, allowCancel: false }, confirmed, now);
    expect(noCancel).toMatchObject({ canCancel: false, canChange: true });
    expect(noCancel.reason).toMatch(/To cancel/);
    const noMove = changeRights({ ...DEFAULT_CHANGE_POLICY, allowReschedule: false }, confirmed, now);
    expect(noMove).toMatchObject({ canCancel: true, canChange: false });
    expect(noMove.reason).toMatch(/To move/);
    const neither = changeRights({ ...DEFAULT_CHANGE_POLICY, allowCancel: false, allowReschedule: false }, confirmed, now);
    expect(neither).toMatchObject({ canCancel: false, canChange: false });
    expect(neither.reason).toMatch(/aren't made online/);
  });

  it("works on the salon's clock, whatever zone the code runs in", () => {
    // 7:00 PM Melbourne on 3 Dec is 08:00 UTC; the cutoff is the same instant everywhere
    const evening = { ...confirmed, time: "7:00 PM" };
    const start = businessInstant("2026-12-03", 19 * 60) as number;
    expect(changeRights(DEFAULT_CHANGE_POLICY, evening, start - 24 * HOUR).canCancel).toBe(true);
    expect(changeRights(DEFAULT_CHANGE_POLICY, evening, start - 24 * HOUR + 1).canCancel).toBe(false);
  });
});

describe("changeRights: everything else", () => {
  const now = START - 100 * HOUR;
  const switchedOff = { ...DEFAULT_CHANGE_POLICY, allowCancel: false, allowReschedule: false };

  it("a pending request can always be cancelled, never 'moved', whatever the policy", () => {
    for (const p of [DEFAULT_CHANGE_POLICY, switchedOff]) {
      const r = changeRights(p, { ...confirmed, status: "pending" }, now);
      expect(r).toMatchObject({ canCancel: true, canChange: false, closesAt: null });
      expect(r.reason).toMatch(/waiting for the salon/);
    }
    expect(changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, status: "pending" }, START + 10 * HOUR).canCancel).toBe(true);
  });

  it("a request to move another booking says the original stays until approval", () => {
    const r = changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, status: "pending", replacesBookingId: "old" }, now);
    expect(r.canCancel).toBe(true);
    expect(r.reason).toMatch(/original time stays/);
  });

  it("nothing once it is arrived, in service, completed, cancelled or a no-show", () => {
    for (const status of ["arrived", "in_service", "completed", "cancelled", "no_show"]) {
      expect(changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, status }, now)).toMatchObject({ canCancel: false, canChange: false });
    }
  });

  it("nothing for a break or a training session, or a booking with no usable time", () => {
    for (const bookingType of ["break", "training", undefined]) {
      expect(changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, bookingType }, now).canCancel).toBe(false);
    }
    expect(changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, date: "soon" }, now).canCancel).toBe(false);
  });

  it("a walk-in the owner entered can be managed like a customer's booking", () => {
    expect(changeRights(DEFAULT_CHANGE_POLICY, { ...confirmed, bookingType: "walkin" }, now).canCancel).toBe(true);
  });
});
