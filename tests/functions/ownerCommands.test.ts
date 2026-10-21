// tests/functions/ownerCommands.test.ts
// The owner's booking commands (approve, decline, cancel, restore, assign a stylist),
// the 24-hour release of unapproved requests, the waitlist command, and the
// owner's browser writes racing the functions on the same stylist-day lock.
// Emulator-backed: `npm run test:functions`. DEC-035 to DEC-040.
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { Firestore as WebFirestore } from "firebase/firestore";
import {
  approveBookingCore,
  assignStylistCore,
  cancelBookingCore,
  createBookingRequestCore,
  declineBookingCore,
  joinWaitlistCore,
  releaseExpiredPendingCore,
  restoreBookingCore,
  type OwnerContext,
} from "../../functions/src/bookingCommands";
import { CommandError } from "../../functions/src/commandErrors";
import { LIMITS } from "../../functions/src/limits";
import { createAdminBooking } from "../../src/lib/adminBookingWrites";
import { BookingConflictError } from "../../src/lib/bookingConflicts";
import { adminDb, FUNCTIONS_TEST_PROJECT, resetEmulators } from "./adminEnv";
import { THURSDAY, FRIDAY, NOW, request, seedBooking, seedSalon } from "./fixtures";

const db = adminDb();
const owner: OwnerContext = { now: NOW, actorUid: "owner-uid" };

const book = (body: unknown) => createBookingRequestCore(db, body, { now: NOW });
const bookingOf = async (id: string) => (await db.doc(`bookings/${id}`).get()).data()!;
const slotOf = async (id: string) => (await db.doc(`slotBlocks/${id}`).get()).data()!;
const count = async (collection: string) => (await db.collection(collection).get()).size;
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return (err as CommandError).code;
  }
  throw new Error("expected a refusal");
};
const lockVersion = async (stylistId: string, date = THURSDAY) =>
  (await db.doc(`stylistDayLocks/${date}_${stylistId}`).get()).get("version") as number | undefined;

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
});

describe("approveBooking", () => {
  it("confirms a pending request, updates the projection, drops the hold and bumps the lock", async () => {
    const r = await book(request({ stylistId: "steve" }));
    const v0 = await lockVersion("steve");
    const out = await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(out).toEqual({ bookingId: r.bookingId, status: "confirmed" });

    const b = await bookingOf(r.bookingId);
    expect(b.status).toBe("confirmed");
    expect(b.holdExpiresAt).toBeUndefined();
    expect(b.confirmedAt).toBe(new Date(NOW).toISOString());
    expect(b.history.at(-1)).toMatchObject({ type: "status", status: "confirmed", label: "Confirmed" });
    expect((await slotOf(r.bookingId)).status).toBe("confirmed");
    expect(await lockVersion("steve")).toBe((v0 ?? 0) + 1);
  });

  it("refuses with a clear message when the slot no longer fits, and changes nothing", async () => {
    const r = await book(request({ stylistId: "steve", time: "10:00 AM" }));
    // something else got into that slot after the request (a legacy record, a hand edit)
    await seedBooking(db, "intruder", { stylistId: "steve", time: "10:30 AM", customerName: "Pat Intruder" });
    let message = "";
    try {
      await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    } catch (err) {
      message = (err as Error).message;
      expect((err as CommandError).code).toBe("slot-taken");
    }
    expect(message).toMatch(/can no longer be approved/);
    expect(message).toMatch(/Steve Hwang is already booked/);
    expect((await bookingOf(r.bookingId)).status).toBe("pending");
    expect((await slotOf(r.bookingId)).status).toBe("pending");
  });

  it("does not clash with itself", async () => {
    const r = await book(request({ stylistId: "yuto", serviceIds: ["perm"] }));
    expect((await approveBookingCore(db, { bookingId: r.bookingId }, owner)).status).toBe("confirmed");
  });

  it("only a pending request can be approved", async () => {
    const r = await book(request());
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await codeOf(approveBookingCore(db, { bookingId: r.bookingId }, owner))).toBe("precondition");
    expect(await codeOf(approveBookingCore(db, { bookingId: "nope" }, owner))).toBe("not-found");
    expect(await codeOf(approveBookingCore(db, { bookingId: "../x" }, owner))).toBe("invalid");
    expect(await codeOf(approveBookingCore(db, {}, owner))).toBe("invalid");
  });

  it("a legacy 'any' booking must be given a stylist before it can be approved", async () => {
    await seedBooking(db, "legacy", { stylistId: "any", stylistName: "Any available stylist", status: "pending", bookingType: "customer" });
    expect(await codeOf(approveBookingCore(db, { bookingId: "legacy" }, owner))).toBe("needs-stylist");
    expect((await bookingOf("legacy")).status).toBe("pending");
  });

  it("two simultaneous approvals of one request: one confirms, the other is refused", async () => {
    const r = await book(request());
    const results = await Promise.allSettled([
      approveBookingCore(db, { bookingId: r.bookingId }, owner),
      approveBookingCore(db, { bookingId: r.bookingId }, owner),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await bookingOf(r.bookingId)).history.filter((h: { label: string }) => h.label === "Confirmed")).toHaveLength(1);
  });
});

