// StylistClientsPage.tsx
// A stylist's own clients (DEC-047): the people who have a booking with them. Search
// by name or mobile number, open one to see their history WITH THIS STYLIST, and read
// and add notes. A stylist never sees total spend, other stylists' bookings or the
// blocked reason: what they may read is enforced by firestore.rules (clientCards,
// their own bookings, notes), not only by what is drawn here.
//
//   /stylist/clients            the list
//   /stylist/clients/:clientId  one client

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import useAppUser from "../hooks/useAppUser";
import { SalonDataProvider } from "../context/SalonDataProvider";
import { ToastProvider } from "../context/ToastProvider";
import { useToastContext } from "../context/ToastContext";
import { useSalonData } from "../context/SalonDataContext";
import ClientDirectory from "../components/admin/clients/ClientDirectory";
import ClientView from "../components/admin/clients/ClientView";
import WinBackModal from "../components/admin/clients/WinBackModal";
import { can } from "../lib/permissions";

const Inner = () => {
  const { clientId } = useParams();
  const { appUser } = useAppUser();
  const { addToast } = useToastContext();
  const navigate = useNavigate();
  const stylistId = appUser?.stylistId;
  const access = appUser?.clientAccess;
  const { stylists } = useSalonData();
  const [inviting, setInviting] = useState(false);
  const canInvite = can(appUser, "sendWinBack");
  const stylistNames = useMemo(
    () => Object.fromEntries(stylists.map((s) => [s.id, s.name.split(" ")[0]])),
    [stylists],
  );

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
          My clients
        </h1>
        <Link to="/stylist/schedule" style={{ color: "var(--surface)", fontSize: "0.85rem" }}>
          Back to my schedule
        </Link>
      </header>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem" }}>
        {!stylistId ? (
          <p role="status">Loading...</p>
        ) : clientId ? (
          <>
            <Link
              to="/stylist/clients"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ink-soft)", fontSize: "var(--text-sm)", marginBottom: "1rem" }}
            >
              <ChevronLeft size={16} aria-hidden="true" /> All my clients
            </Link>
            <ClientView
              key={clientId}
              clientId={clientId}
              role="stylist"
              stylistId={stylistId}
              access={access}
              onNotice={(m, kind) => addToast(m, kind)}
            />
          </>
        ) : (
          <ClientDirectory
            role="stylist"
            stylistId={stylistId}
            access={access}
            stylistNames={stylistNames}
            onOpen={(id) => navigate(`/stylist/clients/${id}`)}
            onInviteBack={canInvite ? () => setInviting(true) : undefined}
          />
        )}
      </main>
      {inviting && <WinBackModal onClose={() => setInviting(false)} onNotice={(m, kind) => addToast(m, kind)} />}
    </div>
  );
};

const StylistClientsPage = () => (
  <SalonDataProvider>
    <ToastProvider>
      <Inner />
    </ToastProvider>
  </SalonDataProvider>
);

export default StylistClientsPage;
