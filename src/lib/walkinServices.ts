// walkinServices.ts
// Combining several services into one walk-in booking, the same way the
// customer booking flow does: hands-on (apply) time and total time add up,
// processing time is whatever total exceeds apply, each service is priced at
// the stylist's level, and the booking carries the per-service list as well as
// the flat legacy fields the admin views still read.

import { combinePhases, phaseTotals } from "./bookingPhases";
import type { BookedService, Phase, TieredPrice } from "../types";

export interface ServiceSource {
  id: string;
  name: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  phases?: Phase[];
  price: TieredPrice;
}

export interface CombinedServices {
  services: BookedService[];
  serviceId: string; // the first service — legacy single-service field
  serviceName: string; // "Cut + Colour"
  servicePrice: number;
  activeTime: number;
  restTime: number;
  totalTime: number;
  // The services' combined phases (see combinePhases)
  phases: Phase[];
}

export const combineServices = (
  selected: ServiceSource[],
  level: keyof TieredPrice,
): CombinedServices | null => {
  if (selected.length === 0) return null;
  const services: BookedService[] = selected.map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price[level],
    activeTime: s.activeTime,
    restTime: s.restTime,
    totalTime: s.totalTime,
    ...(s.phases && s.phases.length > 0 ? { phases: s.phases } : {}),
  }));
  // Services with only hands-on + processing combine exactly as before (all
  // hands-on, then all processing); a service with a return phase makes them
  // run end to end
  const phases = combinePhases(selected);
  const { activeTime, totalTime } = phaseTotals(phases);
  return {
    services,
    serviceId: services[0].id,
    serviceName: services.map((s) => s.name).join(" + "),
    servicePrice: services.reduce((n, s) => n + s.price, 0),
    activeTime,
    restTime: totalTime - activeTime,
    totalTime,
    phases,
  };
};

// In "Add booking to gap" the client's hands-on time must fit the free window
// (their own processing can run on past it). True if adding `candidate` to the
// current selection still fits.
export const fitsGap = (
  selected: ServiceSource[],
  candidate: ServiceSource,
  gapMinutes: number,
): boolean =>
  selected.reduce((n, s) => n + s.activeTime, 0) + candidate.activeTime <=
  gapMinutes;
