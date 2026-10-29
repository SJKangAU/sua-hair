// tests/unit/processingWindow.test.ts
// The stretches where a stylist is free during a booking's processing time, and the
// wording used for them in the admin and the customer's booking flow
// (src/lib/processingWindow.ts). Fake data only. `npm run test:unit`.
import { describe, expect, it } from "vitest";
import {
  bookingFreeWindows,
  durationSentence,
  formatDuration,
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

  it("tells the customer only how long it takes, never what the stylist does meanwhile", () => {
    expect(durationSentence("10:00 AM", [A(30), R(30)])).toBe(
      "Allow 1 hr in all, including 30 min of setting time. You'll be finished around 11:00 AM.",
    );
    expect(durationSentence("10:00 AM", [A(60), R(30), A(30)])).toBe(
      "Allow 2 hr in all, including 30 min of setting time. You'll be finished around 12:00 PM.",
    );
    expect(durationSentence("2:15 PM", [A(45)])).toBe("Allow 45 min in all. You'll be finished around 3:00 PM.");
    for (const text of [durationSentence("10:00 AM", [A(30), R(30)]), durationSentence("9:00 AM", [A(30), R(45), A(15)])]) {
      expect(text).not.toMatch(/stylist|another|client|free|back with you/i);
    }
    expect(durationSentence("whenever", [A(30), R(30)])).toBe("");
    expect(durationSentence("10:00 AM", [])).toBe("");
  });

  it("formatDuration reads in hours and minutes", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
    expect(formatDuration(0)).toBe("0 min");
  });
});
