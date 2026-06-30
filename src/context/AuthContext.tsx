// AuthContext.tsx
// Role-aware auth context combining Firebase Auth state with the Firestore
// users collection. Provides both the raw Firebase user and the AppUser role doc.
// Wrap the app root or a specific subtree (admin, stylist portal) with AuthProvider.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import useAuth from "../hooks/useAuth";
import useAppUser from "../hooks/useAppUser";
import type { AppUser } from "../types";

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  authLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { appUser } = useAppUser();

  return (
    <AuthContext.Provider value={{ user, appUser, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};

export default AuthContext;
