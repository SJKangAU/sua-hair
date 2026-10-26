// trainingSlots.test.ts
// After-hours training starts follow the hours saved in Manage, including date overrides.

import { describe, expect, it } from "vitest";
import { trainingSlots } from "../../src/lib/trainingSlots";
import type { DayOfWeek, SalonSettings } from "../../src/types";

const KEYS: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const settings = (over: Partial<SalonSettings> = {}, open = 10, close = 18): SalonSettings => ({
  weeklySchedule: Object.fromEntries(KEYS.map((k) => [k, { isOpen: k !== "mon", open, close }])) as SalonSettings["weeklySchedule"],
  dateOverrides: {},
  ...over,
});
// 2026-11-04 is a Wednesday, 2026-11-02 a Monday
const WED = "2026-11-04";
const MON = "2026-11-02";

describe("trainingSlots", () => {
  it("offers times that finish by opening, or start at or after closing", () => {
    const s = trainingSlots(WED, settings(), 60);
    expect(s[0]).toBe("7:00 AM");
    expect(s).toContain("9:00 AM"); // 9-10 finishes at opening
    expect(s).not.toContain("9:30 AM"); // would run into trading hours
    expect(s).not.toContain("5:30 PM");
    expect(s).toContain("6:00 PM"); // starts at closing
    expect(s[s.length - 1]).toBe("9:00 PM");
  });
  it("a longer session must start earlier", () => {
    const s = trainingSlots(WED, settings(), 180);
    expect(s).toContain("7:00 AM");
    expect(s).not.toContain("8:00 AM");
  });
  it("follows the saved hours, not the defaults", () => {
    const s = trainingSlots(WED, settings({}, 9, 17), 60);
    expect(s).toContain("8:00 AM");
    expect(s).not.toContain("8:30 AM");
    expect(s).toContain("5:00 PM");
    expect(s).not.toContain("4:30 PM");
  });
  it("follows a date override with different hours", () => {
    const s = trainingSlots(WED, settings({ dateOverrides: { [WED]: { open: 12, close: 15 } } }), 60);
    expect(s).toContain("11:00 AM");
    expect(s).toContain("3:00 PM");
    expect(s).not.toContain("1:00 PM");
  });
  it("offers the whole range on a closed day", () => {
    expect(trainingSlots(MON, settings(), 60)).toContain("1:00 PM");
    expect(trainingSlots(WED, settings({ dateOverrides: { [WED]: { closed: true } } }), 60)).toContain("1:00 PM");
  });
});
