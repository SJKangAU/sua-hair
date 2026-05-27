// main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "./lib/firebase";

// ── Preload Firestore data ──────────────────────────────────────────────────
// Kick off fetches immediately on app load before React renders
// Results are cached in sessionStorage so SalonDataContext reads them instantly
// This eliminates the loading skeleton on first visit

const preloadSalonData = async () => {
  try {
    // Only preload if not already cached
    if (!sessionStorage.getItem("sua_hair_stylists")) {
      const stylistsQuery = query(
        collection(db, "stylists"),
        where("status", "==", "active"),
        orderBy("startDate", "asc"),
      );
      const stylistsSnap = await getDocs(stylistsQuery);
      const stylists = stylistsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      sessionStorage.setItem("sua_hair_stylists", JSON.stringify(stylists));
    }

    if (!sessionStorage.getItem("sua_hair_services")) {
      const servicesQuery = query(
        collection(db, "services"),
        where("status", "==", "active"),
        orderBy("category", "asc"),
      );
      const servicesSnap = await getDocs(servicesQuery);
      const services = servicesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      sessionStorage.setItem("sua_hair_services", JSON.stringify(services));
    }
  } catch (err) {
    // Silent fail — hooks will fetch normally if preload fails
    console.warn("Preload failed, hooks will fetch on demand:", err);
  }
};

// Fire and forget — don't await, let React render in parallel
preloadSalonData();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
