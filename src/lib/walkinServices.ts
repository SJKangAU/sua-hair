// walkinServices.ts
// Combining several services into one walk-in booking, the same way the
// customer booking flow does: hands-on (apply) time and total time add up,
// processing time is whatever total exceeds apply, each service is priced at
// the stylist's level, and the booking carries the per-service list as well as
// the flat legacy fields the admin views still read.

import type { BookedService, TieredPrice } from "../types";

export interface ServiceSource {
  id: string;
  name: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
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
  }));
  const activeTime = services.reduce((n, s) => n + s.activeTime, 0);
  const totalTime = services.reduce((n, s) => n + s.totalTime, 0);
  return {
    services,
    serviceId: services[0].id,
    serviceName: services.map((s) => s.name).join(" + "),
    servicePrice: services.reduce((n, s) => n + s.price, 0),
    activeTime,
    restTime: totalTime - activeTime,
    totalTime,
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
