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
import { doc, onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";
import useAuth from "./useAuth";
import { db } from "../lib/firebase";
import { accessFromClaims } from "../lib/clientAccess";
import { capabilitiesFromClaims } from "../lib/permissions";
import type { AppUser } from "../types";

interface Result {
  appUser: AppUser | null;
  loading: boolean;
}

// The role and, for a stylist, whose clients they may open, from the token's claims
const appUserFromClaims = async (user: User, forceRefresh = false): Promise<AppUser | null> => {
  let result = await user.getIdTokenResult(forceRefresh);
  if (result.claims.role !== "owner" && result.claims.role !== "stylist") {
    result = await user.getIdTokenResult(true);
  }
  const claimed = result.claims.role;
  if (claimed !== "owner" && claimed !== "stylist") {
    console.warn(`useAppUser: no role for uid ${user.uid} - denying access`);
    return null;
  }
  const stylistId = result.claims.stylistId;
  return {
    uid: user.uid,
    role: claimed,
    ...(typeof stylistId === "string" && stylistId ? { stylistId } : {}),
    ...(claimed === "stylist"
      ? {
          clientAccess: accessFromClaims(result.claims, typeof stylistId === "string" ? stylistId : undefined),
          capabilities: capabilitiesFromClaims(result.claims),
        }
      : {}),
  };
};

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

    appUserFromClaims(user)
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

  // When the owner changes what this stylist may open, the Admin SDK rewrites
  // users/{uid}; the new claims are then fetched at once instead of at next sign-in.
  const stylistUid = role?.appUser?.role === "stylist" ? role.uid : null;
  useEffect(() => {
    if (!user || !stylistUid || user.uid !== stylistUid) return;
    let seen: string | null | undefined;
    let cancelled = false;
    const stop = onSnapshot(
      doc(db, "users", stylistUid),
      (snap) => {
        const stamp = (snap.get("grantedAt") as string | undefined) ?? null;
        if (seen === undefined) {
          seen = stamp;
          return;
        }
        if (stamp === seen) return;
        seen = stamp;
        appUserFromClaims(user, true)
          .then((next) => {
            if (!cancelled && next) setRole({ uid: stylistUid, appUser: next });
          })
          .catch(() => undefined); // the next sign-in will pick it up
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [user, stylistUid]);

  const appUser = user && role?.uid === user.uid ? role.appUser : null;
  const loading = authLoading || (user != null && role?.uid !== user.uid);

  return { appUser, loading };
};

export default useAppUser;
