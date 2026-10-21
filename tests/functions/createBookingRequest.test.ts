// tests/functions/createBookingRequest.test.ts
// createBookingRequest against the Firestore emulator (Admin SDK): validation, price
// and phases recomputed from the records, "any available stylist", slot races, the
// blocked-client check, the pending limit and the rate limits. DEC-035 to DEC-040.
// Run via `npm run test:functions`.
import { beforeEach, describe, expect, it } from "vitest";
import { createBookingRequestCore, type BookingRequestResult } from "../../functions/src/bookingCommands";
import { CommandError } from "../../functions/src/commandErrors";
import { LIMITS } from "../../functions/src/limits";
import { adminDb, resetEmulators } from "./adminEnv";
import {
  CHRISTMAS,
  FRIDAY,
  MONDAY,
  NOW,
  THURSDAY,
  at,
  request,
  seedBooking,
  seedSalon,
} from "./fixtures";

const db = adminDb();
const ctx = { now: NOW };

const book = (body: unknown, c = ctx) => createBookingRequestCore(db, body, c);

const refusal = async (body: unknown, c = ctx): Promise<CommandError> => {
  try {
    await book(body, c);
  } catch (err) {
    expect(err).toBeInstanceOf(CommandError);
    return err as CommandError;
  }
  throw new Error("expected the request to be refused");
};

const count = async (collection: string) => (await db.collection(collection).get()).size;

beforeEach(async () => {
  await resetEmulators();
  await seedSalon(db);
});

describe("a valid request", () => {
  it("writes the booking and its slotBlocks projection together, pending, and returns the exact price", async () => {
    const res = await book(request({ stylistId: "steve", serviceIds: ["mens-cut", "beard-trim"], notes: "Quiet chair please" }));
    expect(res).toMatchObject({
      status: "pending",
      stylistId: "steve",
      stylistName: "Steve Hwang",
      assignedAutomatically: false,
      date: THURSDAY,
      time: "10:00 AM",
      totalTime: 60,
      total: 75 + 30, // director tier
    });
    expect(res.services).toEqual([
      { id: "mens-cut", name: "Men's Cut", price: 75 },
      { id: "beard-trim", name: "Beard Trim", price: 30 },
    ]);
    expect(new Date(res.holdExpiresAt).getTime()).toBe(NOW + 24 * 3_600_000);

    const booking = (await db.doc(`bookings/${res.bookingId}`).get()).data()!;
    expect(booking).toMatchObject({
      bookingType: "customer",
      status: "pending",
      stylistId: "steve",
      servicePrice: 105,
      serviceName: "Men's Cut + Beard Trim",
      activeTime: 60,
      totalTime: 60,
      consentGivenAt: new Date(NOW).toISOString(),
      notes: "Quiet chair please",
    });
    expect(booking.phases).toEqual([{ type: "active", minutes: 60 }]);
    const slot = (await db.doc(`slotBlocks/${res.bookingId}`).get()).data()!;
    expect(slot).toMatchObject({ stylistId: "steve", date: THURSDAY, time: "10:00 AM", status: "pending", totalTime: 60 });
    expect(slot.busy).toEqual([{ start: 600, end: 660 }]);
    expect(JSON.stringify(slot)).not.toMatch(/Jane|Citizen|04\d{8}/); // PII-free
  });

  it("creates the owner and stylist notifications and the visit record", async () => {
    const body = request();
    const res = await book(body);
    const notes = (await db.collection("notifications").get()).docs.map((d) => d.data());
    expect(notes.map((n) => n.recipientId).sort()).toEqual(["owner", "steve"]);
    expect(notes[0]).toMatchObject({ bookingId: res.bookingId, read: false });
    const lookup = (await db.doc(`customerLookups/${body.customerPhone}`).get()).data()!;
    expect(lookup).toMatchObject({ name: "Jane Citizen", lastVisit: THURSDAY, visitCount: 1 });
  });

  it("a retry with the same requestId returns the same booking and writes nothing new", async () => {
    const body = request({ requestId: "req_0123456789abcdefghij" });
    const first = await book(body);
    const again = await book(body);
    expect(again.bookingId).toBe(first.bookingId);
    expect(await count("bookings")).toBe(1);
    // somebody else's phone cannot replay it
    const other = await refusal({ ...body, customerPhone: "0499999999" });
    expect(other.code).toBe("invalid");
  });
});

