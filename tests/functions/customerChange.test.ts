// tests/functions/customerChange.test.ts
// A customer changing or cancelling their own booking from the link (FR-028, DEC-054),
// against the Firestore emulator: the secret in the link, the owner's policy (cutoff,
// allow cancel / move, request or instant), cancelling, the free times for a move, and the
// request to move - which keeps the original until the owner approves. Fake people only.
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveBookingCore,
  createBookingRequestCore,
  declineBookingCore,
  releaseExpiredPendingCore,
  type OwnerContext,
} from "../../functions/src/bookingCommands";
import { CommandError } from "../../functions/src/commandErrors";
import {
  cancelManagedBookingCore,
  getManagedBookingCore,
  listChangeSlotsCore,
  requestChangeCore,
} from "../../functions/src/customerChange";
import { LIMITS } from "../../functions/src/limits";
import { DEFAULT_CHANGE_POLICY } from "../../src/lib/changePolicy";
import { adminDb, resetEmulators } from "./adminEnv";
import { FRIDAY, MONDAY, NOW, THURSDAY, at, request, seedBooking, seedSalon } from "./fixtures";

const db = adminDb();
const owner: OwnerContext = { now: NOW, actorUid: "owner-uid" };
const ctx = { now: NOW };
const HOUR = 3_600_000;

const bookingOf = async (id: string) => (await db.doc(`bookings/${id}`).get()).data()!;
const slotOf = async (id: string) => (await db.doc(`slotBlocks/${id}`).get()).data();
const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return (err as CommandError).code;
  }
  throw new Error("expected a refusal");
};

/** A confirmed booking made the real way: requested online, then approved. */
const confirmedBooking = async (over: Record<string, unknown> = {}) => {
  const r = await createBookingRequestCore(db, request(over), ctx);
  await approveBookingCore(db, { bookingId: r.bookingId }, owner);
  const b = await bookingOf(r.bookingId);
  return { id: r.bookingId, token: b.manageToken as string, phone: b.customerPhone as string };
};
const pendingBooking = async (over: Record<string, unknown> = {}) => {
  const r = await createBookingRequestCore(db, request(over), ctx);
  const b = await bookingOf(r.bookingId);
  return { id: r.bookingId, token: b.manageToken as string, phone: b.customerPhone as string };
};
const link = (b: { id: string; token: string }, extra: Record<string, unknown> = {}) => ({ bookingId: b.id, token: b.token, ...extra });
const setPolicy = (over: Record<string, unknown>) => db.doc("salonSettings/policy").set({ ...DEFAULT_CHANGE_POLICY, ...over });
const view = (b: { id: string; token: string }, now = NOW) => getManagedBookingCore(db, link(b), { now });

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
});

describe("the secret in the link", () => {
  it("every new booking carries its own random 128-bit secret", async () => {
    const a = await pendingBooking();
    const b = await pendingBooking({ time: "11:00 AM" });
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(b.token).not.toBe(a.token);
  });

  it("a wrong secret, a wrong id and a malformed link all get the same answer", async () => {
    const a = await pendingBooking();
    const msgs: string[] = [];
    for (const input of [
      { bookingId: a.id, token: "x".repeat(22) },
      { bookingId: "no-such-booking", token: a.token },
      { bookingId: a.id },
      { token: a.token },
      { bookingId: "bad id!", token: a.token },
      null,
    ]) {
      try {
        await getManagedBookingCore(db, input, ctx);
      } catch (err) {
        expect((err as CommandError).code).toBe("not-found");
        msgs.push((err as CommandError).message);
      }
    }
    expect(msgs).toHaveLength(6);
    expect(new Set(msgs).size).toBe(1);
  });

  it("a booking from before this feature (no secret) cannot be reached by any link", async () => {
    await seedBooking(db, "legacy", { bookingType: "customer", customerPhone: "0400000001" });
    expect(await codeOf(getManagedBookingCore(db, { bookingId: "legacy", token: "a".repeat(22) }, ctx))).toBe("not-found");
  });

  it("every look counts: past the per-booking allowance the link is rate limited", async () => {
    const a = await pendingBooking();
    for (let i = 0; i < LIMITS.managePerBooking.max; i += 1) await view(a);
    expect(await codeOf(view(a))).toBe("rate-limited");
  });
});

