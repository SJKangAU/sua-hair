// firebase.ts
// Firebase initialisation with IndexedDB persistence for faster repeat loads

import { initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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

// App Check (reCAPTCHA v3): proves a call comes from this site, not a script. It is
// OFF until the reCAPTCHA site key is configured - set VITE_RECAPTCHA_SITE_KEY for
// the build - and the callables only REQUIRE it once ENFORCE_APP_CHECK is switched
// on in the functions (docs/DEPLOYMENT.md lists the console steps). Never in the
// emulator runs.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaSiteKey && import.meta.env.VITE_USE_EMULATORS !== "true") {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error("[firebase] App Check could not start:", err);
  }
}

// `useFetchStreams` is an internal/experimental Firestore setting not part
// of the public `FirestoreSettings` type, even though the SDK accepts it at
// runtime (see firebase-js-sdk PrivateSettings). Extend the settings param
// type locally instead of casting to `any` so this stays fully typed.
type FirestoreDevSettings = Parameters<typeof initializeFirestore>[1] & {
  useFetchStreams?: boolean;
};

const firestoreSettings: FirestoreDevSettings = {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  // Behind the platform's preview reverse proxy, Firestore's default
  // WebChannel/fetch-stream transport periodically has its connection
  // aborted mid-stream, which the SDK surfaces as an unhandled
  // "AbortError: The user aborted a request." promise rejection. Forcing
  // long-polling (with a timeout under the proxy's ~30s ceiling) avoids
  // that transport entirely instead of just detecting and falling back to
  // it after the fact. `useFetchStreams: false` additionally makes the
  // long-polling transport itself use XMLHttpRequest instead of
  // fetch()/ReadableStream — XHR aborts surface as a plain 'abort' event,
  // not a rejected Promise, so the reconnect cycle no longer produces
  // unhandled-rejection noise at all (rather than trying to catch/suppress
  // a rejection after the SDK's own internal streaming code creates it,
  // which can't be reliably intercepted from application code).
  experimentalForceLongPolling: true,
  experimentalLongPollingOptions: { timeoutSeconds: 25 },
  useFetchStreams: false,
};

export const db = initializeFirestore(app, firestoreSettings);

export const auth = getAuth(app);

// Local end-to-end runs (npm run test:e2e) point the app at the Firebase
// emulators instead of any real project. Never set in production builds.
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

// Callable Cloud Functions. Region must match the functions' deployed region
// (see functions/src/index.ts — australia-southeast1, Sydney).
export const functions = getFunctions(app, "australia-southeast1");

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