describe("the server never trusts the client's price, phases or stylist details", () => {
  it("ignores a submitted price, totals, phases, stylist name and level", async () => {
    const res = await book(
      request({
        serviceIds: ["colour"],
        stylistId: "ethan", // junior
        servicePrice: 1,
        price: 1,
        total: 1,
        totalTime: 5,
        activeTime: 5,
        restTime: 0,
        phases: [{ type: "active", minutes: 5 }],
        services: [{ id: "colour", name: "Free", price: 0, phases: [{ type: "active", minutes: 5 }] }],
        stylistName: "Free Stylist",
        stylistLevel: "director",
        status: "confirmed",
        bookingType: "walkin",
      }),
    );
    expect(res.total).toBe(120); // junior colour, from the service record
    const b = (await db.doc(`bookings/${res.bookingId}`).get()).data()!;
    expect(b).toMatchObject({
      status: "pending",
      bookingType: "customer",
      stylistName: "Ethan Le",
      stylistLevel: "junior",
      servicePrice: 120,
      activeTime: 30,
      restTime: 30,
      totalTime: 60,
    });
    expect(b.phases).toEqual([{ type: "active", minutes: 30 }, { type: "rest", minutes: 30 }]);
    expect(b.services[0]).toMatchObject({ name: "Colour (Regrowth)", price: 120 });
    expect(b.returnTime).toBe("11:00 AM"); // the stylist is first due back when processing ends
  });

  it("takes a multi-phase service's phases from the service record", async () => {
    const res = await book(request({ serviceIds: ["perm"], stylistId: "steve", time: "10:00 AM" }));
    const b = (await db.doc(`bookings/${res.bookingId}`).get()).data()!;
    expect(b.phases).toEqual([
      { type: "active", minutes: 60 },
      { type: "rest", minutes: 30 },
      { type: "active", minutes: 30 },
    ]);
    expect(b.totalTime).toBe(120);
    const slot = (await db.doc(`slotBlocks/${res.bookingId}`).get()).data()!;
    expect(slot.busy).toEqual([{ start: 600, end: 660 }, { start: 690, end: 720 }]);
  });

  it("prices each tier from its own record (director 75, senior 65, junior 55)", async () => {
    const totals: Record<string, number> = {};
    for (const [stylistId, time] of [["steve", "10:00 AM"], ["yuto", "10:00 AM"], ["ethan", "10:00 AM"]] as const) {
      totals[stylistId] = (await book(request({ stylistId, time }))).total;
    }
    expect(totals).toEqual({ steve: 75, yuto: 65, ethan: 55 });
  });
});