describe("what the customer sees and may do", () => {
  it("a confirmed booking: its details, both actions open, no phone number or email in the answer", async () => {
    const a = await confirmedBooking({ customerName: "Jane Citizen", customerEmail: "jane@example.test" });
    const v = await view(a);
    expect(v).toMatchObject({
      bookingId: a.id,
      status: "confirmed",
      firstName: "Jane",
      date: THURSDAY,
      time: "10:00 AM",
      serviceName: "Men's Cut",
      stylistName: "Steve Hwang",
      canCancel: true,
      canChange: true,
      reason: null,
      rescheduleMode: "request",
      pendingChange: null,
      salonPhone: "(03) 9569 0840",
    });
    expect(JSON.stringify(v)).not.toContain(a.phone);
    expect(JSON.stringify(v)).not.toContain("jane@example.test");
    expect(JSON.stringify(v)).not.toContain(a.token);
  });

  it("a pending request: cancel only, and why", async () => {
    const a = await pendingBooking();
    const v = await view(a);
    expect(v).toMatchObject({ status: "pending", canCancel: true, canChange: false });
    expect(v.reason).toMatch(/waiting for the salon/);
  });

  it("the cutoff: 24 hours by default, the owner's message once it has passed", async () => {
    const a = await confirmedBooking();
    const start = at(THURSDAY, "10:00");
    expect((await view(a, start - 25 * HOUR)).canCancel).toBe(true);
    const late = await view(a, start - 23 * HOUR);
    expect(late).toMatchObject({ canCancel: false, canChange: false, reason: DEFAULT_CHANGE_POLICY.pastCutoffMessage });
    await setPolicy({ cutoffHours: 2, pastCutoffMessage: "Too late - call us on the number below." });
    expect((await view(a, start - 3 * HOUR)).canCancel).toBe(true);
    expect((await view(a, start - 1 * HOUR)).reason).toBe("Too late - call us on the number below.");
    await setPolicy({ cutoffHours: 0 });
    expect((await view(a, start - 60_000)).canCancel).toBe(true);
    expect((await view(a, start + 60_000)).canCancel).toBe(false);
  });

  it("the owner can switch cancelling or moving off, each on its own, or both", async () => {
    const a = await confirmedBooking();
    await setPolicy({ allowCancel: false });
    expect(await view(a)).toMatchObject({ canCancel: false, canChange: true });
    await setPolicy({ allowReschedule: false });
    expect(await view(a)).toMatchObject({ canCancel: true, canChange: false });
    await setPolicy({ allowCancel: false, allowReschedule: false });
    expect(await view(a)).toMatchObject({ canCancel: false, canChange: false });
    expect(await codeOf(cancelManagedBookingCore(db, link(a), ctx))).toBe("precondition");
  });

  it("a pending request can still be cancelled with cancelling switched off", async () => {
    const a = await pendingBooking();
    await setPolicy({ allowCancel: false, allowReschedule: false });
    expect((await view(a)).canCancel).toBe(true);
  });

  it("a broken policy document falls back to the defaults", async () => {
    const a = await confirmedBooking();
    await db.doc("salonSettings/policy").set({ cutoffHours: -5, allowCancel: "yes", pastCutoffMessage: "" });
    expect(await view(a)).toMatchObject({ canCancel: true, canChange: true });
  });

  it("nothing for a booking that is not open", async () => {
    const a = await confirmedBooking();
    await db.doc(`bookings/${a.id}`).update({ status: "completed" });
    expect(await view(a)).toMatchObject({ canCancel: false, canChange: false });
  });
});

