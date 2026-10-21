// ClientHistory.tsx
// A client's bookings, upcoming first then past, newest first: date, time, services,
// stylist, price, status and where it came from. 25 at a time, loading only THIS
// client's bookings. The owner can open a booking from a row; a stylist sees only
// their own bookings with this client, plus (with the owner's say-so, FR-025) a
// colleague's - shown with the colleague's name and no price.

import { useNavigate } from "react-router-dom";
import { useClientBookings } from "../../../hooks/useClientData";
import { STATUS_LABELS } from "../../../lib/bookingStatus";
import { businessToday } from "../../../lib/businessTime";
import { fmtDate, fmtMoney } from "../../../lib/clientFormat";
import type { ClientAccess } from "../../../lib/clientAccess";
import type { Booking } from "../../../types";

interface Props {
  clientId: string;
  role: "owner" | "stylist";
  stylistId?: string;
  access?: ClientAccess;
  // changes when the client's figures change, so the list is read again
  version?: string;
}

const sourceLabel = (b: Booking): string => (b.bookingType === "walkin" ? "Walk-in" : "Online");

const Row = ({ b, owner, ownStylistId, onOpen }: { b: Booking; owner: boolean; ownStylistId?: string; onOpen?: () => void }) => {
  // a stylist sees prices and no name on their own bookings, and the name only on a colleague's
  const theirs = !owner && !!ownStylistId && b.stylistId !== ownStylistId;
  const dim = b.status === "cancelled" || b.status === "no_show";
  const body = (
    <>
      <span style={{ fontWeight: 600 }}>
        {fmtDate(b.date)}, {b.time}
      </span>
      <span style={{ color: "var(--ink-soft)" }}>{b.serviceName}</span>
      <span>{owner || theirs ? b.stylistName : ""}</span>
      <span>{theirs ? "" : fmtMoney(b.servicePrice ?? 0)}</span>
      <span>
        {STATUS_LABELS[b.status]} · {sourceLabel(b)}
      </span>
    </>
  );
  const style: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(140px, 1.4fr) minmax(140px, 2fr) minmax(90px, 1fr) 70px minmax(130px, 1.2fr)",
    gap: "0.6rem",
    alignItems: "center",
    width: "100%",
    padding: "0.6rem 0.85rem",
    border: "none",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    textAlign: "left",
    fontFamily: "var(--font-body)",
    fontSize: "var(--text-sm)",
    color: dim ? "var(--ink-muted)" : "var(--ink)",
    textDecoration: dim ? "line-through" : "none",
  };
  return onOpen ? (
    <button type="button" style={{ ...style, cursor: "pointer" }} onClick={onOpen} data-testid="history-row">
      {body}
    </button>
  ) : (
    <div style={style} data-testid="history-row">
      {body}
    </div>
  );
};

const ClientHistory = ({ clientId, role, stylistId, access, version }: Props) => {
  const { rows, loading, error, hasMore, loadMore, reload } = useClientBookings(clientId, role, stylistId, version, access);
  const navigate = useNavigate();
  const owner = role === "owner";
  const today = businessToday();

  // Breaks and training never belong to a client; guard anyway
  const mine = rows.filter((b) => b.bookingType === "customer" || b.bookingType === "walkin");
  const upcoming = mine.filter((b) => b.date > today && (b.status === "pending" || b.status === "confirmed"));
  const past = mine.filter((b) => !upcoming.includes(b));

  const open = (b: Booking) => (owner ? () => navigate(`/admin/today?date=${b.date}&booking=${b.id}`) : undefined);

  return (
    <section aria-labelledby="client-history-heading" data-testid="client-history">
      <h3 id="client-history-heading" style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 0.6rem" }}>
        {owner ? "Booking history" : "Your bookings with this client"}
      </h3>
      {loading && (
        <p role="status" style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>
          Loading bookings...
        </p>
      )}
      {error && (
        <p role="alert">
          Couldn't load the bookings.{" "}
          <button type="button" onClick={reload}>
            Try again
          </button>
        </p>
      )}
      {!loading && !error && mine.length === 0 && (
        <p style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)", margin: 0 }}>
          No bookings yet{owner ? " (an imported client has none until they book)" : ""}.
        </p>
      )}
      {[
        { label: "Upcoming", list: upcoming },
        { label: "Past", list: past },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.label} style={{ marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 0.3rem", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" }}>
              {g.label}
            </p>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto" }}>
              <div style={{ minWidth: 620 }}>
                {g.list.map((b) => (
                  <Row key={b.id} b={b} owner={owner} ownStylistId={stylistId} onOpen={open(b)} />
                ))}
              </div>
            </div>
          </div>
        ))}
      {hasMore && (
        <button
          type="button"
          data-testid="history-more"
          onClick={loadMore}
          style={{ padding: "0.5rem 1.2rem", border: "1px solid var(--border-strong)", borderRadius: 999, background: "transparent", cursor: "pointer", color: "var(--ink)" }}
        >
          Show older bookings
        </button>
      )}
    </section>
  );
};

export default ClientHistory;
