// ProtectedRoute.tsx
// Wraps admin and stylist routes — redirects unauthenticated users to the
// appropriate login page. Optionally enforces a required role from the
// Firestore users collection. When requiredRole is set, access is denied
// (fail closed) unless the signed-in account has a role document AND that
// document's role matches — a missing/unreadable role document is never
// treated as an implicit grant.
//
// A signed-in account with no usable role document gets an explicit
// "no access" screen rather than a redirect: the login page forwards signed-in
// users to /admin and /admin would forward them straight back, which looks
// like a flickering page that never responds.

import { Navigate } from "react-router-dom";
import { signOut, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import useAuth from "../hooks/useAuth";
import useAppUser from "../hooks/useAppUser";

interface Props {
  children: React.ReactNode;
  requiredRole?: "owner" | "stylist";
  loginPath?: string;
}

const NoAccess = ({ user }: { user: User }) => (
  <div
    style={{
      minHeight: "100vh",
      background: "var(--admin-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      fontFamily: "var(--font-body)",
    }}
  >
    <div
      role="alert"
      style={{
        background: "var(--surface)",
        borderRadius: "12px",
        padding: "2rem",
        width: "100%",
        maxWidth: "460px",
        boxShadow: "var(--shadow-lg)",
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.5rem",
          fontWeight: 400,
          margin: "0 0 0.75rem",
        }}
      >
        No access yet
      </h1>
      <p
        style={{
          margin: "0 0 1rem",
          fontSize: "var(--text-base)",
          lineHeight: 1.6,
          color: "var(--ink-muted)",
        }}
      >
        You are signed in
        {user.email ? ` as ${user.email}` : ""}, but this account has not been
        given a role. An owner needs to add a <code>users</code> document for
        it in Firestore with the field <code>role</code> set to{" "}
        <code>owner</code> or <code>stylist</code>.
      </p>
      <p
        style={{
          margin: "0 0 1.5rem",
          fontSize: "var(--text-sm)",
          color: "var(--ink-muted)",
          wordBreak: "break-all",
        }}
      >
        Document ID to use (your account UID):
        <br />
        <code style={{ color: "var(--ink)" }}>{user.uid}</code>
      </p>
      <button
        className="bk-ghost"
        onClick={() => void signOut(auth)}
        style={{
          padding: "0.6rem 1.25rem",
          background: "transparent",
          color: "var(--ink)",
          border: "1px solid var(--border-strong)",
          borderRadius: "6px",
          cursor: "pointer",
          fontSize: "var(--text-base)",
          fontWeight: 500,
          fontFamily: "var(--font-body)",
        }}
      >
        Sign out
      </button>
    </div>
  </div>
);

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

  // Role check — only enforced when requiredRole is specified.
  // Fail closed: a missing role document must deny access, never grant it.
  if (requiredRole) {
    // No role document, an unreadable one, or a role value that is neither
    // "owner" nor "stylist" (e.g. a typo): there is nowhere sensible to
    // redirect to, so say so instead of bouncing between pages.
    if (!appUser || (appUser.role !== "owner" && appUser.role !== "stylist")) {
      return <NoAccess user={user} />;
    }

    if (appUser.role !== requiredRole) {
      // Authenticated but wrong role — redirect to the relevant home
      const fallback =
        appUser.role === "owner" ? "/admin" : "/stylist/schedule";
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
