// ClientsPage.tsx
// Clients tab - the client directory (DEC-046): search any client by name word, name
// start or mobile number, filter (lapsed, new, blocked, has a booking, no-shows),
// sort, and open a client in a drawer or on their own page. Uses ToastContext
// directly; "Book again" opens the create-booking form with the client filled in.
// /admin/clients?q=... starts a search (used by the Today page's search).

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToastContext } from "../../context/ToastContext";
import { todayString } from "../../lib/dates";
import ClientDirectory from "../../components/admin/clients/ClientDirectory";
import ClientDrawer from "../../components/admin/clients/ClientDrawer";
import WinBackModal from "../../components/admin/clients/WinBackModal";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";

const ClientsPage = () => {
  const { addToast } = useToastContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [bookAgain, setBookAgain] = useState<{ phone: string; name: string } | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.6rem, 3.5vw, 2.1rem)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            margin: "0 0 0.3rem",
          }}
        >
          Clients
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--ink-muted)", margin: 0 }}>
          Everyone you have looked after: their history, spend, notes and what to watch for. Search by name or mobile number.
        </p>
      </div>

      <ClientDirectory
        role="owner"
        initialSearch={searchParams.get("q") ?? ""}
        onOpen={(id) => setOpenId(id)}
        onInviteBack={() => setInviting(true)}
      />

      {inviting && <WinBackModal onClose={() => setInviting(false)} onNotice={(m, kind) => addToast(m, kind)} />}

      {openId && (
        <ClientDrawer
          clientId={openId}
          onClose={() => setOpenId(null)}
          onBookAgain={(name, phone) => {
            // the form opens on its own, not underneath the drawer
            setOpenId(null);
            setBookAgain({ name, phone });
          }}
          onNotice={(m, kind) => addToast(m, kind)}
        />
      )}

      {bookAgain && (
        <CreateBookingModal
          prefillStylistId=""
          prefillTime=""
          prefillDate={todayString()}
          prefillCustomerName={bookAgain.name}
          prefillCustomerPhone={bookAgain.phone}
          onClose={() => setBookAgain(null)}
          onSuccess={(msg) => {
            addToast(msg, "success");
            navigate("/admin/clients", { replace: true });
          }}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default ClientsPage;
