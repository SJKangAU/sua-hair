// tests/firestore/adminSlotClaims.test.ts
// ─────────────────────────────────────────────────────────────────────────
// The other admin writes that CLAIM a slot — restoring a cancelled booking
// (defect D2), rescheduling, training sessions — against the real Firestore
// emulator with the real security rules. Run via `npm run test:admin`.
// Creation of walk-ins/breaks is covered in adminBookings.test.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import {
  createAdminBooking,
  updateBookingWithSlotLock,
  writeStatusChange,
} from "../../src/lib/adminBookingWrites";
import { BookingConflictError } from "../../src/lib/bookingConflicts";
import { buildStatusPatch } from "../../src/lib/statusPatch";
import type { Booking } from "../../src/types";
import { createTestEnv } from "./testEnv";
import { seed as seedIn, staffDb as staffDbIn, walkin } from "./adminHelpers";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await createTestEnv();
});
afterAll(async () => {
  await testEnv.cleanup();
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});

const staffDb = (uid?: string) => staffDbIn(testEnv, uid);
const seed = (id: string, overrides: Partial<Booking> = {}) =>
  seedIn(testEnv, id, overrides);

async function load(id: string): Promise<Booking> {
  const snap = await getDoc(doc(staffDb(), "bookings", id));
  return { id, ...snap.data() } as Booking;
}

/** The real status-change write path used by the admin UI. */
async function changeStatus(
  db: Firestore,
  id: string,
  status: Booking["status"],
): Promise<void> {
  const previous = await load(id);
  const { patch } = buildStatusPatch(previous, status);
  await writeStatusChange(db, previous, status, patch);
}

