// firebase.ts
// Firebase initialisation with IndexedDB persistence for faster repeat loads

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// When the project hasn't been wired up with real Firebase credentials yet
// (no .env / VITE_FIREBASE_* vars configured), fall back to a syntactically
// valid placeholder config. Firebase Auth validates the apiKey format
// synchronously at getAuth() time and throws `auth/invalid-api-key` for an
// undefined/malformed key — which would crash the whole module graph before
// React ever mounts, leaving a blank page. Using a well-formed placeholder
// lets the app render normally; any real network calls to Firestore/Auth
// will simply fail at call time, which the existing hooks already handle.
const hasRealFirebaseConfig = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
);

if (!hasRealFirebaseConfig) {
  console.warn(
    "[firebase] VITE_FIREBASE_* env vars are not configured — running with a placeholder config. " +
      "Live data (bookings, login, stylists/services) will not work until real Firebase credentials are added.",
  );
}

const firebaseConfig = hasRealFirebaseConfig
  ? {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
  : {
      apiKey: "AIzaSyDpreview-placeholder-not-configured0",
      authDomain: "preview-not-configured.firebaseapp.com",
      projectId: "preview-not-configured",
      storageBucket: "preview-not-configured.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:0000000000000000000000",
    };

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  // Behind the platform's preview reverse proxy, Firestore's default
  // WebChannel/fetch-stream transport periodically has its connection
  // aborted mid-stream, which the SDK surfaces as an unhandled
  // "AbortError: The user aborted a request." promise rejection. Forcing
  // long-polling (with a timeout under the proxy's ~30s ceiling) avoids
  // that transport entirely instead of just detecting and falling back to
  // it after the fact.
  experimentalForceLongPolling: true,
  experimentalLongPollingOptions: { timeoutSeconds: 25 },
});

export const auth = getAuth(app);
