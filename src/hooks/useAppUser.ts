// useAppUser.ts
// Looks up the current Firebase Auth user's role document from the Firestore
// users collection. Returns null while loading or if no document exists.
// The Firestore document ID matches the Firebase Auth uid.

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import useAuth from "./useAuth";
import type { AppUser } from "../types";

interface Result {
  appUser: AppUser | null;
  loading: boolean;
}

const useAppUser = (): Result => {
  const { user, loading: authLoading } = useAuth();
  // Role snapshot keyed by the uid it was resolved for — appUser and loading
  // are derived from it at render time, so the effect never writes state
  // synchronously (react-hooks/set-state-in-effect) and a stale role can
  // never be attributed to a newly signed-in user.
  const [role, setRole] = useState<{
    uid: string;
    appUser: AppUser | null;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    const uid = user.uid;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setRole({ uid, appUser: { uid, ...snap.data() } as AppUser });
        } else {
          // No role document — deny by default. A signed-in Firebase
          // account with no role doc must NOT be treated as an owner or
          // stylist; provision a `users/{uid}` doc (owner or stylist) to
          // grant access instead.
          console.warn(
            `useAppUser: no role document for uid ${uid} — denying access`,
          );
          setRole({ uid, appUser: null });
        }
      },
      (err) => {
        console.error("useAppUser:", err);
        setRole({ uid, appUser: null });
      },
    );

    return unsub;
  }, [user, authLoading]);

  const appUser = user && role?.uid === user.uid ? role.appUser : null;
  const loading = authLoading || (user != null && role?.uid !== user.uid);

  return { appUser, loading };
};

export default useAppUser;
