// seedFirestore.ts
// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME SEED SCRIPT
// Populates Firestore with initial stylists and services data
// Run once with: npx tsx src/scripts/seedFirestore.ts
// DO NOT run again after initial setup — it will create duplicates
// To reset: manually delete the stylists and services collections in Firebase
// console first, then re-run
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';
import * as dotenv from 'dotenv';

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

// ── Stylists ──────────────────────────────────────────────────────────────────
const STYLISTS = [
  {
    name: 'Steve Hwang',
    role: 'Director/Master Stylist',
    level: 'director',
    status: 'active',
    instagram: 'suahairstudio',
    startDate: '2013-01-01',
    isTrainer: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Yuto Hirakawa',
    role: 'Senior Stylist',
    level: 'senior',
    status: 'active',
    instagram: 'suahair_yuto',
    startDate: '2025-01-01',
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Elly Lee',
    role: 'Senior Stylist',
    level: 'senior',
    status: 'active',
    instagram: 'suahair_elly',
    startDate: '2025-01-01',
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Ethan Le',
    role: 'Junior Stylist',
    level: 'junior',
    status: 'active',
    instagram: 'suahair_ethanl',
    startDate: '2024-01-01',
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Harry Yang',
    role: 'Junior Stylist',
    level: 'junior',
    status: 'active',
    instagram: 'suahair_harry',
    startDate: '2025-01-01',
    isTrainer: false,
    createdAt: new Date().toISOString(),
  },
];

// ── Services (tiered pricing by stylist level) ────────────────────────────────
const SERVICES = [
  {
    name: "Men's Cut",
    category: 'cut',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 75, senior: 65, junior: 65 },
    status: 'active',
    priceHistory: [{ price: { director: 75, senior: 65, junior: 65 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: "Ladies Cut",
    category: 'cut',
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
    price: { director: 95, senior: 85, junior: 85 },
    status: 'active',
    priceHistory: [{ price: { director: 95, senior: 85, junior: 85 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Skin/Zero Fade',
    category: 'cut',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 80, senior: 70, junior: 70 },
    status: 'active',
    priceHistory: [{ price: { director: 80, senior: 70, junior: 70 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Blow Wave',
    category: 'styling',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: { director: 80, senior: 70, junior: 70 },
    status: 'active',
    priceHistory: [{ price: { director: 80, senior: 70, junior: 70 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Beard Trim',
    category: 'grooming',
    activeTime: 20,
    restTime: 0,
    totalTime: 20,
    price: { director: 30, senior: 30, junior: 30 },
    status: 'active',
    priceHistory: [{ price: { director: 30, senior: 30, junior: 30 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Fringe Trim',
    category: 'grooming',
    activeTime: 15,
    restTime: 0,
    totalTime: 15,
    price: { director: 30, senior: 30, junior: 30 },
    status: 'active',
    priceHistory: [{ price: { director: 30, senior: 30, junior: 30 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Colour (Regrowth)',
    category: 'colour',
    activeTime: 30,
    restTime: 30,
    totalTime: 60,
    price: { director: 150, senior: 130, junior: 130 },
    status: 'active',
    priceHistory: [{ price: { director: 150, senior: 130, junior: 130 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Balayage / Highlights',
    category: 'colour',
    activeTime: 60,
    restTime: 45,
    totalTime: 105,
    price: { director: 450, senior: 400, junior: 400 },
    status: 'active',
    priceHistory: [{ price: { director: 450, senior: 400, junior: 400 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Digital Perm',
    category: 'perm',
    activeTime: 60,
    restTime: 60,
    totalTime: 120,
    price: { director: 380, senior: 350, junior: 350 },
    status: 'active',
    priceHistory: [{ price: { director: 380, senior: 350, junior: 350 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Olaplex Treatment',
    category: 'treatment',
    activeTime: 20,
    restTime: 20,
    totalTime: 40,
    price: { director: 50, senior: 50, junior: 50 },
    status: 'active',
    priceHistory: [{ price: { director: 50, senior: 50, junior: 50 }, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
  },
];

// ── Seed function ─────────────────────────────────────────────────────────────
const seed = async () => {
  console.log('🌱 Starting Firestore seed...\n');

  // const existingStylists = await getDocs(collection(db, 'stylists'));
  // const existingServices = await getDocs(collection(db, 'services'));

  // // Only block if services already exist (stylists may already be seeded)
  // if (!existingServices.empty) {
  //   console.error('⛔ Firestore already contains services data.');
  //   console.error('   Delete the services collection in Firebase console first.');
  //   process.exit(1);
  // }

  // // Only seed stylists if not already seeded
  // if (existingStylists.empty) {
  //   console.log('👤 Seeding stylists...');
  //   for (const stylist of STYLISTS) {
  //     const ref = await addDoc(collection(db, 'stylists'), stylist);
  //     console.log(`   ✅ ${stylist.name} (${stylist.role}) — ${ref.id}`);
  //   }
  // } else {
  //   console.log('👤 Stylists already seeded — skipping.');
  // }

  console.log('\n✂️  Seeding services...');
  for (const service of SERVICES) {
    const ref = await addDoc(collection(db, 'services'), service);
    const priceStr = `director $${service.price.director} / senior $${service.price.senior}`;
    console.log(`   ✅ ${service.name} — ${priceStr} — ${service.totalTime}min — ${ref.id}`);
  }

  console.log('\n🎉 Seed complete!');
  process.exit(0);
};

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});