// useNowMinutes.ts
// The current time as minutes from midnight, refreshed every 30 seconds so
// anything derived from "now" (next opening, open-slot clipping) stays honest
// without re-rendering every second.

import { useEffect, useState } from "react";
import { getCurrentMinutes } from "../lib/scheduling";

const useNowMinutes = (): number => {
  const [now, setNow] = useState(getCurrentMinutes);

  useEffect(() => {
    const id = setInterval(() => setNow(getCurrentMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);

  return now;
};

export default useNowMinutes;
