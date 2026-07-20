// SalonDataProvider.tsx
// Provider component for SalonDataContext — lives in its own file so this
// module exports only a component (react-refresh/only-export-components);
// the context object and useSalonData hook stay in SalonDataContext.tsx.

import type { ReactNode } from "react";
import SalonDataContext from "./SalonDataContext";
import useStylists from "../hooks/useStylists";
import useServices from "../hooks/useServices";
import useSalonSettings from "../hooks/useSalonSettings";

// Wrap around the booking form and admin dashboard — one fetch per data
// source, shared everywhere via context.
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

  const { settings: salonSettings, loading: settingsLoading } =
    useSalonSettings();

  return (
    <SalonDataContext.Provider
      value={{
        stylists,
        stylistsLoading,
        stylistsError,
        refetchStylists,
        services,
        servicesLoading,
        servicesError,
        refetchServices,
        salonSettings,
        settingsLoading,
      }}
    >
      {children}
    </SalonDataContext.Provider>
  );
};