describe("declineBooking", () => {
  it("cancels a pending request, frees the slot at once, and records why", async () => {
    const r = await book(request({ stylistId: "steve" }));
    await declineBookingCore(db, { bookingId: r.bookingId }, owner);
    const b = await bookingOf(r.bookingId);
    expect(b).toMatchObject({ status: "cancelled", cancelReason: "declined", restoreStatus: "pending" });
    expect(b.holdExpiresAt).toBeUndefined();
    expect((await slotOf(r.bookingId)).status).toBe("cancelled");
    // the slot is bookable again
    expect((await book(request({ stylistId: "steve" }))).stylistId).toBe("steve");
  });

  it("refuses anything that is not pending", async () => {
    const r = await book(request());
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await codeOf(declineBookingCore(db, { bookingId: r.bookingId }, owner))).toBe("precondition");
  });
});

describe("cancelBooking and restoreBooking", () => {
  it("cancel releases a confirmed booking; restore brings it back to confirmed", async () => {
    const r = await book(request({ stylistId: "steve" }));
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    await cancelBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await bookingOf(r.bookingId)).toMatchObject({ status: "cancelled", restoreStatus: "confirmed", cancelReason: "cancelled" });
    expect((await slotOf(r.bookingId)).status).toBe("cancelled");

    const out = await restoreBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(out.status).toBe("confirmed");
    const b = await bookingOf(r.bookingId);
    expect(b.status).toBe("confirmed");
    expect(b.restoreStatus).toBeUndefined();
    expect(b.cancelReason).toBeUndefined();
    expect(b.history.at(-1).label).toBe("Restored to confirmed");
    expect((await slotOf(r.bookingId)).status).toBe("confirmed");
  });

  it("restore re-checks the slot: refused (and unchanged) if someone took it meanwhile", async () => {
    const r = await book(request({ stylistId: "steve", time: "10:00 AM" }));
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    await cancelBookingCore(db, { bookingId: r.bookingId }, owner);
    const taken = await book(request({ stylistId: "steve", time: "10:00 AM" })); // another customer
    expect(taken.stylistId).toBe("steve");
    const code = await codeOf(restoreBookingCore(db, { bookingId: r.bookingId }, owner));
    expect(code).toBe("slot-taken");
    expect((await bookingOf(r.bookingId)).status).toBe("cancelled");
    expect((await slotOf(r.bookingId)).status).toBe("cancelled");
  });

  it("a restored pending request gets a fresh 24-hour hold", async () => {
    const r = await book(request());
    await cancelBookingCore(db, { bookingId: r.bookingId }, owner);
    const later = { ...owner, now: NOW + 5 * 3_600_000 };
    const out = await restoreBookingCore(db, { bookingId: r.bookingId }, later);
    expect(out.status).toBe("pending");
    expect((await bookingOf(r.bookingId)).holdExpiresAt).toBe(new Date(later.now + 24 * 3_600_000).toISOString());
  });

  it("restore can be asked for a specific status, and only restores released bookings", async () => {
    const r = await book(request());
    expect(await codeOf(restoreBookingCore(db, { bookingId: r.bookingId }, owner))).toBe("precondition");
    await cancelBookingCore(db, { bookingId: r.bookingId }, owner);
    const out = await restoreBookingCore(db, { bookingId: r.bookingId, status: "confirmed" }, owner);
    expect(out.status).toBe("confirmed");
  });

  it("cancel refuses a booking that is already released", async () => {
    const r = await book(request());
    await cancelBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await codeOf(cancelBookingCore(db, { bookingId: r.bookingId }, owner))).toBe("precondition");
  });
});

