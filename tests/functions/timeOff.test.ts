// tests/functions/timeOff.test.ts
// Stylist days off and blocked times (FR-029, DEC-055) against the Firestore emulator: a
// stylist asks, the owner (or a trusted stylist) decides, and what the calendar sees is
// "break" blocks laid around the bookings that stay. The owner's policy decides what happens
// while a request waits (hold, wait, or apply a short block at once). Fake people only.
import { beforeEach, describe, expect, it } from "vitest";
import { createBookingRequestCore } from "../../functions/src/bookingCommands";
import { CommandError } from "../../functions/src/commandErrors";
import { LIMITS } from "../../functions/src/limits";
import {
  decideTimeOffCore,
  previewTimeOffCore,
  requestTimeOffCore,
  withdrawTimeOffCore,
  type TimeOffActor,
} from "../../functions/src/timeOff";
import { adminDb, resetEmulators } from "./adminEnv";
import { FRIDAY, MONDAY, NOW, THURSDAY, request, seedBooking, seedSalon } from "./fixtures";

const db = adminDb();
const SATURDAY = "2026-12-05";

const owner: TimeOffActor = { uid: "owner-uid", name: "Owner", role: "owner", canApprove: true };
const steve: TimeOffActor = { uid: "steve-uid", name: "Steve", role: "stylist", stylistId: "steve", canApprove: false };
const yuto: TimeOffActor = { uid: "yuto-uid", name: "Yuto", role: "stylist", stylistId: "yuto", canApprove: false };
const approver: TimeOffActor = { uid: "elly-uid", name: "Elly", role: "stylist", stylistId: "elly", canApprove: true };

const codeOf = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return (err as CommandError).code;
  }
  throw new Error("expected a refusal");
};

const recordOf = async (id: string) => (await db.doc(`timeOff/${id}`).get()).data()!;
const breaksOf = async (id: string) =>
  (await db.collection("bookings").where("timeOffId", "==", id).get()).docs
    .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string; date: string; time: string; totalTime: number })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const setPolicy = (over: Record<string, unknown>) => db.doc("privateSettings/timeOff").set({ pending: "hold", autoMaxHours: 3, ...over });

const dayOff = (over: Record<string, unknown> = {}) => ({ stylistId: "steve", kind: "dayoff", startDate: THURSDAY, endDate: THURSDAY, reason: "Family", ...over });
const block = (over: Record<string, unknown> = {}) => ({
  stylistId: "steve",
  kind: "block",
  startDate: THURSDAY,
  startTime: "1:00 PM",
  endTime: "2:00 PM",
  reason: "Dentist",
  ...over,
});

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
});

