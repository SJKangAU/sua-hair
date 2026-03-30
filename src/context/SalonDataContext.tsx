// SalonDataContext.tsx
// Provides stylists and services data to the entire app
// Wraps useStylists and useServices hooks so components don't
// need to fetch independently — one fetch, shared everywhere
// Wrap the app root with this provider

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import useStylists from '../hooks/useStylists';
import useServices from '../hooks/useServices';
import type { FirestoreStylist } from '../hooks/useStylists';
import type { FirestoreService } from '../hooks/useServices';

interface SalonDataContextValue {
  stylists: FirestoreStylist[];
  stylistsLoading: boolean;
  stylistsError: string | null;
  refetchStylists: () => void;
  services: FirestoreService[];
  servicesLoading: boolean;
  servicesError: string | null;
  refetchServices: () => void;
}

const SalonDataContext = createContext<SalonDataContextValue | null>(null);

// Provider component — wrap around the booking form and admin dashboard
export const SalonDataProvider = ({ children }: { children: ReactNode }) => {
  const {
    stylists,
    loading: stylistsLoading,
    error: stylistsError,
    refetch: refetchStylists,
  } = useStylists(true); // active only

  const {
    services,
    loading: servicesLoading,
    error: servicesError,
    refetch: refetchServices,
  } = useServices(true); // active only

  return (
    <SalonDataContext.Provider value={{
      stylists,
      stylistsLoading,
      stylistsError,
      refetchStylists,
      services,
      servicesLoading,
      servicesError,
      refetchServices,
    }}>
      {children}
    </SalonDataContext.Provider>
  );
};

// Custom hook for consuming the context
// Throws if used outside the provider — catches missing provider setup early
export const useSalonData = (): SalonDataContextValue => {
  const context = useContext(SalonDataContext);
  if (!context) {
    throw new Error('useSalonData must be used within a SalonDataProvider');
  }
  return context;
};

export default SalonDataContext;