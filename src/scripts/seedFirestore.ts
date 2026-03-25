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

// Load environment variables from .env file
dotenv.config();

// ── Firebase config from environment variables ────────────────────────────────
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

// ── Stylists seed data ────────────────────────────────────────────────────────
// status: 'active' | 'inactive'
// inactive stylists are hidden from booking form and timeline
// but their historical bookings are preserved
const STYLISTS = [
  {
    name: 'Steve Hwang',
    role: 'Director',
    level: 'director',       // used for pricing tier logic
    status: 'active',
    instagram: 'suahairstudio',
    startDate: '2013-01-01', // approximate founding date
    isTrainer: true,          // can train other stylists
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

// ── Services seed data ────────────────────────────────────────────────────────
// activeTime: minutes stylist is hands-on with client
// restTime: minutes client sits while product sets (stylist is free)
// totalTime: activeTime + restTime (computed automatically)
// status: 'active' | 'inactive'
// priceHistory: array of price changes with timestamps for accurate analytics
const SERVICES = [
  // ── No rest period ──────────────────────────────────────────────────────────
  {
    name: "Men's Cut",
    category: 'cut',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: 65,
    status: 'active',
    priceHistory: [
      { price: 65, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: "Ladies Cut",
    category: 'cut',
    activeTime: 60,
    restTime: 0,
    totalTime: 60,
    price: 85,
    status: 'active',
    priceHistory: [
      { price: 85, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Skin/Zero Fade',
    category: 'cut',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: 70,
    status: 'active',
    priceHistory: [
      { price: 70, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Blow Wave',
    category: 'styling',
    activeTime: 45,
    restTime: 0,
    totalTime: 45,
    price: 70,
    status: 'active',
    priceHistory: [
      { price: 70, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Beard Trim',
    category: 'grooming',
    activeTime: 20,
    restTime: 0,
    totalTime: 20,
    price: 30,
    status: 'active',
    priceHistory: [
      { price: 30, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Fringe Trim',
    category: 'grooming',
    activeTime: 15,
    restTime: 0,
    totalTime: 15,
    price: 30,
    status: 'active',
    priceHistory: [
      { price: 30, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },

  // ── Has rest/setting period ─────────────────────────────────────────────────
  {
    name: 'Colour (Regrowth)',
    category: 'colour',
    activeTime: 30,
    restTime: 30,
    totalTime: 60,
    price: 130,
    status: 'active',
    priceHistory: [
      { price: 130, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Balayage / Highlights',
    category: 'colour',
    activeTime: 60,
    restTime: 45,
    totalTime: 105,
    price: 400,
    status: 'active',
    priceHistory: [
      { price: 400, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Digital Perm',
    category: 'perm',
    activeTime: 60,
    restTime: 60,
    totalTime: 120,
    price: 350,
    status: 'active',
    priceHistory: [
      { price: 350, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
  {
    name: 'Olaplex Treatment',
    category: 'treatment',
    activeTime: 20,
    restTime: 20,
    totalTime: 40,
    price: 50,
    status: 'active',
    priceHistory: [
      { price: 50, effectiveFrom: '2024-01-01', recordedAt: new Date().toISOString() }
    ],
    createdAt: new Date().toISOString(),
  },
];

// ── Seed function ─────────────────────────────────────────────────────────────

const seed = async () => {
  console.log('🌱 Starting Firestore seed...\n');

  // ── Check if already seeded ─────────────────────────────────────────────────
  // Prevents accidental duplicate seeding
  const existingStylists = await getDocs(collection(db, 'stylists'));
  const existingServices = await getDocs(collection(db, 'services'));

  if (!existingStylists.empty || !existingServices.empty) {
    console.error('⛔ Firestore already contains stylists or services data.');
    console.error('   Delete the collections in Firebase console first if you want to re-seed.');
    process.exit(1);
  }

  // ── Seed stylists ───────────────────────────────────────────────────────────
  console.log('👤 Seeding stylists...');
  for (const stylist of STYLISTS) {
    const ref = await addDoc(collection(db, 'stylists'), stylist);
    console.log(`   ✅ ${stylist.name} (${stylist.role}) — ${ref.id}`);
  }

  // ── Seed services ───────────────────────────────────────────────────────────
  console.log('\n✂️  Seeding services...');
  for (const service of SERVICES) {
    const ref = await addDoc(collection(db, 'services'), service);
    console.log(`   ✅ ${service.name} — $${service.price} — ${service.totalTime}min — ${ref.id}`);
  }

  console.log('\n🎉 Seed complete! Stylists and services are now in Firestore.');
  console.log('   You can view them in the Firebase console under Firestore Database.');
  process.exit(0);
};

// ── Run ───────────────────────────────────────────────────────────────────────
seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});