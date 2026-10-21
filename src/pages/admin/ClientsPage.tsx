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
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";

const ClientsPage = () => {
  const { addToast } = useToastContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [bookAgain, setBookAgain] = useState<{ phone: string; name: string } | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}>Clients</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", margin: 0 }}>
          Every client, with their history, last visit and notes. Search by name or mobile number.
        </p>
      </div>

      <ClientDirectory
        role="owner"
        initialSearch={searchParams.get("q") ?? ""}
        onOpen={(id) => setOpenId(id)}
      />

      {openId && (
        <ClientDrawer
          clientId={openId}
          onClose={() => setOpenId(null)}
          onBookAgain={(name, phone) => setBookAgain({ name, phone })}
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