describe("assigning a stylist to a legacy 'any' booking (DEC-040)", () => {
  const legacy = (overrides: Record<string, unknown> = {}) =>
    seedBooking(db, "legacy", {
      stylistId: "any",
      stylistName: "Any available stylist",
      stylistLevel: "junior",
      status: "pending",
      bookingType: "customer",
      customerName: "Old Booking",
      customerPhone: "0400000001",
      serviceId: "mens-cut",
      serviceName: "Men's Cut + Beard Trim",
      servicePrice: 75, // the lowest tier estimate (55 + 20)
      services: [
        { id: "mens-cut", name: "Men's Cut", price: 55, activeTime: 45, restTime: 0, totalTime: 45 },
        { id: "beard-trim", name: "Beard Trim", price: 20, activeTime: 15, restTime: 0, totalTime: 15 },
      ],
      activeTime: 60,
      totalTime: 60,
      phases: [{ type: "active", minutes: 60 }],
      time: "10:00 AM",
      ...overrides,
    });

  it("assigns the chosen stylist, recalculates the price from the tier and the current service records, and moves the projection", async () => {
    await legacy();
    const out = await assignStylistCore(db, { bookingId: "legacy", stylistId: "steve" }, owner);
    expect(out).toMatchObject({ price: 75 + 30, stylistName: "Steve Hwang", status: "pending" });
    const b = await bookingOf("legacy");
    expect(b).toMatchObject({ stylistId: "steve", stylistName: "Steve Hwang", stylistLevel: "director", servicePrice: 105 });
    expect(b.services.map((s: { price: number }) => s.price)).toEqual([75, 30]);
    expect(b.history.at(-1)).toMatchObject({ type: "moved" });
    expect(b.history.at(-1).label).toMatch(/Stylist assigned: Steve Hwang \(price \$75 to \$105\)/);
    expect((await slotOf("legacy")).stylistId).toBe("steve");
    // and now it can be approved
    expect((await approveBookingCore(db, { bookingId: "legacy" }, owner)).status).toBe("confirmed");
  });

  it("uses the CURRENT service price, not the stored one", async () => {
    await legacy();
    await db.doc("services/mens-cut").update({ price: { director: 100, senior: 90, junior: 80 } });
    const out = await assignStylistCore(db, { bookingId: "legacy", stylistId: "ethan" }, owner);
    expect(out.price).toBe(80 + 20);
  });

  it("is conflict-checked: refused if that stylist is busy then", async () => {
    await legacy();
    await seedBooking(db, "busy", { stylistId: "steve", time: "10:30 AM" });
    expect(await codeOf(assignStylistCore(db, { bookingId: "legacy", stylistId: "steve" }, owner))).toBe("slot-taken");
    expect((await bookingOf("legacy")).stylistId).toBe("any");
    // a free stylist works
    expect((await assignStylistCore(db, { bookingId: "legacy", stylistId: "yuto" }, owner)).stylistName).toBe("Yuto Hirakawa");
  });

  it("refuses a stylist who is not working then, an unknown or inactive one, and 'any' itself", async () => {
    await legacy({ time: "5:30 PM" });
    await db.doc("stylists/harry").update({ status: "inactive" });
    expect(await codeOf(assignStylistCore(db, { bookingId: "legacy", stylistId: "harry" }, owner))).toBe("invalid");
    expect(await codeOf(assignStylistCore(db, { bookingId: "legacy", stylistId: "ghost" }, owner))).toBe("invalid");
    expect(await codeOf(assignStylistCore(db, { bookingId: "legacy", stylistId: "any" }, owner))).toBe("invalid");
    // 5:30 PM + 60 minutes runs past closing
    expect(await codeOf(assignStylistCore(db, { bookingId: "legacy", stylistId: "yuto" }, owner))).toBe("closed");
  });

  it("only a booking with no stylist can be assigned one", async () => {
    const r = await book(request({ stylistId: "steve" }));
    expect(await codeOf(assignStylistCore(db, { bookingId: r.bookingId, stylistId: "yuto" }, owner))).toBe("precondition");
  });
});

