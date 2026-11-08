// useStylistColors.ts
// The colour of each stylist on screen (see lib/stylistColors.ts): the owner's
// choice, else a default no other stylist shares.

import { useMemo } from "react";
import { useSalonData } from "../context/SalonDataContext";
import { resolveStylistColors, type StylistColor } from "../lib/stylistColors";

const useStylistColors = (): (stylistId: string | undefined) => StylistColor | undefined => {
  const { stylists } = useSalonData();
  const colors = useMemo(() => resolveStylistColors(stylists), [stylists]);
  return (stylistId) => (stylistId ? colors.get(stylistId) : undefined);
};

export default useStylistColors;