describe("validation: every bad input is refused and nothing is written", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["a phone that is not an Australian mobile", { customerPhone: "0212345678" }, "invalid"],
    ["a phone with letters", { customerPhone: "04abcdefgh" }, "invalid"],
    ["a phone that is too short", { customerPhone: "041234567" }, "invalid"],
    ["a missing phone", { customerPhone: undefined }, "invalid"],
    ["a one-letter name", { customerName: "J" }, "invalid"],
    ["a name with digits", { customerName: "Jane 2" }, "invalid"],
    ["a name that is too long", { customerName: "a".repeat(101) }, "invalid"],
    ["a missing name", { customerName: undefined }, "invalid"],
    ["a name that is not text", { customerName: 42 }, "invalid"],
    ["a bad email", { customerEmail: "not-an-email" }, "invalid"],
    ["an oversized email", { customerEmail: `${"a".repeat(250)}@x.co` }, "invalid"],
    ["notes over the limit", { notes: "x".repeat(501) }, "invalid"],
    ["no consent", { consent: false }, "invalid"],
    ["consent as a string", { consent: "true" }, "invalid"],
    ["no services", { serviceIds: [] }, "invalid"],
    ["services that are not a list", { serviceIds: "mens-cut" }, "invalid"],
    ["too many services", { serviceIds: ["mens-cut", "ladies-cut", "beard-trim", "colour", "perm", "retired", "x"] }, "invalid"],
    ["a duplicated service", { serviceIds: ["mens-cut", "mens-cut"] }, "invalid"],
    ["a service id with a path in it", { serviceIds: ["../stylists/steve"] }, "invalid"],
    ["a service that does not exist", { serviceIds: ["ghost"] }, "invalid"],
    ["an inactive service", { serviceIds: ["retired"] }, "invalid"],
    ["a stylist that does not exist", { stylistId: "ghost" }, "invalid"],
    ["a stylist id with a path in it", { stylistId: "a/b" }, "invalid"],
    ["a missing stylist", { stylistId: undefined }, "invalid"],
    ["a malformed date", { date: "3/12/2026" }, "invalid"],
    ["an impossible date", { date: "2026-02-30" }, "invalid"],
    ["a malformed time", { time: "10am" }, "invalid"],
    ["a 24-hour time", { time: "14:00" }, "invalid"],
    ["a date in the past", { date: "2026-11-30" }, "closed"],
    ["a date more than a year ahead", { date: "2028-01-04" }, "closed"],
    ["a Monday (the salon is closed)", { date: MONDAY }, "closed"],
    ["a closure override (25 Dec)", { date: CHRISTMAS }, "closed"],
    ["before opening", { time: "9:00 AM" }, "closed"],
    ["running past closing", { time: "5:30 PM", serviceIds: ["ladies-cut"] }, "closed"],
    ["a start that is off the 15-minute grid", { time: "10:10 AM" }, "closed"],
  ];

  it.each(cases)("%s", async (_name, overrides, code) => {
    const body = { ...request(), ...overrides };
    const err = await refusal(body);
    expect(err.code).toBe(code);
    expect(err.message.length).toBeGreaterThan(5);
    expect(await count("bookings")).toBe(0);
    expect(await count("slotBlocks")).toBe(0);
  });

  it("refuses a body that is not an object", async () => {
    for (const bad of [null, undefined, "x", 7, []]) {
      expect((await refusal(bad)).code).toBe("invalid");
    }
  });

  it("accepts the spellings the form produces (spaces in the phone, lowercase time)", async () => {
    const res = await book(request({ customerPhone: "0412 345 678", time: "10:15 am", customerName: "  Jane Citizen " }));
    expect(res.time).toBe("10:15 AM");
    const b = (await db.doc(`bookings/${res.bookingId}`).get()).data()!;
    expect(b.customerPhone).toBe("0412345678");
    expect(b.customerName).toBe("Jane Citizen");
  });

  it("refuses a stylist who does not work that day (own working hours)", async () => {
    await db.doc("stylists/harry").update({
      workingHours: Object.fromEntries(
        ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, { isWorking: d !== "thu", start: 10, end: 18 }]),
      ),
    });
    expect((await refusal(request({ stylistId: "harry" }))).code).toBe("closed");
    expect((await book(request({ stylistId: "harry", date: FRIDAY }))).stylistId).toBe("harry");
  });

  it("refuses an inactive stylist", async () => {
    await db.doc("stylists/harry").update({ status: "inactive" });
    expect((await refusal(request({ stylistId: "harry" }))).code).toBe("invalid");
  });
});

describe("notice and the same-day cutoff run on Melbourne time", () => {
  const TODAY = "2026-12-01"; // Tuesday

  it("needs two hours' notice: at 09:00 the first bookable start today is 11:00", async () => {
    const soon = await refusal(request({ date: TODAY, time: "10:45 AM" }), { now: at(TODAY, "09:00") });
    expect(soon.code).toBe("closed");
    expect(soon.message).toMatch(/2 hours/);
    const ok = await book(request({ date: TODAY, time: "11:00 AM" }), { now: at(TODAY, "09:00") });
    expect(ok.date).toBe(TODAY);
  });

  it("the cutoff: 16:59 can still book a later start today, 17:00 closes today", async () => {
    // at 14:59 a 5:00 PM start is exactly 2 h 1 min away: fine
    const ok = await book(request({ date: TODAY, time: "5:00 PM", serviceIds: ["beard-trim"] }), { now: at(TODAY, "14:59") });
    expect(ok.time).toBe("5:00 PM");
    // at 15:00 the same start is exactly two hours away: still fine; at 15:01 it is too soon
    const soon = await refusal(request({ date: TODAY, time: "5:00 PM", serviceIds: ["beard-trim"] }), { now: at(TODAY, "15:01") });
    expect(soon.message).toMatch(/2 hours/);
    // at 17:00 the day is closed for online bookings, whatever the notice
    const after = await refusal(request({ date: TODAY, time: "5:45 PM", serviceIds: ["beard-trim"] }), { now: at(TODAY, "17:00") });
    expect(after.message).toMatch(/for today have closed/i);
    const justBefore = await refusal(request({ date: TODAY, time: "5:45 PM", serviceIds: ["beard-trim"] }), { now: at(TODAY, "16:59") });
    expect(justBefore.message).not.toMatch(/for today have closed/i);
  });

  it("is decided on Melbourne's date, not UTC's: 00:30 Melbourne is still the previous UTC day", async () => {
    // 00:30 on Wed 2 Dec Melbourne = 13:30Z on 1 Dec. "Today" must be 2 Dec.
    const now = at("2026-12-02", "00:30");
    const past = await refusal(request({ date: "2026-12-01" }), { now });
    expect(past.message).toMatch(/already passed/);
    const ok = await book(request({ date: "2026-12-02", time: "10:00 AM" }), { now });
    expect(ok.date).toBe("2026-12-02");
  });
});

