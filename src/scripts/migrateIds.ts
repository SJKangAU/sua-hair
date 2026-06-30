// migrateIds.ts
// ONE-TIME MIGRATION — Re-creates stylists and services with human-readable IDs
// and wipes all existing booking documents (clean slate).
//
// Naming conventions applied:
//   stylists/  lastname-firstname        e.g. hwang-steve
//   services/  category-slug            e.g. cut-mens, colour-balayage
//   bookings/  BK-YYYYMMDD-stylist-HHMM e.g. BK-20260628-hwang-steve-1000
//              WI-YYYYMMDD-stylist-HHMM  walk-ins
//              BR-YYYYMMDD-stylist-HHMM  break blocks
//
// Run with: npx tsx src/scripts/migrateIds.ts
//
// WARNING: permanently deletes ALL booking history and re-creates stylists
// and services from the values hardcoded below.

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  setDoc,
  doc,
} from "firebase/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const deleteCollection = async (name: string) => {
  const snap = await getDocs(collection(db, name));
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    console.log(`   🗑  ${name}/${d.id}`);
  }
};

// ── Stylists: lastname-firstname ──────────────────────────────────────────────
const STYLISTS = [
  {
    id: "hwang-steve",
    name: "Steve Hwang",
    role: "Director",
    level: "director",
    status: "active",
    instagram: "suahairstudio",
    startDate: "2013-01-01",
    isTrainer: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "hirakawa-yuto",
    name: "Yuto Hirakawa",
    role: "Senior Stylist",
    level: "senior",
    status: "active",
    instagram: "suahair_yuto",
    startDate: "2025-01-01",
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lee-elly",
    name: "Elly Lee",
    role: "Senior Stylist",
    level: "senior",
    status: "active",
    instagram: "suahair_elly",
    startDate: "2025-01-01",
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "le-ethan",
    name: "Ethan Le",
    role: "Junior Stylist",
    level: "junior",
    status: "active",
    instagram: "suahair_ethanl",
    startDate: "2024-01-01",
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "yang-harry",
    name: "Harry Yang",
    role: "Junior Stylist",
    level: "junior",
    status: "active",
    instagram: "suahair_harry",
    startDate: "2025-01-01",
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
];

// ── Services: category-slug ───────────────────────────────────────────────────
// sortOrder controls display order in the booking flow accordion
const SERVICES = [
  {
    id: "cut-mens",
    name: "Men's Cut",
    category: "cut",
    sortOrder: 10,
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 75, senior: 65, junior: 65 },
    status: "active",
    priceHistory: [{ price: { director: 75, senior: 65, junior: 65 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "cut-ladies",
    name: "Ladies Cut",
    category: "cut",
    sortOrder: 20,
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
    price: { director: 95, senior: 85, junior: 85 },
    status: "active",
    priceHistory: [{ price: { director: 95, senior: 85, junior: 85 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "cut-skin-fade",
    name: "Skin/Zero Fade",
    category: "cut",
    sortOrder: 30,
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 80, senior: 70, junior: 70 },
    status: "active",
    priceHistory: [{ price: { director: 80, senior: 70, junior: 70 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "colour-regrowth",
    name: "Colour (Regrowth)",
    category: "colour",
    sortOrder: 40,
    activeTime: 30,
    restTime: 30,
    totalTime: 60,
    price: { director: 150, senior: 130, junior: 130 },
    status: "active",
    priceHistory: [{ price: { director: 150, senior: 130, junior: 130 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "colour-balayage",
    name: "Balayage / Highlights",
    category: "colour",
    sortOrder: 50,
    activeTime: 60,
    restTime: 45,
    totalTime: 105,
    price: { director: 450, senior: 400, junior: 400 },
    status: "active",
    priceHistory: [{ price: { director: 450, senior: 400, junior: 400 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "styling-blow-wave",
    name: "Blow Wave",
    category: "styling",
    sortOrder: 60,
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 80, senior: 70, junior: 70 },
    status: "active",
    priceHistory: [{ price: { director: 80, senior: 70, junior: 70 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "treatment-olaplex",
    name: "Olaplex Treatment",
    category: "treatment",
    sortOrder: 70,
    activeTime: 20,
    restTime: 20,
    totalTime: 40,
    price: { director: 50, senior: 50, junior: 50 },
    status: "active",
    priceHistory: [{ price: { director: 50, senior: 50, junior: 50 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "grooming-beard-trim",
    name: "Beard Trim",
    category: "grooming",
    sortOrder: 80,
    activeTime: 20,
    restTime: 0,
    totalTime: 20,
    price: { director: 30, senior: 30, junior: 30 },
    status: "active",
    priceHistory: [{ price: { director: 30, senior: 30, junior: 30 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "grooming-fringe-trim",
    name: "Fringe Trim",
    category: "grooming",
    sortOrder: 90,
    activeTime: 15,
    restTime: 0,
    totalTime: 15,
    price: { director: 30, senior: 30, junior: 30 },
    status: "active",
    priceHistory: [{ price: { director: 30, senior: 30, junior: 30 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    id: "perm-digital",
    name: "Digital Perm",
    category: "perm",
    sortOrder: 100,
    activeTime: 60,
    restTime: 60,
    totalTime: 120,
    price: { director: 380, senior: 350, junior: 350 },
    status: "active",
    priceHistory: [{ price: { director: 380, senior: 350, junior: 350 }, effectiveFrom: "2024-01-01", recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
];

// ── Migration ─────────────────────────────────────────────────────────────────
const migrate = async () => {
  console.log("⚠️  WARNING: This permanently deletes ALL bookings and re-creates");
  console.log("    stylists and services with new human-readable IDs.\n");

  console.log("Step 1/5 — Deleting all booking documents...");
  await deleteCollection("bookings");
  console.log("   ✅ Bookings cleared\n");

  console.log("Step 2/5 — Deleting existing stylists...");
  await deleteCollection("stylists");
  console.log("   ✅ Stylists cleared\n");

  console.log("Step 3/5 — Deleting existing services...");
  await deleteCollection("services");
  console.log("   ✅ Services cleared\n");

  console.log("Step 4/5 — Creating stylists with new IDs...");
  for (const { id, ...data } of STYLISTS) {
    await setDoc(doc(db, "stylists", id), data);
    console.log(`   ✅ stylists/${id}  (${data.name})`);
  }

  console.log("\nStep 5/5 — Creating services with new IDs...");
  for (const { id, ...data } of SERVICES) {
    await setDoc(doc(db, "services", id), data);
    console.log(`   ✅ services/${id}  (${data.name})`);
  }

  console.log("\n🎉 Migration complete!");
  console.log("\nNew naming conventions going forward:");
  console.log("  stylists/  lastname-firstname        hwang-steve, lee-elly");
  console.log("  services/  category-slug             cut-mens, colour-balayage");
  console.log("  bookings/  BK-YYYYMMDD-stylist-HHMM  BK-20260628-hwang-steve-1000");
  console.log("             WI-YYYYMMDD-stylist-HHMM  walk-ins");
  console.log("             BR-YYYYMMDD-stylist-HHMM  break blocks");
  process.exit(0);
};

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