describe("asking for time off (a stylist)", () => {
  it("a day off is held at once by default: one break across the working day, awaiting approval", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(r).toMatchObject({ status: "pending", blocked: true, auto: false, cancelled: [] });
    expect(await recordOf(r.id)).toMatchObject({ stylistId: "steve", status: "pending", requestedByUid: "steve-uid", reason: "Family", kind: "dayoff" });
    const breaks = await breaksOf(r.id);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({
      bookingType: "break",
      status: "confirmed",
      stylistId: "steve",
      date: THURSDAY,
      time: "10:00 AM",
      totalTime: 480, // the salon's 10 am to 6 pm
      serviceName: "Awaiting approval: Family",
      timeOffApproved: false,
    });
    expect((await db.doc(`slotBlocks/${breaks[0].id}`).get()).data()).toMatchObject({ stylistId: "steve", date: THURSDAY, status: "confirmed" });
  });

  it("customers cannot book that stylist then, but can book anyone else ('any' picks another)", async () => {
    await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(await codeOf(createBookingRequestCore(db, request({ stylistId: "steve", time: "11:00 AM" }), { now: NOW }))).toBe("slot-taken");
    const other = await createBookingRequestCore(db, request({ stylistId: "any", time: "11:00 AM" }), { now: NOW });
    expect(other.stylistId).not.toBe("steve");
  });

  it("a block of time becomes one break of that length", async () => {
    const r = await requestTimeOffCore(db, block(), steve, NOW);
    expect(await breaksOf(r.id)).toMatchObject([{ time: "1:00 PM", totalTime: 60, serviceName: "Awaiting approval: Dentist" }]);
  });

  it("a range of days: one break a day, nothing on a closed day", async () => {
    const r = await requestTimeOffCore(db, dayOff({ startDate: FRIDAY, endDate: MONDAY }), steve, NOW); // Fri, Sat, Sun, Mon (closed)
    const breaks = await breaksOf(r.id);
    expect(breaks.map((b) => b.date)).toEqual([FRIDAY, SATURDAY, "2026-12-06"]);
    expect(breaks.some((b) => b.date === MONDAY)).toBe(false);
  });

  it("is laid around bookings that are already there, which stay exactly as they are", async () => {
    await seedBooking(db, "cust", { bookingType: "customer", customerPhone: "0400000001", customerName: "Jane Citizen", time: "12:00 PM", totalTime: 60, activeTime: 60 });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    const breaks = await breaksOf(r.id);
    expect(breaks.map((b) => [b.time, b.totalTime])).toEqual([
      ["10:00 AM", 120], // 10-12
      ["1:00 PM", 300], //  1-6
    ]);
    expect((await db.doc("bookings/cust").get()).get("status")).toBe("confirmed");
  });

  it("tells the owner, and any stylist allowed to approve, but not the asker", async () => {
    await db.doc("users/elly-uid").set({ role: "stylist", stylistId: "elly", effectiveCaps: ["approveTimeOff"] });
    await db.doc("users/steve-uid").set({ role: "stylist", stylistId: "steve", effectiveCaps: ["approveTimeOff"] });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    const notes = (await db.collection("notifications").where("timeOffId", "==", r.id).get()).docs.map((d) => d.data());
    expect(notes.map((n) => n.recipientId).sort()).toEqual(["elly", "owner"]);
    expect(notes[0].message).toMatch(/Steve Hwang has asked for a day off on 2026-12-03/);
  });

  it("a stylist can only ask for themselves", async () => {
    expect(await codeOf(requestTimeOffCore(db, dayOff({ stylistId: "yuto" }), steve, NOW))).toBe("forbidden");
    expect(await codeOf(requestTimeOffCore(db, dayOff({ stylistId: "ghost" }), approver, NOW))).toBe("not-found");
  });

  it("refuses a past date, a backwards range, too long a range, too far ahead, a bad time or a reversed block", async () => {
    expect(await codeOf(requestTimeOffCore(db, dayOff({ startDate: "2026-11-30", endDate: "2026-11-30" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, dayOff({ startDate: FRIDAY, endDate: THURSDAY }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, dayOff({ startDate: FRIDAY, endDate: "2027-02-10" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, dayOff({ startDate: "2028-01-01", endDate: "2028-01-01" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, block({ startTime: "1:07 PM" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, block({ startTime: "3:00 PM", endTime: "2:00 PM" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, block({ startTime: "soon" }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, { ...dayOff(), kind: "holiday" }, steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, dayOff({ reason: "x".repeat(201) }), steve, NOW))).toBe("invalid");
    expect(await codeOf(requestTimeOffCore(db, null, steve, NOW))).toBe("invalid");
    expect((await db.collection("timeOff").get()).size).toBe(0);
  });

  it("strips control characters from the reason", async () => {
    const r = await requestTimeOffCore(db, dayOff({ reason: "Family\r\n\u0007 event" }), steve, NOW);
    expect((await recordOf(r.id)).reason).toBe("Family event");
  });

  it("is rate limited", async () => {
    for (let i = 0; i < LIMITS.timeOffPerDay.max; i += 1) await previewTimeOffCore(db, dayOff(), steve, NOW);
    expect(await codeOf(requestTimeOffCore(db, dayOff(), steve, NOW))).toBe("rate-limited");
  });
});

describe("the owner's policy while a request waits", () => {
  it("'wait': nothing is blocked until it is approved", async () => {
    await setPolicy({ pending: "wait" });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(r).toMatchObject({ status: "pending", blocked: false });
    expect(await breaksOf(r.id)).toEqual([]);
    await expect(createBookingRequestCore(db, request({ stylistId: "steve", time: "11:00 AM" }), { now: NOW })).resolves.toBeDefined();
  });

  it("'auto': a short block is applied at once and the approvers are told; a long one or a day off is held", async () => {
    await setPolicy({ pending: "auto", autoMaxHours: 3 });
    const short = await requestTimeOffCore(db, block({ startTime: "1:00 PM", endTime: "4:00 PM" }), steve, NOW);
    expect(short).toMatchObject({ status: "approved", auto: true, blocked: true });
    expect(await recordOf(short.id)).toMatchObject({ status: "approved", auto: true, decidedByName: "Applied automatically" });
    expect((await breaksOf(short.id))[0]).toMatchObject({ serviceName: "Dentist", timeOffApproved: true });
    const told = (await db.collection("notifications").where("timeOffId", "==", short.id).get()).docs.map((d) => d.data().message as string);
    expect(told.some((m) => /blocked automatically/.test(m))).toBe(true);

    const longer = await requestTimeOffCore(db, block({ startDate: FRIDAY, startTime: "1:00 PM", endTime: "4:15 PM" }), steve, NOW);
    expect(longer).toMatchObject({ status: "pending", blocked: true, auto: false });
    const day = await requestTimeOffCore(db, dayOff({ startDate: SATURDAY, endDate: SATURDAY }), steve, NOW);
    expect(day.status).toBe("pending");
  });

  it("a broken policy document falls back to 'hold'", async () => {
    await db.doc("privateSettings/timeOff").set({ pending: "whenever", autoMaxHours: 99 });
    expect((await requestTimeOffCore(db, dayOff(), steve, NOW)).blocked).toBe(true);
  });
});

describe("the owner's (or an approver's) own entry", () => {
  it("applies at once, with the real label", async () => {
    const r = await requestTimeOffCore(db, dayOff({ stylistId: "yuto" }), owner, NOW);
    expect(r).toMatchObject({ status: "approved", blocked: true, auto: false });
    expect(await recordOf(r.id)).toMatchObject({ status: "approved", decidedByUid: "owner-uid" });
    expect((await breaksOf(r.id))[0]).toMatchObject({ stylistId: "yuto", serviceName: "Family", timeOffApproved: true });
    const told = (await db.collection("notifications").where("timeOffId", "==", r.id).get()).docs.map((d) => d.data());
    expect(told).toMatchObject([{ recipientId: "yuto", message: expect.stringContaining("Time off was added for you") }]);
  });

  it("an approver stylist can add time off for anyone", async () => {
    expect((await requestTimeOffCore(db, dayOff({ stylistId: "steve" }), approver, NOW)).status).toBe("approved");
  });

  it("cancels the bookings it is told to, and lays breaks over the room that makes; the others stay", async () => {
    await seedBooking(db, "a", { bookingType: "customer", customerPhone: "0400000001", customerName: "Ann", time: "11:00 AM" });
    await seedBooking(db, "b", { bookingType: "customer", customerPhone: "0400000002", customerName: "Bea", time: "3:00 PM" });
    const r = await requestTimeOffCore(db, { ...dayOff(), cancelBookingIds: ["a", "not-in-range-booking"] }, owner, NOW);
    expect(r.cancelled.map((c) => c.id)).toEqual(["a"]);
    expect((await db.doc("bookings/a").get()).data()).toMatchObject({ status: "cancelled" });
    expect((await db.doc("bookings/a").get()).data()!.history.at(-1).label).toBe("Cancelled: Steve Hwang is away");
    expect((await db.doc("slotBlocks/a").get()).get("status")).toBe("cancelled");
    expect((await db.doc("bookings/b").get()).get("status")).toBe("confirmed");
    // 10-3 free (Ann's slot is now free), Bea's 3:00-3:45 stays, 3:45-6 free
    expect((await breaksOf(r.id)).map((b) => [b.time, b.totalTime])).toEqual([
      ["10:00 AM", 300],
      ["3:45 PM", 135],
    ]);
  });

  it("only a stylist's own request may carry a cancel list when the asker can approve", async () => {
    await seedBooking(db, "a", { bookingType: "customer", customerPhone: "0400000001", customerName: "Ann", time: "11:00 AM" });
    const r = await requestTimeOffCore(db, { ...dayOff(), cancelBookingIds: ["a"] }, steve, NOW);
    expect(r.cancelled).toEqual([]);
    expect((await db.doc("bookings/a").get()).get("status")).toBe("confirmed");
  });
});

describe("previewing the clashes", () => {
  it("lists the clients' open bookings in the blocked time and nothing else", async () => {
    await seedBooking(db, "in", { bookingType: "customer", customerPhone: "0400000001", customerName: "Ann", time: "1:30 PM" });
    await seedBooking(db, "before", { bookingType: "customer", customerPhone: "0400000002", customerName: "Bea", time: "11:00 AM" });
    await seedBooking(db, "cancelled", { bookingType: "customer", customerPhone: "0400000003", customerName: "Cy", time: "1:15 PM", status: "cancelled" });
    await seedBooking(db, "someone-else", { bookingType: "customer", customerPhone: "0400000004", customerName: "Di", time: "1:15 PM", stylistId: "yuto", stylistName: "Yuto" });
    await seedBooking(db, "a-break", { bookingType: "break", time: "1:00 PM" });
    const { clashes } = await previewTimeOffCore(db, block({ startTime: "1:00 PM", endTime: "2:00 PM" }), steve, NOW);
    expect(clashes.map((c) => c.id)).toEqual(["in"]);
    expect(clashes[0]).toMatchObject({ customerName: "Ann", time: "1:30 PM", serviceName: "Men's Cut" });
    // a whole day off clashes with everything that day
    expect((await previewTimeOffCore(db, dayOff(), steve, NOW)).clashes.map((c) => c.id).sort()).toEqual(["before", "in"]);
  });

  it("a stylist previews only their own time; an approver anyone's", async () => {
    expect(await codeOf(previewTimeOffCore(db, dayOff({ stylistId: "yuto" }), steve, NOW))).toBe("forbidden");
    await expect(previewTimeOffCore(db, dayOff({ stylistId: "yuto" }), approver, NOW)).resolves.toBeDefined();
  });
});

describe("deciding a request", () => {
  it("approving makes the breaks real (the label drops 'awaiting approval'), tells the stylist, and records who decided", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    const out = await decideTimeOffCore(db, { id: r.id, decision: "approve", note: "Enjoy" }, owner, NOW);
    expect(out).toEqual({ status: "approved", cancelled: [] });
    expect(await recordOf(r.id)).toMatchObject({ status: "approved", decidedByUid: "owner-uid", decisionNote: "Enjoy" });
    expect((await breaksOf(r.id)).map((b) => [b.serviceName, b.timeOffApproved])).toEqual([["Family", true]]);
    const told = (await db.collection("notifications").where("recipientId", "==", "steve").get()).docs.map((d) => d.data().message as string);
    expect(told.some((m) => /was approved: Enjoy/.test(m))).toBe(true);
  });

  it("approving under 'wait' lays the breaks for the first time", async () => {
    await setPolicy({ pending: "wait" });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    await decideTimeOffCore(db, { id: r.id, decision: "approve" }, owner, NOW);
    expect(await breaksOf(r.id)).toHaveLength(1);
  });

  it("approving cancels the bookings chosen and keeps the others, and the breaks cover exactly the free time", async () => {
    await seedBooking(db, "a", { bookingType: "customer", customerPhone: "0400000001", customerName: "Ann", time: "11:00 AM" });
    await seedBooking(db, "b", { bookingType: "customer", customerPhone: "0400000002", customerName: "Bea", time: "3:00 PM" });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect((await breaksOf(r.id)).map((b) => [b.time, b.totalTime])).toEqual([["10:00 AM", 60], ["11:45 AM", 195], ["3:45 PM", 135]]);

    const out = await decideTimeOffCore(db, { id: r.id, decision: "approve", cancelBookingIds: ["a"] }, owner, NOW);
    expect(out.cancelled).toMatchObject([{ id: "a", customerName: "Ann", customerPhone: "0400000001", time: "11:00 AM" }]);
    expect((await db.doc("bookings/a").get()).get("status")).toBe("cancelled");
    expect((await db.doc("bookings/b").get()).get("status")).toBe("confirmed");
    expect((await breaksOf(r.id)).map((b) => [b.time, b.totalTime])).toEqual([["10:00 AM", 300], ["3:45 PM", 135]]);
  });

  it("will not cancel a booking that is not in the blocked time, or not this stylist's", async () => {
    await seedBooking(db, "other-day", { bookingType: "customer", customerPhone: "0400000001", customerName: "Ann", date: FRIDAY });
    await seedBooking(db, "other-stylist", { bookingType: "customer", customerPhone: "0400000002", customerName: "Bea", stylistId: "yuto", stylistName: "Yuto" });
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    const out = await decideTimeOffCore(db, { id: r.id, decision: "approve", cancelBookingIds: ["other-day", "other-stylist"] }, owner, NOW);
    expect(out.cancelled).toEqual([]);
    expect((await db.doc("bookings/other-day").get()).get("status")).toBe("confirmed");
    expect((await db.doc("bookings/other-stylist").get()).get("status")).toBe("confirmed");
  });

  it("declining releases the held time at once and says so", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(await breaksOf(r.id)).toHaveLength(1);
    const out = await decideTimeOffCore(db, { id: r.id, decision: "decline", note: "We're short that day" }, owner, NOW);
    expect(out.status).toBe("declined");
    expect(await breaksOf(r.id)).toEqual([]);
    expect((await db.collection("slotBlocks").where("stylistId", "==", "steve").get()).size).toBe(0);
    expect(await recordOf(r.id)).toMatchObject({ status: "declined", decisionNote: "We're short that day", breakIds: [] });
    await expect(createBookingRequestCore(db, request({ stylistId: "steve", time: "11:00 AM" }), { now: NOW })).resolves.toBeDefined();
    const told = (await db.collection("notifications").where("recipientId", "==", "steve").get()).docs.map((d) => d.data().message as string);
    expect(told.some((m) => /not approved: We're short that day/.test(m))).toBe(true);
  });

  it("only an approver decides; nobody approves their own request except the owner; a request is decided once", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(await codeOf(decideTimeOffCore(db, { id: r.id, decision: "approve" }, yuto, NOW))).toBe("forbidden");
    const mine = await requestTimeOffCore(db, dayOff({ stylistId: "elly", startDate: FRIDAY, endDate: FRIDAY }), { ...approver, canApprove: false }, NOW);
    expect(await codeOf(decideTimeOffCore(db, { id: mine.id, decision: "approve" }, { ...approver, canApprove: true }, NOW))).toBe("forbidden"); // her own
    await expect(decideTimeOffCore(db, { id: r.id, decision: "approve" }, approver, NOW)).resolves.toMatchObject({ status: "approved" });
    expect(await codeOf(decideTimeOffCore(db, { id: r.id, decision: "decline" }, owner, NOW))).toBe("precondition");
    expect(await codeOf(decideTimeOffCore(db, { id: "nope", decision: "approve" }, owner, NOW))).toBe("not-found");
    expect(await codeOf(decideTimeOffCore(db, { id: mine.id, decision: "maybe" }, owner, NOW))).toBe("invalid");
  });

  it("the owner can approve a request they made themselves", async () => {
    // an owner's own entry is applied at once; the case is a pending one the owner decides
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    await db.doc(`timeOff/${r.id}`).update({ requestedByUid: "owner-uid" });
    await expect(decideTimeOffCore(db, { id: r.id, decision: "approve" }, owner, NOW)).resolves.toMatchObject({ status: "approved" });
  });
});

describe("taking it back", () => {
  it("the stylist withdraws a waiting request: the held time is released", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(await withdrawTimeOffCore(db, { id: r.id }, steve, NOW)).toEqual({ status: "withdrawn" });
    expect(await breaksOf(r.id)).toEqual([]);
    expect(await recordOf(r.id)).toMatchObject({ status: "withdrawn" });
  });

  it("once approved only an approver can take it back, and the stylist is told", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    await decideTimeOffCore(db, { id: r.id, decision: "approve" }, owner, NOW);
    expect(await codeOf(withdrawTimeOffCore(db, { id: r.id }, steve, NOW))).toBe("forbidden");
    expect(await codeOf(withdrawTimeOffCore(db, { id: r.id }, yuto, NOW))).toBe("forbidden");
    await withdrawTimeOffCore(db, { id: r.id }, owner, NOW);
    expect(await breaksOf(r.id)).toEqual([]);
    const told = (await db.collection("notifications").where("recipientId", "==", "steve").get()).docs.map((d) => d.data().message as string);
    expect(told.some((m) => /was removed/.test(m))).toBe(true);
  });

  it("is not repeated, and nobody withdraws someone else's", async () => {
    const r = await requestTimeOffCore(db, dayOff(), steve, NOW);
    expect(await codeOf(withdrawTimeOffCore(db, { id: r.id }, yuto, NOW))).toBe("forbidden");
    await withdrawTimeOffCore(db, { id: r.id }, steve, NOW);
    expect(await codeOf(withdrawTimeOffCore(db, { id: r.id }, owner, NOW))).toBe("precondition");
  });
});
