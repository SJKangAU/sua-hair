// SalonDataContext.tsx
// Context + consumer hook for stylists, services, and salonSettings.
// The provider component lives in SalonDataProvider.tsx so each file passes
// react-refresh/only-export-components.

import { createContext, useContext } from "react";
import type { FirestoreStylist } from "../hooks/useStylists";
import type { FirestoreService } from "../hooks/useServices";
import type { SalonSettings } from "../types";

interface SalonDataContextValue {
  stylists: FirestoreStylist[];
  stylistsLoading: boolean;
  stylistsError: string | null;
  refetchStylists: () => void;
  services: FirestoreService[];
  servicesLoading: boolean;
  servicesError: string | null;
  refetchServices: () => void;
  salonSettings: SalonSettings;
  settingsLoading: boolean;
}

// camelCase — this is a context object, not a component; a PascalCase export
// here reads as a component to react-refresh/only-export-components.
const salonDataContext = createContext<SalonDataContextValue | null>(null);

// Custom hook for consuming the context
// Throws if used outside the provider — catches missing provider setup early
export const useSalonData = (): SalonDataContextValue => {
  const context = useContext(salonDataContext);
  if (!context) {
    throw new Error("useSalonData must be used within a SalonDataProvider");
  }
  return context;
};

export default salonDataContext;