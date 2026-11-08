// useHairOptions.ts
// Live subscription to the owner's "Your hair" options (salonSettings/hairOptions). Until the
// owner saves their own, or if what is stored is not valid, the seed is used, so the booking
// flow is never blocked. Publicly readable like the rest of salonSettings; owner-write.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { DEFAULT_HAIR_CONFIG, hairConfigProblem, type HairConfig } from "../lib/hairProfile";

interface Result {
  config: HairConfig;
  loading: boolean;
  /** true when the owner has saved their own options */
  custom: boolean;
}

const useHairOptions = (): Result => {
  const [state, setState] = useState<Result>({ config: DEFAULT_HAIR_CONFIG, loading: true, custom: false });

  useEffect(
    () =>
      onSnapshot(
        doc(db, "salonSettings", "hairOptions"),
        (snap) => {
          const c = snap.data()?.config;
          if (c && hairConfigProblem(c) === null) setState({ config: c as HairConfig, loading: false, custom: true });
          else setState({ config: DEFAULT_HAIR_CONFIG, loading: false, custom: false });
        },
        (err) => {
          console.error("useHairOptions:", err);
          setState({ config: DEFAULT_HAIR_CONFIG, loading: false, custom: false });
        },
      ),
    [],
  );

  return state;
};

export default useHairOptions;