describe('"Any Available Stylist"', () => {
  it("assigns a real stylist, recalculates the price from that stylist's tier and never stores 'any'", async () => {
    const res = await book(request({ stylistId: "any" }));
    expect(res.assignedAutomatically).toBe(true);
    expect(res.stylistId).not.toBe("any");
    const b = (await db.doc(`bookings/${res.bookingId}`).get()).data()!;
    expect(b.stylistId).toBe(res.stylistId);
    expect(b.stylistId).not.toBe("any");
    expect(b.stylistName).not.toMatch(/any/i);
    expect(b.assignedAutomatically).toBe(true);
    expect((await db.doc(`slotBlocks/${res.bookingId}`).get()).data()!.stylistId).toBe(res.stylistId);
    expect(res.total).toBe(75); // steve (director) has order 0 and an empty day
  });

  it("ties on bookings-that-day go to the lowest order", async () => {
    // all five idle -> steve (order 0); then steve is busy at 10:00 -> yuto
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("steve");
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("yuto");
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("elly");
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("ethan");
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("harry");
  });

  it("prefers the stylist with the FEWEST bookings that day, even over a lower order", async () => {
    // steve and yuto each already have a booking that day, in other hours; elly has none
    await seedBooking(db, "b-steve", { stylistId: "steve", time: "2:00 PM" });
    await seedBooking(db, "b-yuto", { stylistId: "yuto", stylistName: "Yuto Hirakawa", stylistLevel: "senior", time: "2:00 PM" });
    await seedBooking(db, "b-yuto2", { stylistId: "yuto", stylistName: "Yuto Hirakawa", stylistLevel: "senior", time: "3:00 PM" });
    await seedBooking(db, "b-ethan", { stylistId: "ethan", stylistName: "Ethan Le", stylistLevel: "junior", time: "2:00 PM" });
    await seedBooking(db, "b-harry", { stylistId: "harry", stylistName: "Harry Yang", stylistLevel: "junior", time: "2:00 PM" });
    const res = await book(request({ stylistId: "any", time: "10:00 AM" }));
    expect(res.stylistId).toBe("elly");
    expect(res.total).toBe(65); // senior price
  });

  it("only counts bookings that hold a chair: cancelled ones do not tip the balance", async () => {
    await seedBooking(db, "c1", { stylistId: "steve", time: "2:00 PM", status: "cancelled" });
    await seedBooking(db, "c2", { stylistId: "steve", time: "3:00 PM", status: "cancelled" });
    await seedBooking(db, "b-yuto", { stylistId: "yuto", stylistName: "Yuto Hirakawa", stylistLevel: "senior", time: "2:00 PM" });
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("steve");
  });

  it("skips stylists who are not free for ALL the booking's busy segments (a return phase in the way)", async () => {
    // steve is busy 11:30-12:00. A perm at 10:00 is active 10:00-11:00, rest, then active 11:30-12:00:
    // the first hands-on block misses steve's booking but the RETURN block collides with it.
    await seedBooking(db, "steve-late", { stylistId: "steve", time: "11:30 AM", activeTime: 30, totalTime: 30 });
    for (const s of ["yuto", "elly", "ethan"]) {
      await seedBooking(db, `fill-${s}`, { stylistId: s, stylistName: s, stylistLevel: "senior", time: "10:00 AM", activeTime: 15, totalTime: 15 });
    }
    const res = await book(request({ stylistId: "any", serviceIds: ["perm"], time: "10:00 AM" }));
    expect(res.stylistId).toBe("harry"); // steve's return block clashes; yuto/elly/ethan busy at 10:00
  });

  it("may use a stylist's processing gap for a hands-on-only booking", async () => {
    // steve has a colour 10:00-11:00 (active 10:00-10:30, processing to 11:00). A 15-minute beard trim
    // at 10:30 fits steve's gap, and steve has the fewest... all tie at 0 vs steve's 1 -> others win;
    // block everyone else to prove the gap is usable.
    await seedBooking(db, "steve-colour", { stylistId: "steve", time: "10:00 AM", serviceId: "colour", activeTime: 30, restTime: 30, totalTime: 60, phases: [{ type: "active", minutes: 30 }, { type: "rest", minutes: 30 }] });
    for (const s of ["yuto", "elly", "ethan", "harry"]) {
      await seedBooking(db, `block-${s}`, { stylistId: s, stylistName: s, stylistLevel: "senior", time: "10:00 AM", activeTime: 60, totalTime: 60 });
    }
    // 10:30 beard trim ends at 10:45 <= steve's return at 11:00
    const res = await book(request({ stylistId: "any", serviceIds: ["beard-trim"], time: "10:30 AM" }));
    expect(res.stylistId).toBe("steve");
  });

  it("fails cleanly when no stylist is free, writing nothing", async () => {
    for (const s of ["steve", "yuto", "elly", "ethan", "harry"]) {
      await seedBooking(db, `busy-${s}`, { stylistId: s, stylistName: s, time: "10:00 AM", activeTime: 60, totalTime: 60 });
    }
    const before = await count("bookings");
    const err = await refusal(request({ stylistId: "any", time: "10:15 AM" }));
    expect(err.code).toBe("slot-taken");
    expect(err.message).toMatch(/just taken/);
    expect(await count("bookings")).toBe(before);
    expect(await count("slotBlocks")).toBe(before);
    expect(await count("notifications")).toBe(0);
  });

  it("ignores a legacy booking stored under stylistId 'any' (it blocks nobody in particular)", async () => {
    await seedBooking(db, "legacy", { stylistId: "any", stylistName: "Any available stylist", time: "10:00 AM" });
    expect((await book(request({ stylistId: "any" }))).stylistId).toBe("steve");
  });
});

