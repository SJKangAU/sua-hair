// main.tsx
// App entry point
// Preloads Firestore stylists and services into sessionStorage
// before React renders so SalonDataContext reads instantly

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./lib/firebase";

// Preload salon data into sessionStorage before React renders
// This eliminates the loading skeleton on the first visit
// Silent fail — hooks will fetch normally if preload fails
const preloadSalonData = async () => {
  try {
    const promises: Promise<void>[] = [];

    // Keys match useStylists/useServices active-only cache keys
    if (!sessionStorage.getItem("sua_hair_stylists_active")) {
      promises.push(
        getDocs(
          query(
            collection(db, "stylists"),
            where("status", "==", "active"),
            orderBy("startDate", "asc"),
          ),
        ).then((snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          sessionStorage.setItem(
            "sua_hair_stylists_active",
            JSON.stringify(data),
          );
        }),
      );
    }

    if (!sessionStorage.getItem("sua_hair_services_active")) {
      promises.push(
        getDocs(
          query(
            collection(db, "services"),
            where("status", "==", "active"),
            orderBy("category", "asc"),
          ),
        ).then((snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          sessionStorage.setItem(
            "sua_hair_services_active",
            JSON.stringify(data),
          );
        }),
      );
    }

    // Run both fetches in parallel
    await Promise.all(promises);
  } catch (err) {
    console.warn("Preload failed, hooks will fetch on demand:", err);
  }
};

// Fire preload without awaiting — React renders in parallel
preloadSalonData();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
