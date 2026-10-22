// StylistTimeOffPage.tsx
// /stylist/time-off - a stylist asks for their own days off and blocked times and sees what has
// been decided (FR-029). A stylist the owner has allowed to approve time off also sees everyone's
// waiting requests here and can decide them, and can add time off for anyone.

import { Link } from "react-router-dom";
import useAppUser from "../hooks/useAppUser";
import useTimeOff from "../hooks/useTimeOff";
import { can } from "../lib/permissions";
import { SalonDataProvider } from "../context/SalonDataProvider";
import { ToastProvider } from "../context/ToastProvider";
import { useToastContext } from "../context/ToastContext";
import { useSalonData } from "../context/SalonDataContext";
import TimeOffList from "../components/timeoff/TimeOffList";
import TimeOffRequestForm from "../components/timeoff/TimeOffRequestForm";

const Inner = () => {
  const { appUser, loading } = useAppUser();
  const { addToast } = useToastContext();
  const { stylists } = useSalonData();
  const canApprove = can(appUser, "approveTimeOff");
  const stylistId = appUser?.stylistId;
  const scope = !appUser || loading ? null : canApprove ? { all: true as const } : stylistId ? { stylistId } : null;
  const { rows, loading: listLoading, error } = useTimeOff(scope);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)" }}>
      <header style={{ background: "var(--admin-panel)", color: "var(--surface)", padding: "1rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: "1.3rem" }}>Time off</h1>
        <Link to="/stylist/schedule" style={{ color: "var(--surface)", fontSize: "0.85rem" }}>
          Back to my schedule
        </Link>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {loading || !appUser || !stylistId ? (
          <p role="status">Loading...</p>
        ) : (
          <>
            {listLoading ? (
              <p role="status">Loading...</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : (
              <TimeOffList records={rows} canApprove={canApprove} isOwner={false} ownUid={appUser.uid} onDone={(m) => addToast(m, "success")} onError={(m) => addToast(m, "error")} />
            )}
            <TimeOffRequestForm
              canApprove={canApprove}
              stylists={stylists.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
              ownStylistId={canApprove ? undefined : stylistId}
              onDone={(m) => addToast(m, "success")}
              onError={(m) => addToast(m, "error")}
            />
          </>
        )}
      </main>
    </div>
  );
};

const StylistTimeOffPage = () => (
  <SalonDataProvider>
    <ToastProvider>
      <Inner />
    </ToastProvider>
  </SalonDataProvider>
);

export default StylistTimeOffPage;
