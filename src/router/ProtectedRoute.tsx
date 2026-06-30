// ProtectedRoute.tsx
// Wraps admin and stylist routes — redirects unauthenticated users to the
// appropriate login page. Optionally enforces a required role from the Firestore
// users collection. Existing owner routes pass no requiredRole and continue
// to work exactly as before (any authenticated user is allowed through).

import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import useAppUser from "../hooks/useAppUser";

interface Props {
  children: React.ReactNode;
  requiredRole?: "owner" | "stylist";
  loginPath?: string;
}

const ProtectedRoute = ({
  children,
  requiredRole,
  loginPath = "/admin/login",
}: Props) => {
  const { user, loading: authLoading } = useAuth();
  const { appUser, loading: roleLoading } = useAppUser();

  // Don't render until both auth state and role doc are resolved
  if (authLoading || (user && roleLoading)) return null;

  if (!user) return <Navigate to={loginPath} replace />;

  // Role check — only enforced when requiredRole is specified
  if (requiredRole && appUser && appUser.role !== requiredRole) {
    // Authenticated but wrong role — redirect to the relevant home
    const fallback = appUser.role === "owner" ? "/admin" : "/stylist/schedule";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
