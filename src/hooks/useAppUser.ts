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
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAppUser(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setAppUser({ uid: user.uid, ...snap.data() } as AppUser);
        } else {
          // No role document — deny by default. A signed-in Firebase
          // account with no role doc must NOT be treated as an owner or
          // stylist; provision a `users/{uid}` doc (owner or stylist) to
          // grant access instead.
          console.warn(
            `useAppUser: no role document for uid ${user.uid} — denying access`,
          );
          setAppUser(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("useAppUser:", err);
        setAppUser(null);
        setLoading(false);
      },
    );

    return unsub;
  }, [user, authLoading]);

  return { appUser, loading };
};

export default useAppUser;
