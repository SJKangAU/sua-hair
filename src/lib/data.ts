// data.ts
// Static data for Sua Hair
// All duration values are in minutes
// restTime = 0 means no rest period for that service

import type { Stylist, Service } from '../types';

export const STYLISTS: Stylist[] = [
  { id: 'steve', name: 'Steve Hwang', role: 'Director/Master Stylist', available: true },
  { id: 'yuto', name: 'Yuto Hirakawa', role: 'Senior Stylist', available: true },
  { id: 'elly', name: 'Elly Lee', role: 'Senior Stylist', available: true },
  { id: 'ethan', name: 'Ethan Le', role: 'Junior Stylist', available: true },
  { id: 'harry', name: 'Harry Yang', role: 'Junior Stylist', available: true },
];

// Helper to build a service — automatically computes totalTime
// This means you never have to manually keep totalTime in sync
const makeService = (
  id: string,
  name: string,
  activeTime: number,
  restTime: number,
  price: number
): Service => ({
  id,
  name,
  activeTime,
  restTime,
  totalTime: activeTime + restTime,
  price,
});

export const SERVICES: Service[] = [
  // ── No rest period ─────────────────────────────────────────────────
  makeService('mens-cut',     "Men's Cut",         45,  0,   65),
  makeService('ladies-cut',   "Ladies Cut",        60,  0,   85),
  makeService('fade',         'Skin/Zero Fade',    45,  0,   70),
  makeService('blowwave',     'Blow Wave',         45,  0,   70),
  makeService('beard-trim',   'Beard Trim',        20,  0,   30),
  makeService('fringe-trim',  'Fringe Trim',       15,  0,   30),

  // ── Has rest/set period ────────────────────────────────────────────
  // restTime = time client sits while product sets
  // Stylist is free during restTime to take another client
  makeService('colour-regrowth', 'Colour (Regrowth)',      30, 30,  130),
  makeService('balayage',        'Balayage / Highlights',  60, 45,  400),
  makeService('digital-perm',    'Digital Perm',           60, 60,  350),
  makeService('olaplex',         'Olaplex Treatment',      20, 20,   50),
];