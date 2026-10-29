// tests/unit/processingWindow.test.ts
// The stretches where a stylist is free during a booking's processing time, and the
// wording used for them in the admin and the customer's booking flow
// (src/lib/processingWindow.ts). Fake data only. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  bookingFreeWindows,
  customerHint,
  customerWindowSentence,
  freeWindowLabel,
  freeWindowSentence,
  freeWindows,
} from "../../src/lib/processingWindow";

const A = (minutes: number) => ({ type: "active" as const, minutes });
const R = (minutes: number) => ({ type: "rest" as const, minutes });

describe("freeWindows", () => {
  it("a hands-on then processing booking is free for the processing stretch", () => {
    expect(freeWindows("10:00 AM", [A(30), R(30)])).toEqual([
      { start: 630, end: 660, from: "10:30 AM", to: "11:00 AM", minutes: 30 },
    ]);
  });

  it("a booking with a return phase is free only in the middle", () => {
    const w = freeWindows("10:00 AM", [A(60), R(30), A(30)]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ from: "11:00 AM", to: "11:30 AM", minutes: 30 });
  });

  it("more than one processing stretch gives more than one window", () => {
    const w = freeWindows("9:00 AM", [A(30), R(15), A(15), R(30)]);
    expect(w.map((x) => [x.from, x.to])).toEqual([
      ["9:30 AM", "9:45 AM"],
      ["10:00 AM", "10:30 AM"],
    ]);
  });

  it("no processing time, a zero-minute rest or an unreadable time gives nothing", () => {
    expect(freeWindows("10:00 AM", [A(45)])).toEqual([]);
    expect(freeWindows("10:00 AM", [A(45), R(0)])).toEqual([]);
    expect(freeWindows("whenever", [A(30), R(30)])).toEqual([]);
  });

  it("works from a booking's own phases, or from its active and rest time", () => {
    expect(bookingFreeWindows({ time: "2:00 PM", activeTime: 45, restTime: 30 })[0]).toMatchObject({ from: "2:45 PM", to: "3:15 PM" });
    expect(
      bookingFreeWindows({ time: "2:00 PM", activeTime: 90, restTime: 60, phases: [A(30), R(60), A(60)] })[0],
    ).toMatchObject({ from: "2:30 PM", to: "3:30 PM", minutes: 60 });
    expect(bookingFreeWindows({ time: "2:00 PM", activeTime: 45, restTime: 0 })).toEqual([]);
  });
});

describe("the wording", () => {
  const w = freeWindows("10:00 AM", [A(30), R(30)])[0];

  it("says the stylist is free, with the times", () => {
    expect(freeWindowLabel(w)).toBe("Stylist free 10:30 AM – 11:00 AM (30 min)");
    expect(freeWindowSentence(w)).toContain("free to take another client");
    expect(freeWindowSentence(w)).toContain("10:30 AM – 11:00 AM");
  });

  it("tells the customer what the setting time means, with and without a time", () => {
    expect(customerHint(30)).toContain("30 min of setting time");
    expect(customerHint(30)).toContain("another client");
    expect(customerWindowSentence(w)).toContain("10:30 AM – 11:00 AM");
    expect(customerWindowSentence(w)).toContain("back with you at 11:00 AM");
  });
});
