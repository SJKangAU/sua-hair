// ClientPage.tsx
// /admin/clients/:clientId - one client on their own page (the same view as the
// list's drawer): header, key numbers, booking history, notes and the owner's
// housekeeping tools.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useToastContext } from "../../context/ToastContext";
import { todayString } from "../../lib/dates";
import ClientView from "../../components/admin/clients/ClientView";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";

const ClientPage = () => {
  const { clientId = "" } = useParams();
  const { addToast } = useToastContext();
  const navigate = useNavigate();
  const [bookAgain, setBookAgain] = useState<{ phone: string; name: string } | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 900 }}>
      <Link
        to="/admin/clients"
        data-testid="back-to-clients"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ink-soft)", fontSize: "var(--text-sm)" }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> All clients
      </Link>

      <ClientView
        key={clientId}
        clientId={clientId}
        role="owner"
        onBookAgain={(name, phone) => setBookAgain({ name, phone })}
        onNotice={(m, kind) => addToast(m, kind)}
        onGone={(_m, to) => navigate(to ?? "/admin/clients", { replace: true })}
      />

      {bookAgain && (
        <CreateBookingModal
          prefillStylistId=""
          prefillTime=""
          prefillDate={todayString()}
          prefillCustomerName={bookAgain.name}
          prefillCustomerPhone={bookAgain.phone}
          onClose={() => setBookAgain(null)}
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default ClientPage;
