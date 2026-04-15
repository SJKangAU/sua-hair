// ClientsPage.tsx
// Clients tab — search clients by name or phone
// Displays ClientProfile cards with visit history and total spend
// "Book again" button opens the CreateBookingModal pre-filled

import { useState, useCallback } from "react";
import ClientSearch from "../../components/admin/clients/ClientSearch";
import ClientCard from "../../components/admin/clients/ClientCard";
import CreateBookingModal from "../../components/admin/modals/CreateBookingModal";
import type { ClientProfile } from "../../components/admin/clients/ClientSearch";
import { useToastContext } from "../../context/ToastContext";
import { useBookingContext } from "../../context/BookingContext";

const ClientsPage = () => {
  const { addToast } = useToastContext();
  const { loading: bookingsLoading } = useBookingContext();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [bookAgainClient, setBookAgainClient] = useState<{
    phone: string;
    name: string;
  } | null>(null);

  const handleResults = useCallback((results: ClientProfile[]) => {
    setClients(results);
    setHasSearched(true);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
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

      {/* Search */}
      <ClientSearch onResults={handleResults} />

      {/* Loading state — while bookings subscription is initialising */}
      {bookingsLoading && (
        <p
          style={{ textAlign: "center", color: "#6b6b6b", fontSize: "0.9rem" }}
        >
          Loading...
        </p>
      )}

      {/* Empty state — before any search */}
      {!bookingsLoading && !hasSearched && (
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

      {/* No results */}
      {!bookingsLoading && hasSearched && clients.length === 0 && (
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

      {/* Results count */}
      {!bookingsLoading && clients.length > 0 && (
        <p style={{ fontSize: "0.82rem", color: "#6b6b6b", margin: 0 }}>
          {clients.length} client{clients.length > 1 ? "s" : ""} found
        </p>
      )}

      {/* Client cards */}
      {!bookingsLoading &&
        clients.map((client) => (
          <ClientCard
            key={client.phone || client.name}
            client={client}
            onBookAgain={(phone, name) => setBookAgainClient({ phone, name })}
          />
        ))}

      {/* Book again modal */}
      {bookAgainClient && (
        <CreateBookingModal
          prefillCustomerName={bookAgainClient.name}
          prefillCustomerPhone={bookAgainClient.phone}
          prefillStylistId=""
          prefillTime=""
          prefillDate={new Date().toISOString().split("T")[0]}
          onClose={() => setBookAgainClient(null)}
          onSuccess={(msg) => addToast(msg, "success")}
          onError={(msg) => addToast(msg, "error")}
        />
      )}
    </div>
  );
};

export default ClientsPage;
