// e2e/seed.ts
// Resets the Firestore + Auth EMULATORS to a known salon: five stylists, a
// handful of services (including a colour with a rest period), opening hours
// with Monday closed, and one owner login. Test data only - nothing here can
// reach a real project (project id is demo-sua-e2e, host is the emulator).
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

export const PROJECT_ID = "demo-sua-e2e";
export const OWNER_EMAIL = "owner@suahair.test";
export const OWNER_PASSWORD = "E2e-owner-pass-1";

const AUTH = "http://127.0.0.1:9099";

export const STYLISTS = [
  { id: "steve", name: "Steve Hwang", role: "Director", level: "director", isTrainer: true },
  { id: "yuto", name: "Yuto Hirakawa", role: "Senior Stylist", level: "senior", isTrainer: false },
  { id: "elly", name: "Elly Lee", role: "Senior Stylist", level: "senior", isTrainer: false },
  { id: "ethan", name: "Ethan Le", role: "Junior Stylist", level: "junior", isTrainer: false },
  { id: "harry", name: "Harry Yang", role: "Junior Stylist", level: "junior", isTrainer: false },
] as const;

const tier = (director: number, senior: number, junior: number) => ({
  director,
  senior,
  junior,
});

export const SERVICES = [
  { id: "mens-cut", name: "Men's Cut", category: "cut", activeTime: 45, restTime: 0, price: tier(75, 65, 55) },
  { id: "ladies-cut", name: "Ladies Cut", category: "cut", activeTime: 60, restTime: 0, price: tier(95, 85, 75) },
  { id: "beard-trim", name: "Beard Trim", category: "cut", activeTime: 20, restTime: 0, price: tier(30, 25, 20) },
  { id: "fringe-trim", name: "Fringe Trim", category: "cut", activeTime: 15, restTime: 0, price: tier(20, 15, 15) },
  { id: "colour-regrowth", name: "Colour (Regrowth)", category: "colour", activeTime: 30, restTime: 30, price: tier(160, 140, 120) },
  { id: "balayage", name: "Balayage / Highlights", category: "colour", activeTime: 60, restTime: 45, price: tier(300, 260, 220) },
  // Three phases: hands-on 60, processing 30, then the stylist RETURNS for 30 more
  {
    id: "digital-perm", name: "Digital Perm", category: "perm", activeTime: 90, restTime: 30,
    phases: [
      { type: "active", minutes: 60 },
      { type: "rest", minutes: 30 },
      { type: "active", minutes: 30 },
    ],
    price: tier(300, 260, 220),
  },
] as const;

/** Gives an Auth-emulator account custom claims, as the Admin SDK's
 *  setCustomUserClaims would in production (roles are claims, DEC-033). The
 *  next sign-in carries them in the ID token the rules read. */
export async function setClaims(
  uid: string,
  claims: Record<string, string>,
): Promise<void> {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer owner" },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    },
  );
  if (!res.ok) throw new Error(`Auth emulator setClaims failed: ${res.status}`);
}

async function createOwnerLogin(): Promise<string> {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE",
  });
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`Auth emulator signUp failed: ${res.status}`);
  return ((await res.json()) as { localId: string }).localId;
}

export async function connectEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8085 },
  });
}

/** Wipes both emulators and writes the baseline salon. */
export async function seedEmulator(env?: RulesTestEnvironment): Promise<void> {
  const testEnv = env ?? (await connectEnv());
  const ownerUid = await createOwnerLogin();
  await setClaims(ownerUid, { role: "owner" });
  await testEnv.clearFirestore();
  const now = new Date().toISOString();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${ownerUid}`).set({ role: "owner" });
    for (const s of STYLISTS) {
      await db.doc(`stylists/${s.id}`).set({
        name: s.name,
        role: s.role,
        level: s.level,
        status: "active",
        isTrainer: s.isTrainer,
        startDate: "2024-01-01",
        createdAt: now,
      });
    }
    let order = 0;
    for (const s of SERVICES) {
      await db.doc(`services/${s.id}`).set({
        name: s.name,
        category: s.category,
        activeTime: s.activeTime,
        restTime: s.restTime,
        totalTime: s.activeTime + s.restTime,
        ...("phases" in s ? { phases: s.phases } : {}),
        price: s.price,
        status: "active",
        sortOrder: order++,
        priceHistory: [
          { price: s.price, effectiveFrom: "2024-01-01", recordedAt: now },
        ],
        createdAt: now,
      });
    }
    const open = { isOpen: true, open: 10, close: 18 };
    await db.doc("salonSettings/main").set({
      weeklySchedule: {
        sun: open,
        mon: { isOpen: false, open: 10, close: 18 },
        tue: open,
        wed: open,
        thu: open,
        fri: open,
        sat: open,
      },
      dateOverrides: {},
    });
  });
  if (!env) await testEnv.cleanup();
}

/** Reads every document in a collection straight from the emulator (rules bypassed). */
export async function readCollection(
  name: string,
): Promise<Array<{ id: string } & Record<string, unknown>>> {
  const env = await connectEnv();
  try {
    let out: Array<{ id: string } & Record<string, unknown>> = [];
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection(name).get();
      out = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    return out;
  } finally {
    await env.cleanup();
  }
}

/** Writes a booking + slotBlock straight into the emulator (rules bypassed). */
export async function insertBooking(
  id: string,
  booking: Record<string, unknown>,
): Promise<void> {
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`bookings/${id}`).set(booking);
      await db.doc(`slotBlocks/${id}`).set({
        stylistId: booking.stylistId,
        date: booking.date,
        time: booking.time,
        activeTime: booking.activeTime,
        totalTime: booking.totalTime,
        restTime: booking.restTime,
        status: booking.status,
      });
    });
  } finally {
    await env.cleanup();
  }
}

/** Writes a booking WITH phases, plus its PII-free slotBlock (busy blocks and the
 *  return point derived from the phases). Rules bypassed. `time` is minutes from
 *  midnight for the first phase; `phases` are {type, minutes}. */
export async function insertPhasedBooking(
  id: string,
  booking: Record<string, unknown>,
  startMinutes: number,
  phases: { type: "active" | "rest"; minutes: number }[],
): Promise<void> {
  let at = startMinutes;
  const segments = phases.map((p) => {
    const seg = { type: p.type, start: at, end: at + p.minutes };
    at += p.minutes;
    return seg;
  });
  const busy = segments.filter((s) => s.type === "active").map((s) => ({ start: s.start, end: s.end }));
  const last = segments[segments.length - 1];
  const activeTime = phases.filter((p) => p.type === "active").reduce((n, p) => n + p.minutes, 0);
  const restTime = phases.filter((p) => p.type === "rest").reduce((n, p) => n + p.minutes, 0);
  const firstRest = segments.find((s) => s.type === "rest");
  const full = {
    ...booking,
    phases,
    segments,
    activeTime,
    restTime,
    totalTime: activeTime + restTime,
    ...(firstRest ? { returnTime: clock(firstRest.end) } : {}),
  };
  const env = await connectEnv();
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`bookings/${id}`).set(full);
      await db.doc(`slotBlocks/${id}`).set({
        stylistId: full.stylistId,
        date: full.date,
        time: full.time,
        activeTime,
        totalTime: activeTime + restTime,
        restTime,
        status: full.status,
        busy,
        returnAt: last && last.type === "rest" ? last.end : null,
      });
    });
  } finally {
    await env.cleanup();
  }
}

const clock = (m: number): string => {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