describe("releasing unapproved requests after 24 hours (DEC-036)", () => {
  const DAY = 24 * 3_600_000;

  it("releases a request whose hold ran out: booking and slotBlocks together, with a note for the owner", async () => {
    const r = await book(request({ stylistId: "steve" }));
    expect(await releaseExpiredPendingCore(db, NOW + DAY - 1)).toEqual([]);
    expect((await bookingOf(r.bookingId)).status).toBe("pending");

    expect(await releaseExpiredPendingCore(db, NOW + DAY)).toEqual([r.bookingId]);
    const b = await bookingOf(r.bookingId);
    expect(b).toMatchObject({ status: "cancelled", cancelReason: "expired", restoreStatus: "pending" });
    expect(b.holdExpiresAt).toBeUndefined();
    expect(b.history.at(-1).label).toMatch(/expired \(not approved within 24 hours\)/);
    expect((await slotOf(r.bookingId)).status).toBe("cancelled");
    const notes = (await db.collection("notifications").get()).docs.filter((d) =>
      String(d.get("message")).startsWith("Request expired"),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].get("recipientId")).toBe("owner");
  });

  it("frees the slot for the next customer", async () => {
    const r = await book(request({ stylistId: "steve" }));
    await releaseExpiredPendingCore(db, NOW + DAY + 1000);
    const later = await createBookingRequestCore(db, request({ stylistId: "steve", date: THURSDAY }), { now: NOW + DAY + 2000 });
    expect(later.bookingId).not.toBe(r.bookingId);
  });

  it("leaves an approved request alone, even if its hold would have lapsed", async () => {
    const r = await book(request());
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await releaseExpiredPendingCore(db, NOW + 10 * DAY)).toEqual([]);
    expect((await bookingOf(r.bookingId)).status).toBe("confirmed");
  });

  it("the owner can still approve right up to the deadline", async () => {
    const r = await book(request());
    expect(await releaseExpiredPendingCore(db, NOW + DAY - 60_000)).toEqual([]);
    expect((await approveBookingCore(db, { bookingId: r.bookingId }, { ...owner, now: NOW + DAY - 60_000 })).status).toBe("confirmed");
  });

  it("after release, an approve is refused (it is cancelled) but Restore can bring it back", async () => {
    const r = await book(request());
    await releaseExpiredPendingCore(db, NOW + DAY);
    expect(await codeOf(approveBookingCore(db, { bookingId: r.bookingId }, owner))).toBe("precondition");
    expect((await restoreBookingCore(db, { bookingId: r.bookingId }, { ...owner, now: NOW + DAY })).status).toBe("pending");
  });

  it("is safe to run twice at once and ignores legacy pending bookings that have no hold", async () => {
    const r = await book(request());
    await seedBooking(db, "old-pending", { status: "pending", bookingType: "customer" });
    const [a, b] = await Promise.all([
      releaseExpiredPendingCore(db, NOW + DAY),
      releaseExpiredPendingCore(db, NOW + DAY),
    ]);
    expect([...a, ...b]).toEqual([r.bookingId]);
    expect((await bookingOf("old-pending")).status).toBe("pending");
  });
});