describe("cancelling", () => {
  it("a pending request: released at once, noted in its history, and the owner and stylist are told", async () => {
    const a = await pendingBooking();
    expect(await cancelManagedBookingCore(db, link(a), ctx)).toEqual({ status: "cancelled" });
    const b = await bookingOf(a.id);
    expect(b).toMatchObject({ status: "cancelled", cancelledBy: "customer" });
    expect(b.history.at(-1)).toMatchObject({ label: "Cancelled by the customer", status: "cancelled" });
    expect((await slotOf(a.id))?.status).toBe("cancelled");
    const notes = (await db.collection("notifications").where("bookingId", "==", a.id).get()).docs.map((d) => d.data());
    expect(notes.filter((n) => /cancelled their request/.test(n.message)).map((n) => n.recipientId).sort()).toEqual(["owner", "steve"]);
  });

  it("a confirmed booking before the cutoff frees its time for someone else", async () => {
    const a = await confirmedBooking();
    expect(await codeOf(createBookingRequestCore(db, request({ stylistId: "steve" }), ctx))).toBe("slot-taken");
    await cancelManagedBookingCore(db, link(a), ctx);
    expect((await bookingOf(a.id)).status).toBe("cancelled");
    await expect(createBookingRequestCore(db, request({ stylistId: "steve" }), ctx)).resolves.toBeDefined();
  });

  it("refuses after the cutoff and a second time, changing nothing", async () => {
    const a = await confirmedBooking();
    expect(await codeOf(cancelManagedBookingCore(db, link(a), { now: at(THURSDAY, "10:00") - 2 * HOUR }))).toBe("precondition");
    expect((await bookingOf(a.id)).status).toBe("confirmed");
    await cancelManagedBookingCore(db, link(a), ctx);
    expect(await codeOf(cancelManagedBookingCore(db, link(a), ctx))).toBe("precondition");
  });

  it("with the wrong secret nothing is cancelled", async () => {
    const a = await confirmedBooking();
    expect(await codeOf(cancelManagedBookingCore(db, { bookingId: a.id, token: "z".repeat(22) }, ctx))).toBe("not-found");
    expect((await bookingOf(a.id)).status).toBe("confirmed");
  });
});

describe("the free times for a move", () => {
  it("lists the same stylist's free starts that day, never the time it is already at, and includes times that overlap its own", async () => {
    const a = await confirmedBooking({ time: "10:00 AM" });
    const { times } = await listChangeSlotsCore(db, link(a, { date: THURSDAY }), ctx);
    expect(times).not.toContain("10:00 AM");
    expect(times).toContain("10:15 AM"); // overlaps its own 10:00-10:45, which is released on approval
    expect(times).toContain("11:00 AM");
    expect(times[times.length - 1]).toBe("5:15 PM"); // a 45-minute cut must end by 6 pm
    expect(times.every((t) => /^\d{1,2}:\d{2} (AM|PM)$/.test(t))).toBe(true);
  });

  it("leaves out times another booking or a break takes, and closed days", async () => {
    const a = await confirmedBooking({ time: "10:00 AM" });
    await seedBooking(db, "other", { time: "1:00 PM", totalTime: 60, activeTime: 60 });
    await seedBooking(db, "lunch", { bookingType: "break", time: "3:00 PM", totalTime: 30, activeTime: 30 });
    const { times } = await listChangeSlotsCore(db, link(a, { date: THURSDAY }), ctx);
    expect(times).not.toContain("1:00 PM");
    expect(times).not.toContain("1:30 PM");
    expect(times).not.toContain("3:00 PM");
    expect(times).toContain("2:00 PM");
    expect((await listChangeSlotsCore(db, link(a, { date: MONDAY }), ctx)).times).toEqual([]); // closed Mondays
  });

  it("only for a booking that may be moved, and only with a real date", async () => {
    const a = await confirmedBooking();
    expect(await codeOf(listChangeSlotsCore(db, link(a, { date: "tomorrow" }), ctx))).toBe("invalid");
    await setPolicy({ allowReschedule: false });
    expect(await codeOf(listChangeSlotsCore(db, link(a, { date: FRIDAY }), ctx))).toBe("precondition");
    const p = await pendingBooking({ time: "3:00 PM" });
    expect(await codeOf(listChangeSlotsCore(db, link(p, { date: FRIDAY }), ctx))).toBe("precondition");
  });
});

