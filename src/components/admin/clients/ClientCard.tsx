// ClientCard.tsx
// Displays a single client profile with visit history
// Shows name, phone, visit count, total spend, favourite stylist
// Expandable to show full booking history
// "Book again" button pre-fills the create booking modal

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import Badge from "../../ui/Badge";
import Modal from "../../ui/Modal";
import { functions } from "../../../lib/firebase";
import { useToastContext } from "../../../context/ToastContext";
import type { ClientProfile } from "./ClientSearch";
import { MOBILE_BREAKPOINT } from "../../../lib/breakpoints";

interface Props {
  client: ClientProfile;
  onBookAgain: (phone: string, name: string) => void;
  // Called after this client's data has been deleted, so the parent can drop
  // the card from the current results.
  onDeleted: (phone: string) => void;
}

// Inline styles can't express media queries, so the booking-history row's
// grid layout lives in a class that collapses to a single column on phones.
const HISTORY_ROW_CSS = `
  .admin-history-row {
    display: grid;
    grid-template-columns: 100px 1fr 80px 80px auto;
    align-items: center;
    gap: 1rem;
  }
  @media (max-width: ${MOBILE_BREAKPOINT}px) {
    .admin-history-row {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 0.35rem;
    }
  }
`;

const ClientCard = ({ client, onBookAgain, onDeleted }: Props) => {
  const { addToast } = useToastContext();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Irreversibly anonymise this customer's booking history (name/phone/notes
  // stripped, booking records themselves kept) via the owner-only
  // deleteCustomerData callable. See functions/src/index.ts.
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const deleteCustomerData = httpsCallable<
        { phone: string },
        { anonymisedCount: number }
      >(functions, "deleteCustomerData");
      const { data } = await deleteCustomerData({ phone: client.phone });
      const n = data.anonymisedCount;
      addToast(
        `Customer data deleted — ${n} booking${n === 1 ? "" : "s"} anonymised.`,
        "success",
      );
      setConfirming(false);
      onDeleted(client.phone);
    } catch (err) {
      console.error("deleteCustomerData failed:", err);
      addToast("Could not delete customer data. Please try again.", "error");
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: "12px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {/* Client header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          padding: "1.25rem 1.5rem",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Avatar — initials */}
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--ink-soft)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "1.1rem",
              flexShrink: 0,
            }}
          >
            {client.name.charAt(0).toUpperCase()}
          </div>

          {/* Name, phone, loyalty badge */}
          <div>
            <p style={{ fontWeight: 700, fontSize: "1rem", margin: 0 }}>
              {client.name}
            </p>
            <a
              href={`tel:${client.phone}`}
              style={{
                color: "var(--ink-soft)",
                fontSize: "0.85rem",
                textDecoration: "underline",
              }}
            >
              {client.phone}
            </a>
            <div style={{ marginTop: "4px" }}>
              {client.visitCount >= 10 ? (
                <span
                  style={{
                    border: "1.5px solid var(--ink)",
                    color: "var(--ink)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "20px",
                  }}
                >
                  Loyal client
                </span>
              ) : client.visitCount >= 5 ? (
                <span
                  style={{
                    border: "1px solid var(--border-strong)",
                    color: "var(--ink-soft)",
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: "20px",
                  }}
                >
                  Regular
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              {client.visitCount}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--ink-muted)", margin: 0 }}>
              visits
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              ${client.totalSpend}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--ink-muted)", margin: 0 }}>
              total spend
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--ink)",
                margin: 0,
                whiteSpace: "nowrap",
              }}
            >
              {client.favouriteStylist.split(" ")[0]}
            </p>
            <p style={{ fontSize: "0.72rem", color: "var(--ink-muted)", margin: 0 }}>
              fav stylist
            </p>
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.6rem 1.5rem",
          background: "var(--paper)",
          borderTop: "1px solid var(--border)",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            fontSize: "0.8rem",
            color: "var(--ink-muted)",
          }}
        >
          <span>
            First visit: <strong>{client.firstVisit}</strong>
          </span>
          <span>
            Last visit: <strong>{client.lastVisit}</strong>
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => onBookAgain(client.phone, client.name)}
            style={{
              padding: "0.35rem 0.85rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + Book again
          </button>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              padding: "0.35rem 0.85rem",
              background: "none",
              border: "1px solid var(--border-strong)",
              borderRadius: "6px",
              fontSize: "0.78rem",
              cursor: "pointer",
              color: "var(--ink-muted)",
            }}
          >
            {expanded ? "Hide history" : "View history"}
          </button>
          <button
            onClick={() => setConfirming(true)}
            style={{
              padding: "0.35rem 0.85rem",
              background: "none",
              border: "1px solid var(--error)",
              borderRadius: "6px",
              fontSize: "0.78rem",
              cursor: "pointer",
              color: "var(--error)",
            }}
          >
            Delete data
          </button>
        </div>
      </div>

      {/* Irreversible-deletion confirmation */}
      {confirming && (
        <Modal
          title="Delete customer data?"
          onClose={() => !deleting && setConfirming(false)}
          width="440px"
        >
          <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
            This permanently removes <strong>{client.name}</strong>'s personal
            information — name, phone number and notes — from{" "}
            <strong>all {client.bookings.length}</strong> of their booking
            records, and deletes their saved contact record.
          </p>
          <p
            style={{
              margin: "0 0 1.5rem",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              color: "var(--ink-muted)",
            }}
          >
            The bookings themselves (service, price, date) are kept for business
            records, but they can no longer be linked back to this person.{" "}
            <strong style={{ color: "var(--error)" }}>
              This cannot be undone.
            </strong>
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              style={{
                padding: "0.55rem 1.1rem",
                background: "none",
                border: "1px solid var(--border-strong)",
                borderRadius: "6px",
                fontSize: "0.85rem",
                cursor: deleting ? "not-allowed" : "pointer",
                color: "var(--ink-muted)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: "0.55rem 1.1rem",
                background: "var(--error)",
                border: "1px solid var(--error)",
                borderRadius: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: deleting ? "not-allowed" : "pointer",
                color: "var(--surface)",
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}

      {/* Booking history — expandable */}
      {expanded && (
        <div style={{ padding: "1rem 1.5rem" }}>
          <p
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.75rem",
            }}
          >
            Booking History
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <style>{HISTORY_ROW_CSS}</style>
            {client.bookings.map((booking) => (
              <div
                key={booking.id}
                className="admin-history-row"
                style={{
                  padding: "0.6rem 0.75rem",
                  background: "var(--paper)",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                }}
              >
                <span style={{ color: "var(--ink-muted)" }}>{booking.date}</span>
                <span style={{ fontWeight: 500 }}>{booking.serviceName}</span>
                <span style={{ color: "var(--ink-muted)" }}>
                  {booking.stylistName.split(" ")[0]}
                </span>
                <span style={{ fontWeight: 600 }}>${booking.servicePrice}</span>
                <Badge variant={booking.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientCard;
