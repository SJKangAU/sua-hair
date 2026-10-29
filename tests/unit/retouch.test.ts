// tests/unit/retouch.test.ts
// When a client is due back for a retouch (src/lib/retouch.ts): the services of the last
// visit, the shortest retouch period, overdue / soon / later, and who is not prompted.
// Fake data only. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import { retouchDue, retouchRelative, retouchWeeksFor } from "../../src/lib/retouch";

const services = [
  { id: "colour", retouchWeeks: 6 },
  { id: "balayage", retouchWeeks: 12 },
  { id: "cut" },
];
const TODAY = "2026-10-20";
const client = (over: Record<string, unknown> = {}) => ({ lastVisit: "2026-09-15", lastServiceIds: ["colour"], hasUpcoming: false, ...over });

describe("retouchWeeksFor", () => {
  it("uses the shortest period among the services they had", () => {
    expect(retouchWeeksFor(["balayage", "colour"], services)).toBe(6);
    expect(retouchWeeksFor(["colour"], services)).toBe(6);
  });
  it("is null when none of the services has one", () => {
    expect(retouchWeeksFor(["cut"], services)).toBeNull();
    expect(retouchWeeksFor([], services)).toBeNull();
    expect(retouchWeeksFor(["unknown"], services)).toBeNull();
  });
});

describe("retouchDue", () => {
  it("is the last visit plus the retouch period", () => {
    // 15 Sep + 6 weeks = 27 Oct: seven days from 20 Oct
    expect(retouchDue(client(), services, TODAY)).toEqual({ dueDate: "2026-10-27", weeks: 6, days: 7, state: "soon" });
  });

  it("is overdue once the date has passed, soon within two weeks, later beyond", () => {
    expect(retouchDue(client({ lastVisit: "2026-08-01" }), services, TODAY)).toMatchObject({ state: "overdue", days: -38 });
    expect(retouchDue(client({ lastVisit: "2026-09-08" }), services, TODAY)).toMatchObject({ state: "soon", days: 0 });
    expect(retouchDue(client({ lastVisit: "2026-10-10" }), services, TODAY)).toMatchObject({ state: "later" });
  });

  it("does not prompt a client who already has a booking, has no visit, or had nothing with a period", () => {
    expect(retouchDue(client({ hasUpcoming: true }), services, TODAY)).toBeNull();
    expect(retouchDue(client({ lastVisit: "" }), services, TODAY)).toBeNull();
    expect(retouchDue(client({ lastServiceIds: ["cut"] }), services, TODAY)).toBeNull();
    // a client record from before this existed has no services of the last visit yet
    expect(retouchDue({ lastVisit: "2026-09-15", hasUpcoming: false }, services, TODAY)).toBeNull();
  });
});

describe("retouchRelative", () => {
  const due = (days: number) => ({ dueDate: "x", weeks: 6, days, state: "soon" as const });
  it("reads in days up to two weeks, then weeks", () => {
    expect(retouchRelative(due(0))).toBe("today");
    expect(retouchRelative(due(1))).toBe("in 1 day");
    expect(retouchRelative(due(9))).toBe("in 9 days");
    expect(retouchRelative(due(21))).toBe("in 3 weeks");
    expect(retouchRelative(due(-3))).toBe("overdue by 3 days");
    expect(retouchRelative(due(-35))).toBe("overdue by 5 weeks");
  });
});