describe("a request to move a booking (default: the owner approves)", () => {
  it("creates a pending request that holds the new time, and leaves the original confirmed and in place", async () => {
    const a = await confirmedBooking({ time: "10:00 AM" });
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    expect(r).toMatchObject({ status: "pending", date: FRIDAY, time: "2:00 PM" });

    const original = await bookingOf(a.id);
    expect(original.status).toBe("confirmed");
    expect(original).toMatchObject({ date: THURSDAY, time: "10:00 AM" });
    expect((await slotOf(a.id))?.status).toBe("confirmed");

    const change = await bookingOf(r.bookingId);
    expect(change).toMatchObject({
      status: "pending",
      replacesBookingId: a.id,
      replacesSummary: `${THURSDAY} 10:00 AM`,
      customerPhone: a.phone,
      stylistId: "steve",
      serviceId: "mens-cut",
      calendarUid: a.id,
      calendarSeq: 1,
      date: FRIDAY,
      time: "2:00 PM",
    });
    expect(change.manageToken).not.toBe(a.token);
    expect((await slotOf(r.bookingId))?.status).toBe("pending"); // the new time is held
    const notes = (await db.collection("notifications").where("bookingId", "==", r.bookingId).get()).docs.map((d) => d.data().message as string);
    expect(notes.some((m) => /move a booking/.test(m) && m.includes(THURSDAY))).toBe(true);
  });

  it("the customer keeps the price they agreed, even if the service has gone up", async () => {
    const a = await confirmedBooking();
    await db.doc("services/mens-cut").update({ "price.director": 120 });
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "11:00 AM" }), ctx);
    expect((await bookingOf(r.bookingId)).servicePrice).toBe(75);
    expect((await bookingOf(r.bookingId)).services[0].price).toBe(75);
  });

  it("is one at a time: the page says a request is waiting, and a second is refused", async () => {
    const a = await confirmedBooking();
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "11:00 AM" }), ctx);
    const v = await view(a);
    expect(v.pendingChange).toEqual({ bookingId: r.bookingId, date: FRIDAY, time: "11:00 AM" });
    expect(v.canChange).toBe(false);
    expect(await codeOf(requestChangeCore(db, link(a, { date: FRIDAY, time: "3:00 PM" }), ctx))).toBe("limit");
  });

  it("the new time is checked like any request: taken, closed, too soon and not on the grid are refused", async () => {
    const a = await confirmedBooking();
    await seedBooking(db, "other", { date: FRIDAY, time: "2:00 PM" });
    expect(await codeOf(requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx))).toBe("slot-taken");
    expect(await codeOf(requestChangeCore(db, link(a, { date: MONDAY, time: "11:00 AM" }), ctx))).toBe("closed");
    expect(await codeOf(requestChangeCore(db, link(a, { date: "2026-12-01", time: "10:00 AM" }), ctx))).toBe("closed");
    expect(await codeOf(requestChangeCore(db, link(a, { date: FRIDAY, time: "2:07 PM" }), ctx))).toBe("closed");
    expect((await db.collection("bookings").where("replacesBookingId", "==", a.id).get()).size).toBe(0);
  });

  it("can move to an overlapping time of its own day: the original is not in the way of its replacement", async () => {
    const a = await confirmedBooking({ time: "10:00 AM" });
    const r = await requestChangeCore(db, link(a, { date: THURSDAY, time: "10:15 AM" }), ctx);
    expect(r.status).toBe("pending");
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);
    expect((await bookingOf(r.bookingId)).status).toBe("confirmed");
    expect((await bookingOf(a.id)).status).toBe("cancelled");
  });

  it("is not blocked by the pending-requests limit (a move is not a new request)", async () => {
    const a = await confirmedBooking();
    // two other pending requests from the SAME phone
    await createBookingRequestCore(db, request({ customerPhone: a.phone, stylistId: "yuto", time: "11:00 AM" }), ctx);
    await createBookingRequestCore(db, request({ customerPhone: a.phone, stylistId: "elly", time: "11:00 AM" }), ctx);
    await expect(requestChangeCore(db, link(a, { date: FRIDAY, time: "11:00 AM" }), ctx)).resolves.toMatchObject({ status: "pending" });
  });

  it("approving it releases the original in the same step, and frees its old time", async () => {
    const a = await confirmedBooking({ time: "10:00 AM" });
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    await approveBookingCore(db, { bookingId: r.bookingId }, owner);

    expect((await bookingOf(r.bookingId)).status).toBe("confirmed");
    expect((await slotOf(r.bookingId))?.status).toBe("confirmed");
    const original = await bookingOf(a.id);
    expect(original).toMatchObject({ status: "cancelled", cancelReason: "rescheduled", rescheduledToId: r.bookingId });
    expect(original.history.at(-1).label).toBe(`Moved to ${FRIDAY} at 2:00 PM`);
    expect((await slotOf(a.id))?.status).toBe("cancelled");
    await expect(createBookingRequestCore(db, request({ stylistId: "steve", time: "10:00 AM" }), ctx)).resolves.toBeDefined();
  });

  it("declining it, or letting it lapse, leaves the original exactly as it was", async () => {
    const a = await confirmedBooking();
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    await declineBookingCore(db, { bookingId: r.bookingId }, owner);
    expect(await bookingOf(a.id)).toMatchObject({ status: "confirmed", date: THURSDAY, time: "10:00 AM" });
    expect((await slotOf(a.id))?.status).toBe("confirmed");
    expect((await view(a)).canChange).toBe(true); // and they can ask again

    const r2 = await requestChangeCore(db, link(a, { date: FRIDAY, time: "3:00 PM" }), ctx);
    const released = await releaseExpiredPendingCore(db, NOW + 25 * HOUR);
    expect(released).toContain(r2.bookingId);
    expect((await bookingOf(a.id)).status).toBe("confirmed");
  });

  it("cancelling the original also withdraws its pending request; cancelling the request leaves the original", async () => {
    const a = await confirmedBooking();
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    // the request's own link cancels just the request
    const requestToken = (await bookingOf(r.bookingId)).manageToken as string;
    const withdrawn = await cancelManagedBookingCore(db, { bookingId: r.bookingId, token: requestToken }, ctx);
    expect(withdrawn.status).toBe("cancelled");
    expect((await bookingOf(r.bookingId)).history.at(-1).label).toBe("Request to move withdrawn by the customer");
    expect((await bookingOf(a.id)).status).toBe("confirmed");

    const r2 = await requestChangeCore(db, link(a, { date: FRIDAY, time: "3:00 PM" }), ctx);
    await cancelManagedBookingCore(db, link(a), ctx);
    expect((await bookingOf(a.id)).status).toBe("cancelled");
    expect((await bookingOf(r2.bookingId)).status).toBe("cancelled");
  });

  it("the request's own page explains it, and offers no move", async () => {
    const a = await confirmedBooking();
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    const requestToken = (await bookingOf(r.bookingId)).manageToken as string;
    const v = await getManagedBookingCore(db, { bookingId: r.bookingId, token: requestToken }, ctx);
    expect(v).toMatchObject({ status: "pending", canCancel: true, canChange: false, replacesSummary: `${THURSDAY} 10:00 AM` });
    expect(v.reason).toMatch(/Your original time stays/);
  });

  it("the cutoff applies to a move as it does to a cancel", async () => {
    const a = await confirmedBooking();
    expect(await codeOf(requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), { now: at(THURSDAY, "10:00") - 3 * HOUR }))).toBe("precondition");
  });
});

describe("instant moves (the owner's choice)", () => {
  it("moves at once when the time is free, releasing the original", async () => {
    await setPolicy({ rescheduleMode: "instant" });
    const a = await confirmedBooking();
    const r = await requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx);
    expect(r.status).toBe("confirmed");
    expect(await bookingOf(r.bookingId)).toMatchObject({ status: "confirmed", date: FRIDAY, time: "2:00 PM" });
    expect(await bookingOf(a.id)).toMatchObject({ status: "cancelled", cancelReason: "rescheduled" });
  });

  it("an instant move is still refused when the time is taken", async () => {
    await setPolicy({ rescheduleMode: "instant" });
    const a = await confirmedBooking();
    await seedBooking(db, "other", { date: FRIDAY, time: "2:00 PM" });
    expect(await codeOf(requestChangeCore(db, link(a, { date: FRIDAY, time: "2:00 PM" }), ctx))).toBe("slot-taken");
    expect((await bookingOf(a.id)).status).toBe("confirmed");
  });
});