describe("D2 — restoring a cancelled booking re-checks the slot", () => {
  it("cancel then restore puts the booking and its slotBlock back", async () => {
    await seed("a", { time: "10:00 AM", status: "confirmed" });
    const db = staffDb();

    await changeStatus(db, "a", "cancelled");
    expect((await load("a")).status).toBe("cancelled");
    expect((await getDoc(doc(db, "slotBlocks/a"))).data()?.status).toBe(
      "cancelled",
    );
    expect((await load("a")).restoreStatus).toBe("confirmed");

    await changeStatus(db, "a", "confirmed");
    const restored = await load("a");
    expect(restored.status).toBe("confirmed");
    expect(restored.restoreStatus).toBeUndefined();
    expect((await getDoc(doc(db, "slotBlocks/a"))).data()?.status).toBe(
      "confirmed",
    );
  });

  it("restore is refused when someone has booked the slot meanwhile", async () => {
    await seed("a", { time: "10:00 AM", status: "confirmed" });
    const db = staffDb();
    await changeStatus(db, "a", "cancelled");
    await createAdminBooking(db, walkin({ customerName: "Took the slot" }));

    await expect(changeStatus(db, "a", "confirmed")).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    // Still cancelled, in both collections
    expect((await load("a")).status).toBe("cancelled");
    expect((await getDoc(doc(db, "slotBlocks/a"))).data()?.status).toBe(
      "cancelled",
    );
  });

  it("restore works when the neighbouring booking only touches the edge", async () => {
    await seed("a", { time: "10:00 AM" });
    const db = staffDb();
    await changeStatus(db, "a", "cancelled");
    await createAdminBooking(db, walkin({ time: "11:00 AM" }));
    await changeStatus(db, "a", "confirmed");
    expect((await load("a")).status).toBe("confirmed");
  });

  it("restoring a no-show is checked the same way", async () => {
    await seed("a", { time: "10:00 AM" });
    const db = staffDb();
    await changeStatus(db, "a", "no_show");
    await createAdminBooking(db, walkin({ customerName: "Took the slot" }));
    await expect(changeStatus(db, "a", "confirmed")).rejects.toBeInstanceOf(
      BookingConflictError,
    );
  });

  it("two cancelled bookings for the same slot restored at once: exactly one comes back", async () => {
    await seed("a", { time: "10:00 AM", status: "cancelled" });
    await seed("b", { time: "10:00 AM", status: "cancelled" });
    const results = await Promise.allSettled([
      changeStatus(staffDb("admin-a"), "a", "confirmed"),
      changeStatus(staffDb("admin-b"), "b", "confirmed"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const statuses = [(await load("a")).status, (await load("b")).status].sort();
    expect(statuses).toEqual(["cancelled", "confirmed"]);
  });

  it("a restore racing a new walk-in for the same slot: exactly one wins", async () => {
    await seed("a", { time: "10:00 AM", status: "cancelled" });
    const results = await Promise.allSettled([
      changeStatus(staffDb("admin-a"), "a", "confirmed"),
      createAdminBooking(staffDb("admin-b"), walkin()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const snap = await getDocs(collection(staffDb(), "bookings"));
    const live = snap.docs.filter(
      (d) => !["cancelled", "no_show"].includes(d.data().status),
    );
    expect(live).toHaveLength(1);
  });

  it("cancelling is never blocked by the conflict check", async () => {
    await seed("a", { time: "10:00 AM" });
    await seed("b", { time: "10:00 AM" }); // a pre-existing clash
    await changeStatus(staffDb(), "a", "cancelled");
    expect((await load("a")).status).toBe("cancelled");
  });
});

describe("rescheduling is lock-protected and conflict-checked", () => {
  const probeFor = (b: Booking, over: Partial<Booking> = {}) => ({
    stylistId: b.stylistId,
    date: b.date,
    time: b.time,
    totalTime: b.totalTime,
    activeTime: b.activeTime,
    ...over,
  });

  it("moving into an occupied slot is refused and nothing changes", async () => {
    await seed("a", { time: "10:00 AM" });
    await seed("b", { time: "12:00 PM" });
    const b = await load("b");
    await expect(
      updateBookingWithSlotLock(
        staffDb(),
        "b",
        probeFor(b, { time: "10:30 AM" }),
        { time: "10:30 AM" },
        { time: "10:30 AM" },
      ),
    ).rejects.toBeInstanceOf(BookingConflictError);
    expect((await load("b")).time).toBe("12:00 PM");
    expect((await getDoc(doc(staffDb(), "slotBlocks/b"))).data()?.time).toBe(
      "12:00 PM",
    );
  });

  it("moving into free time updates the booking and its slotBlock", async () => {
    await seed("a", { time: "10:00 AM" });
    const a = await load("a");
    await updateBookingWithSlotLock(
      staffDb(),
      "a",
      probeFor(a, { time: "2:00 PM" }),
      { time: "2:00 PM" },
      { time: "2:00 PM" },
    );
    expect((await load("a")).time).toBe("2:00 PM");
    expect((await getDoc(doc(staffDb(), "slotBlocks/a"))).data()?.time).toBe(
      "2:00 PM",
    );
  });

  it("a booking shifted slightly does not clash with its own old slot", async () => {
    await seed("a", { time: "10:00 AM" });
    const a = await load("a");
    await updateBookingWithSlotLock(
      staffDb(),
      "a",
      probeFor(a, { time: "10:30 AM" }),
      { time: "10:30 AM" },
      { time: "10:30 AM" },
    );
    expect((await load("a")).time).toBe("10:30 AM");
  });

  it("a move racing a walk-in for the same slot: exactly one wins", async () => {
    await seed("a", { time: "12:00 PM" });
    const a = await load("a");
    const results = await Promise.allSettled([
      updateBookingWithSlotLock(
        staffDb("admin-a"),
        "a",
        probeFor(a, { time: "10:00 AM" }),
        { time: "10:00 AM" },
        { time: "10:00 AM" },
      ),
      createAdminBooking(staffDb("admin-b"), walkin({ time: "10:00 AM" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("concurrency that is NOT a conflict still all succeeds", () => {
  it("five admins saving five different non-overlapping times all succeed", async () => {
    const times = ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM"];
    const results = await Promise.allSettled(
      times.map((time, i) =>
        createAdminBooking(staffDb(`admin-${i}`), walkin({ time })),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(5).fill("fulfilled"));
    const snap = await getDocs(collection(staffDb(), "bookings"));
    expect(snap.size).toBe(5);
  });
});

describe("training sessions go through the same guarded write", () => {
  it("a second training session in the same trainer slot is refused", async () => {
    const training = (over: Partial<Booking> = {}) =>
      walkin({
        bookingType: "training",
        customerName: "Trainee",
        serviceId: "training",
        serviceName: "Colour theory",
        servicePrice: 0,
        trainingTopic: "Colour theory",
        time: "7:00 PM",
        ...over,
      });
    const db = staffDb();
    await createAdminBooking(db, training());
    await expect(createAdminBooking(db, training())).rejects.toThrow(
      /a training session \(Colour theory\)/,
    );
  });
});
