// StylistMessagesPage.tsx
// /stylist/messages - the message wording editor for a stylist the owner has given the
// "edit message wording" permission (FR-026). The same editor the owner uses in Manage.
// Not just hidden when the permission is missing: the settings document's rules and the
// test-text function both check it, so this page does nothing for anyone without it.

import { Link } from "react-router-dom";
import useAppUser from "../hooks/useAppUser";
import { can } from "../lib/permissions";
import { ToastProvider } from "../context/ToastProvider";
import { useToastContext } from "../context/ToastContext";
import SmsSettings from "../components/admin/manage/SmsSettings";

const Inner = () => {
  const { appUser, loading } = useAppUser();
  const { addToast } = useToastContext();
  const allowed = can(appUser, "editMessages");

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <header
        style={{
          background: "var(--admin-panel)",
          color: "var(--surface)",
          padding: "1rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.3rem" }}>
          Messages
        </h1>
        <Link to="/stylist/schedule" style={{ color: "var(--surface)", fontSize: "0.85rem" }}>
          Back to my schedule
        </Link>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>
        {loading ? (
          <p role="status">Loading...</p>
        ) : !allowed ? (
          <p role="alert" data-testid="messages-no-permission">
            You don't have permission to edit messages. Ask the owner if you need it.
          </p>
        ) : (
          <SmsSettings onSuccess={(m) => addToast(m, "success")} onError={(m) => addToast(m, "error")} />
        )}
      </main>
    </div>
  );
};

const StylistMessagesPage = () => (
  <ToastProvider>
    <Inner />
  </ToastProvider>
);

export default StylistMessagesPage;
