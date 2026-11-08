// tests/unit/notificationPopups.test.ts
// The big notification popups (batch 1, item 6): booking requests stay until
// acknowledged, anything else pops up once and can be dismissed; and the colours
// used are readable.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isBookingRequest, popupsToShow } from "../../src/lib/notificationPopups";
import type { Notification } from "../../src/types";
import { contrast } from "./contrast";

const note = (id: string, message: string, over: Partial<Notification> = {}): Notification => ({
  id,
  recipientId: "owner",
  recipientType: "owner",
  bookingId: "b",
  message,
  read: false,
  createdAt: `2027-03-02T10:00:0${id}.000Z`,
  ...over,
});

describe("what counts as a booking request", () => {
  // These are the exact starts the functions write (functions/src/bookingCommands.ts)
  it.each([
    "New booking request: Jo - Mens Cut on 2027-03-02 at 10:00 AM",
    "New booking request, call needed first: Jo - Colour",
    "You have a new booking request: Jo - Mens Cut",
    "You have a new booking request (the salon will ring the client first): Jo",
    "Request to move a booking: Jo - Mens Cut (moving from 2027-03-01 at 9:00 AM)",
    "A client wants to move a booking: Jo",
  ])("%s", (message) => expect(isBookingRequest({ message })).toBe(true));

  it.each([
    "New booking: Jo - Mens Cut on 2027-03-02", // confirmed on the spot
    "You have a new booking: Jo",
    "New waitlist request: Jo for 2027-03-02",
    "Alex is back from processing in 5 minutes",
  ])("%s is not", (message) => expect(isBookingRequest({ message })).toBe(false));

  it("the wording is still written by the functions", () => {
    const src = readFileSync("functions/src/bookingCommands.ts", "utf8");
    for (const start of [
      "New booking request",
      "You have a new booking request",
      "Request to move a booking",
      "A client wants to move a booking",
    ]) {
      expect(src).toContain(start);
    }
  });
});

describe("popupsToShow", () => {
  const none = new Set<string>();
  it("keeps a request that was already waiting, unread, when the page opened", () => {
    const list = [note("1", "New booking request: Jo")];
    expect(popupsToShow({ notifications: list, seenAtLoad: new Set(["1"]), dismissed: none })).toHaveLength(1);
  });
  it("a request stays until it is read", () => {
    const list = [note("1", "New booking request: Jo")];
    expect(popupsToShow({ notifications: list, seenAtLoad: none, dismissed: none })).toHaveLength(1);
    const read = [note("1", "New booking request: Jo", { read: true })];
    expect(popupsToShow({ notifications: read, seenAtLoad: none, dismissed: none })).toHaveLength(0);
  });
  it("another kind pops up only when it arrives after the page opened", () => {
    const list = [note("1", "New booking: Jo"), note("2", "New booking: Sam")];
    const shown = popupsToShow({ notifications: list, seenAtLoad: new Set(["1"]), dismissed: none });
    expect(shown.map((n) => n.id)).toEqual(["2"]);
  });
  it("a dismissed popup does not come back on this page", () => {
    const list = [note("2", "New booking: Sam")];
    expect(popupsToShow({ notifications: list, seenAtLoad: none, dismissed: new Set(["2"]) })).toHaveLength(0);
  });
  it("shows the newest first", () => {
    const list = [
      note("1", "New booking request: A"),
      note("3", "New booking request: C"),
      note("2", "New booking request: B"),
    ];
    expect(popupsToShow({ notifications: list, seenAtLoad: none, dismissed: none }).map((n) => n.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });
});

describe("notification colours (from src/index.css)", () => {
  const css = readFileSync("src/index.css", "utf8");
  const tokens = (block: string): Record<string, string> =>
    Object.fromEntries(
      [...block.matchAll(/--notice-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
    );
  const darkStart = css.indexOf(':root[data-theme="dark"]');
  const light = tokens(css.slice(0, darkStart));
  const dark = tokens(css.slice(darkStart));

  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${name}: text, accent and button label are all readable`, () => {
      expect(Object.keys(t).sort()).toEqual(["accent", "accent-ink", "bg", "ink"]);
      expect(contrast(t.ink, t.bg)).toBeGreaterThanOrEqual(7); // readable from across the room
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["accent-ink"], t.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
