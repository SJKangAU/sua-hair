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
          // No role document — treat as owner for backward compat
          // (existing admin accounts predate the users collection)
          setAppUser({ uid: user.uid, role: "owner" });
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