describe("joinWaitlist", () => {
  const entry = (o: Record<string, unknown> = {}) => ({
    customerName: "Wendy Waits",
    customerPhone: "0412999888",
    requestedDate: THURSDAY,
    ...o,
  });
  const join = (body: unknown, ctx = { now: NOW }) => joinWaitlistCore(db, body, ctx);

  it("creates the entry (pending, no 'any' stylist stored) and a note for the owner", async () => {
    const res = await join(entry({ requestedStylistId: "any" }));
    const w = (await db.doc(`waitlist/${res.waitlistId}`).get()).data()!;
    expect(w).toMatchObject({ customerName: "Wendy Waits", customerPhone: "0412999888", requestedDate: THURSDAY, status: "pending" });
    expect("requestedStylistId" in w).toBe(false);
    expect(await count("notifications")).toBe(1);
    const withStylist = await join(entry({ customerPhone: "0412999889", requestedStylistId: "yuto" }));
    expect((await db.doc(`waitlist/${withStylist.waitlistId}`).get()).get("requestedStylistId")).toBe("yuto");
  });

  it("a blocked client cannot join the waitlist either (generic message, nothing written)", async () => {
    await db.doc("customerLookups/0412999888").set({ name: "Blocked", lastVisit: "", visitCount: 0, blocked: true });
    let message = "";
    try {
      await join(entry());
    } catch (err) {
      expect((err as CommandError).code).toBe("blocked");
      message = (err as Error).message;
    }
    expect(message).toBe("Please call the salon to book");
    expect(await count("waitlist")).toBe(0);
    expect(await count("notifications")).toBe(0);
  });

  it("the same person asking twice for the same day is one entry", async () => {
    const a = await join(entry());
    const b = await join(entry());
    expect(b.waitlistId).toBe(a.waitlistId);
    expect(await count("waitlist")).toBe(1);
  });

  it("validates every field", async () => {
    for (const bad of [
      entry({ customerName: "W" }),
      entry({ customerName: "W3ndy" }),
      entry({ customerPhone: "123" }),
      entry({ customerPhone: undefined }),
      entry({ requestedDate: "2026-11-30" }), // past
      entry({ requestedDate: "nope" }),
      entry({ requestedDate: "2029-01-01" }),
      entry({ requestedStylistId: "ghost" }),
      entry({ requestedStylistId: "a/b" }),
      null,
    ]) {
      expect(await codeOf(join(bad))).toBe("invalid");
    }
    expect(await count("waitlist")).toBe(0);
    expect(await count("notifications")).toBe(0);
  });

  it("is rate limited per phone and per address", async () => {
    for (let i = 0; i < LIMITS.waitlistPerPhone.max; i++) {
      await join(entry({ requestedDate: `2026-12-${String(10 + i).padStart(2, "0")}` }));
    }
    expect(await codeOf(join(entry({ requestedDate: "2026-12-20" })))).toBe("rate-limited");

    const ip = "203.0.113.50";
    for (let i = 0; i < LIMITS.waitlistPerIp.max; i++) {
      await join(entry({ customerPhone: `04${String(30_000_000 + i)}` }), { now: NOW, ip } as never);
    }
    expect(await codeOf(join(entry({ customerPhone: "0499000000" }), { now: NOW, ip } as never))).toBe("rate-limited");
  });
});

// ── The owner's browser writes and the functions share one lock ──────────────
describe("an owner walk-in (browser SDK, rules enforced) racing an online request for the same slot", () => {
  let env: RulesTestEnvironment | undefined;

  afterAll(async () => {
    await env?.cleanup();
  });

  it("exactly one of them gets the slot, every time", async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST as string).split(":");
    env = await initializeTestEnvironment({
      projectId: FUNCTIONS_TEST_PROJECT,
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
    });
    const ownerDb = (
      env.authenticatedContext("owner-uid", { role: "owner" }).firestore() as unknown as { _delegate: WebFirestore }
    )._delegate;

    for (let round = 0; round < 12; round++) {
      await resetEmulators();
      await seedSalon(db);
      const walkin = {
        bookingType: "walkin" as const,
        status: "confirmed" as const,
        customerName: "Walk In",
        customerNameLower: "walk in",
        customerPhone: "",
        stylistId: "steve",
        stylistName: "Steve Hwang",
        stylistLevel: "director" as const,
        serviceId: "mens-cut",
        serviceName: "Men's Cut",
        servicePrice: 75,
        activeTime: 45,
        restTime: 0,
        totalTime: 45,
        date: FRIDAY,
        time: "11:00 AM",
        createdAt: new Date(NOW).toISOString(),
      };
      const [adminResult, onlineResult] = await Promise.allSettled([
        createAdminBooking(ownerDb, walkin),
        createBookingRequestCore(db, request({ stylistId: "steve", date: FRIDAY, time: "11:15 AM" }), { now: NOW }),
      ]);
      const wins = [adminResult, onlineResult].filter((r) => r.status === "fulfilled");
      expect(wins, `round ${round}`).toHaveLength(1);
      const loser = [adminResult, onlineResult].find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(
        loser.reason instanceof BookingConflictError ||
          (loser.reason instanceof CommandError && loser.reason.code === "slot-taken"),
        `round ${round}: ${String(loser.reason)}`,
      ).toBe(true);
      expect(await count("bookings")).toBe(1);
      expect(await count("slotBlocks")).toBe(1);
    }
  }, 120_000);
});
