// useAppUser.ts
// The current Firebase Auth user's role, read from the custom claims on their ID
// token ({ role: "owner" | "stylist", stylistId? }) - the same claims
// firestore.rules checks (DEC-033). They are set only by the Admin SDK
// (functions/src/roles.ts), never by the client.
//
// A token issued before the account was provisioned has no claim, so when there
// is none the token is force-refreshed once before concluding the account has no
// role. An account that still has none is denied (see ProtectedRoute): signed in
// is not the same as staff.

import { useState, useEffect } from "react";
import useAuth from "./useAuth";
import type { AppUser } from "../types";

interface Result {
  appUser: AppUser | null;
  loading: boolean;
}

const useAppUser = (): Result => {
  const { user, loading: authLoading } = useAuth();
  // Role snapshot keyed by the uid it was resolved for - appUser and loading
  // are derived from it at render time, so the effect never writes state
  // synchronously (react-hooks/set-state-in-effect) and a stale role can
  // never be attributed to a newly signed-in user.
  const [role, setRole] = useState<{
    uid: string;
    appUser: AppUser | null;
  } | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    const uid = user.uid;

    const resolve = async (): Promise<AppUser | null> => {
      let result = await user.getIdTokenResult();
      if (result.claims.role !== "owner" && result.claims.role !== "stylist") {
        result = await user.getIdTokenResult(true);
      }
      const claimed = result.claims.role;
      if (claimed !== "owner" && claimed !== "stylist") {
        console.warn(
          `useAppUser: no role for uid ${uid} - denying access`,
        );
        return null;
      }
      const stylistId = result.claims.stylistId;
      return {
        uid,
        role: claimed,
        ...(typeof stylistId === "string" && stylistId ? { stylistId } : {}),
      };
    };

    resolve()
      .then((appUser) => {
        if (!cancelled) setRole({ uid, appUser });
      })
      .catch((err) => {
        console.error("useAppUser:", err);
        if (!cancelled) setRole({ uid, appUser: null });
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const appUser = user && role?.uid === user.uid ? role.appUser : null;
  const loading = authLoading || (user != null && role?.uid !== user.uid);

  return { appUser, loading };
};

export default useAppUser;
