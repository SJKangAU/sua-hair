// ClientsPage.tsx
// Clients tab — search clients by name or phone
// Uses ToastContext directly — no addToast prop needed
// Book again pre-fills customer name and phone in CreateBookingModal

import { useState, useCallback } from "react";
import { useToastContext } from "../../context/ToastContext";
import ClientSearch from "../../components/admin/clients/ClientSearch";
import ClientCard from "../../components/admin/clients/ClientCard";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";
import type { ClientProfile } from "../../components/admin/clients/ClientSearch";

const ClientsPage = () => {
  const { addToast } = useToastContext();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [bookAgainClient, setBookAgainClient] = useState<{
    phone: string;
    name: string;
  } | null>(null);

  const handleResults = useCallback((results: ClientProfile[]) => {
    setClients(results);
    setHasSearched(true);
  }, []);

  const handleLoading = useCallback((isLoading: boolean) => {
    setLoading(isLoading);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Client History
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#6b6b6b", margin: 0 }}>
          Search by name or mobile number to view visit history and spending.
        </p>
      </div>

      <ClientSearch onResults={handleResults} onLoading={handleLoading} />

      {loading && (
        <p
          style={{ textAlign: "center", color: "#6b6b6b", fontSize: "0.9rem" }}
        >
          Searching...
        </p>
      )}

      {!loading && !hasSearched && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            background: "white",
            borderRadius: "12px",
            color: "#6b6b6b",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👥</p>
          <p style={{ fontSize: "0.9rem" }}>
            Type at least 2 characters to search clients
          </p>
        </div>
      )}

      {!loading && hasSearched && clients.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            background: "white",
            borderRadius: "12px",
            color: "#6b6b6b",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ fontSize: "1rem", fontWeight: 500 }}>No clients found</p>
          <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Try a different name or mobile number
          </p>
        </div>
      )}

      {!loading && clients.length > 0 && (
        <p style={{ fontSize: "0.82rem", color: "#6b6b6b", margin: 0 }}>
          {clients.length} client{clients.length > 1 ? "s" : ""} found
        </p>
      )}

      {!loading &&
        clients.map((client) => (
          <ClientCard
            key={client.phone || client.name}
            client={client}
            onBookAgain={(phone, name) => setBookAgainClient({ phone, name })}
          />
        ))}

      {/* Book again modal — pre-fills customer name and phone */}
      {bookAgainClient && (
        <CreateBookingModal
          prefillStylistId=""
          prefillTime=""
          prefillDate={new Date().toISOString().split("T")[0]}
          prefillCustomerName={bookAgainClient.name}
          prefillCustomerPhone={bookAgainClient.phone}
          onClose={() => setBookAgainClient(null)}
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default ClientsPage;
