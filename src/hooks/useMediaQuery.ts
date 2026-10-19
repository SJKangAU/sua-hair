// useMediaQuery.ts
// Whether a CSS media query currently matches, kept live. Built on
// useSyncExternalStore so there is no effect-driven state and no flash of the
// wrong layout after the first render.

import { useSyncExternalStore } from "react";

const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

export default useMediaQuery;