describe("races and conflicts", () => {
  it("two simultaneous requests for one stylist and slot create exactly one booking", async () => {
    const results = await Promise.allSettled([
      book(request({ stylistId: "yuto" })),
      book(request({ stylistId: "yuto" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as CommandError).code).toBe("slot-taken");
    expect(await count("bookings")).toBe(1);
    expect(await count("slotBlocks")).toBe(1);
  });

  it("eight simultaneous requests for one slot: exactly one wins, seven are refused, one booking exists", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => book(request({ stylistId: "steve" }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as CommandError).code).toBe("slot-taken");
    }
    expect(await count("bookings")).toBe(1);
  });

  it("seven simultaneous 'any' requests for one time: five stylists take five, two are refused", async () => {
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => book(request({ stylistId: "any" }))));
    const ok = results.filter((r): r is PromiseFulfilledResult<BookingRequestResult> => r.status === "fulfilled");
    expect(ok).toHaveLength(5);
    expect(new Set(ok.map((r) => r.value.stylistId)).size).toBe(5); // five different stylists
    expect(await count("bookings")).toBe(5);
  });

  it("overlapping (not identical) simultaneous requests: only one of two overlapping bookings", async () => {
    const results = await Promise.allSettled([
      book(request({ stylistId: "elly", time: "10:00 AM", serviceIds: ["ladies-cut"] })),
      book(request({ stylistId: "elly", time: "10:30 AM", serviceIds: ["mens-cut"] })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("a request colliding with an existing admin booking is refused", async () => {
    await seedBooking(db, "walkin-1", { stylistId: "steve", time: "10:00 AM", totalTime: 60, activeTime: 60 });
    const err = await refusal(request({ stylistId: "steve", time: "10:30 AM" }));
    expect(err.code).toBe("slot-taken");
    // and an adjacent one is fine
    expect((await book(request({ stylistId: "steve", time: "11:00 AM" }))).time).toBe("11:00 AM");
  });

  it("a cancelled booking does not block the slot", async () => {
    await seedBooking(db, "gone", { stylistId: "steve", time: "10:00 AM", status: "cancelled" });
    expect((await book(request({ stylistId: "steve" }))).stylistId).toBe("steve");
  });

  it("a pending request holds its slot immediately", async () => {
    await book(request({ stylistId: "steve" }));
    expect((await refusal(request({ stylistId: "steve" }))).code).toBe("slot-taken");
  });
});

describe("blocked clients (DEC-039)", () => {
  it("are refused with a generic message and nothing is written", async () => {
    const body = request();
    await db.doc(`customerLookups/${body.customerPhone}`).set({ name: "Blocked Person", lastVisit: "", visitCount: 0, blocked: true });
    const err = await refusal(body);
    expect(err.code).toBe("blocked");
    expect(err.message).toBe("Please call the salon to book");
    expect(await count("bookings")).toBe(0);
    expect(await count("slotBlocks")).toBe(0);
    expect(await count("notifications")).toBe(0);
    // the flag is untouched
    expect((await db.doc(`customerLookups/${body.customerPhone}`).get()).get("blocked")).toBe(true);
  });

  it("an ordinary imported client (blocked false or absent) books normally and keeps the record", async () => {
    const body = request();
    await db.doc(`customerLookups/${body.customerPhone}`).set({ name: "Imported", lastVisit: "", visitCount: 0 });
    await book(body);
    expect((await db.doc(`customerLookups/${body.customerPhone}`).get()).data()).toMatchObject({ visitCount: 1, lastVisit: THURSDAY });
  });

  it("a later request keeps a blocked flag set after a booking merge", async () => {
    const body = request();
    await db.doc(`customerLookups/${body.customerPhone}`).set({ name: "X", lastVisit: "", visitCount: 0, blocked: false });
    await book(body);
    expect((await db.doc(`customerLookups/${body.customerPhone}`).get()).get("blocked")).toBe(false);
  });
});

describe("the pending limit (2 per phone number)", () => {
  it("allows two open requests and refuses the third", async () => {
    const phone = "0411111111";
    await book(request({ customerPhone: phone, time: "10:00 AM" }));
    await book(request({ customerPhone: phone, time: "11:00 AM" }));
    const err = await refusal(request({ customerPhone: phone, time: "12:00 PM" }));
    expect(err.code).toBe("limit");
    expect(err.message).toMatch(/already have 2/);
    expect(await count("bookings")).toBe(2);
  });

  it("holds under concurrency: five simultaneous requests from one phone leave exactly two", async () => {
    const phone = "0422222222";
    const times = ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM"];
    const results = await Promise.allSettled(times.map((time, i) => book(request({ customerPhone: phone, time, stylistId: ["steve", "yuto", "elly", "ethan", "harry"][i] }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await count("bookings")).toBe(2);
  });

  it("only PENDING requests count: a confirmed or declined one frees a place", async () => {
    const phone = "0433333333";
    const a = await book(request({ customerPhone: phone, time: "10:00 AM" }));
    await book(request({ customerPhone: phone, time: "11:00 AM" }));
    await db.doc(`bookings/${a.bookingId}`).update({ status: "confirmed" });
    expect((await book(request({ customerPhone: phone, time: "12:00 PM" }))).time).toBe("12:00 PM");
  });

  it("is per phone number: another number is unaffected", async () => {
    await book(request({ customerPhone: "0444444444", time: "10:00 AM" }));
    await book(request({ customerPhone: "0444444444", time: "11:00 AM" }));
    expect((await book(request({ customerPhone: "0455555555", time: "12:00 PM" }))).time).toBe("12:00 PM");
  });
});

describe("rate limits (per phone and per address)", () => {
  it("limits attempts per phone number, counting refused attempts too, then resets next window", async () => {
    const phone = "0466666666";
    for (let i = 0; i < LIMITS.bookingPerPhone.max; i++) {
      const err = await refusal(request({ customerPhone: phone, date: MONDAY })); // refused: closed
      expect(err.code).toBe("closed");
    }
    const limited = await refusal(request({ customerPhone: phone, date: MONDAY }));
    expect(limited.code).toBe("rate-limited");
    // a different phone is unaffected
    expect((await book(request())).status).toBe("pending");
    // an hour later the window has rolled over
    const later = { now: NOW + LIMITS.bookingPerPhone.windowMs + 1000 };
    expect((await refusal(request({ customerPhone: phone, date: MONDAY }), later)).code).toBe("closed");
  });

  it("limits attempts per address", async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < LIMITS.bookingPerIp.max; i++) {
      await refusal(request({ customerName: "J" }), { now: NOW, ip }); // even malformed ones count
    }
    expect((await refusal(request(), { now: NOW, ip })).code).toBe("rate-limited");
    expect((await book(request(), { now: NOW, ip: "203.0.113.10" })).status).toBe("pending");
  });

  it("stores no phone number or address in the rate-limit documents", async () => {
    await refusal(request({ customerPhone: "0477777777", date: MONDAY }), { now: NOW, ip: "198.51.100.7" });
    const docs = (await db.collection("rateLimits").get()).docs;
    expect(docs.length).toBeGreaterThan(0);
    for (const d of docs) {
      expect(d.id + JSON.stringify(d.data())).not.toMatch(/0477777777|198\.51\.100\.7/);
    }
  });
});
