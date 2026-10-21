// ClientDirectory.tsx
// The client list: a search box, filters, a sort, and 25 clients at a time (a table
// on a wide screen, cards on a phone). One component for both roles:
//   owner    name, phone, last visit, next booking, visits, spend, tags, blocked
//   stylist  name, phone, tags - their own clients only, no spend
// Clicking a client calls onOpen(id) (a drawer, or the full page).

import { useEffect, useRef } from "react";
import { Ban, Search, Users } from "lucide-react";
import useClientDirectory from "../../../hooks/useClientDirectory";
import { fmtDate, fmtMoney } from "../../../lib/clientFormat";
import {
  LAPSED_DAYS,
  NEW_DAYS,
  type DirectoryFilter,
  type DirectorySort,
} from "../../../lib/clients";
import type { Client, ClientCard } from "../../../types";

interface Props {
  role: "owner" | "stylist";
  stylistId?: string;
  onOpen: (clientId: string) => void;
  initialSearch?: string;
}

const FILTERS: { id: DirectoryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "lapsed", label: `Lapsed (${LAPSED_DAYS}+ days)` },
  { id: "new", label: `New (${NEW_DAYS} days)` },
  { id: "upcoming", label: "Has a booking" },
  { id: "noshows", label: "Has no-shows" },
  { id: "blocked", label: "Blocked" },
];

const SORTS: { id: DirectorySort; label: string }[] = [
  { id: "lastVisit", label: "Last visit" },
  { id: "name", label: "Name" },
  { id: "visits", label: "Visits" },
  { id: "spend", label: "Spend" },
];

const CSS = `
  .cd-head, .cd-row {
    display: grid;
    grid-template-columns: minmax(150px, 2fr) minmax(110px, 1.1fr) minmax(110px, 1fr) minmax(130px, 1.2fr) 70px 90px minmax(100px, 1fr);
    gap: 0.75rem;
    align-items: center;
  }
  .cd-head.stylist, .cd-row.stylist { grid-template-columns: minmax(160px, 2fr) minmax(120px, 1.2fr) minmax(100px, 1fr); }
  .cd-row {
    width: 100%;
    padding: 0.7rem 1rem;
    background: var(--surface);
    border: none;
    border-top: 1px solid var(--border);
    text-align: left;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink);
  }
  .cd-row:hover { background: var(--surface-raised); }
  .cd-row:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
  .cd-label { display: none; color: var(--ink-muted); font-size: var(--text-xs); }
  @media (max-width: 760px) {
    .cd-head { display: none; }
    .cd-row, .cd-row.stylist {
      grid-template-columns: 1fr 1fr;
      row-gap: 0.25rem;
      padding: 0.85rem 1rem;
    }
    .cd-row .cd-name { grid-column: 1 / -1; font-size: var(--text-base); }
    .cd-label { display: block; }
  }
`;

const chip = (active: boolean): React.CSSProperties => ({
  padding: "0.35rem 0.8rem",
  borderRadius: "999px",
  border: `1px solid ${active ? "var(--ink)" : "var(--border-strong)"}`,
  background: active ? "var(--ink)" : "transparent",
  color: active ? "var(--surface)" : "var(--ink)",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "3px",
  border: "1px solid var(--ink)",
  borderRadius: "999px",
  padding: "0 7px",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
};

const isFull = (c: Client | ClientCard): c is Client => "totalVisits" in c;

const ClientDirectory = ({ role, stylistId, onOpen, initialSearch = "" }: Props) => {
  const d = useClientDirectory(role, stylistId);
  // /admin/clients?q=... starts a search (the Today page's search sends people here)
  const { setSearch } = d;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialSearch) return;
    seeded.current = true;
    setSearch(initialSearch);
  }, [initialSearch, setSearch]);
  const owner = role === "owner";
  const sortable = owner && d.filter === "all" && !d.searching;

  return (
    <div data-testid="client-directory" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <style>{CSS}</style>

      <div style={{ position: "relative" }}>
        <Search
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{ position: "absolute", left: 12, top: 13, color: "var(--ink-muted)" }}
        />
        <input
          type="search"
          aria-label="Search clients"
          data-testid="client-search"
          placeholder={owner ? "Search by name or mobile number" : "Search your clients by name or mobile number"}
          value={d.search}
          onChange={(e) => d.setSearch(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "0.7rem 0.75rem 0.7rem 2.2rem",
            border: "1px solid var(--border-strong)",
            borderRadius: "8px",
            fontSize: "var(--text-base)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontFamily: "var(--font-body)",
          }}
        />
      </div>

      {owner && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <div role="group" aria-label="Filter clients" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={d.filter === f.id}
                data-testid={`filter-${f.id}`}
                onClick={() => d.setFilter(f.id)}
                style={chip(d.filter === f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label style={{ marginLeft: "auto", fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
            Sort{" "}
            <select
              aria-label="Sort clients"
              data-testid="client-sort"
              value={d.sort}
              disabled={!sortable}
              onChange={(e) => d.setSort(e.target.value as DirectorySort)}
              style={{ padding: "0.3rem", border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)" }}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {owner && !sortable && (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
          {d.searching
            ? "Searching: filters apply to the results, which are in name order."
            : "This list is in its own order (most recent first)."}
        </p>
      )}

      {d.error && (
        <div role="alert" style={{ padding: "0.9rem 1rem", border: "1px solid var(--ink)", borderRadius: 8 }}>
          {d.error}{" "}
          <button type="button" onClick={d.reload} style={{ ...chip(false), marginLeft: "0.5rem" }}>
            Try again
          </button>
        </div>
      )}

      {d.loading && (
        <p role="status" style={{ textAlign: "center", color: "var(--ink-muted)", margin: "1.5rem 0" }}>
          Loading clients...
        </p>
      )}

      {!d.loading && !d.error && d.items.length === 0 && (
        <div
          data-testid="client-empty"
          style={{ textAlign: "center", padding: "2.5rem 1rem", border: "1px solid var(--border)", borderRadius: 12, color: "var(--ink-muted)" }}
        >
          <Users size={30} strokeWidth={1.5} aria-hidden="true" />
          <p style={{ margin: "0.5rem 0 0", fontWeight: 500 }}>
            {d.searching || d.filter !== "all" ? "No clients match" : "No clients yet"}
          </p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "var(--text-sm)" }}>
            {d.searching
              ? "Try part of the name, a different spelling, or the start of the mobile number."
              : d.filter !== "all"
              ? "Try another filter."
              : owner
              ? "Clients appear when someone books. To add the ones you already have, use Manage → Build the client list."
              : "Clients appear here once they have booked with you."}
          </p>
        </div>
      )}

      {!d.loading && d.items.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
          <div
            className={`cd-head ${owner ? "" : "stylist"}`}
            aria-hidden="true"
            style={{ padding: "0.6rem 1rem", fontSize: "var(--text-xs)", color: "var(--ink-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            <span>Client</span>
            <span>Mobile</span>
            {owner && (
              <>
                <span>Last visit</span>
                <span>Next booking</span>
                <span>Visits</span>
                <span>Spend</span>
              </>
            )}
            <span>Tags</span>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Clients">
            {d.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cd-row ${owner ? "" : "stylist"}`}
                  data-testid="client-row"
                  onClick={() => onOpen(c.id)}
                >
                  <span className="cd-name" style={{ fontWeight: 600, display: "flex", gap: "0.5rem", alignItems: "center", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    {c.blocked && (
                      <span style={badge} title="Blocked">
                        <Ban size={11} aria-hidden="true" /> Blocked
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="cd-label">Mobile</span>
                    {c.phone}
                  </span>
                  {owner && isFull(c) && (
                    <>
                      <span>
                        <span className="cd-label">Last visit</span>
                        {fmtDate(c.lastVisit)}
                      </span>
                      <span>
                        <span className="cd-label">Next booking</span>
                        {c.hasUpcoming ? fmtDate(c.nextBookingDate) : "-"}
                      </span>
                      <span>
                        <span className="cd-label">Visits</span>
                        {c.totalVisits}
                      </span>
                      <span>
                        <span className="cd-label">Spend</span>
                        {fmtMoney(c.totalSpend)}
                      </span>
                    </>
                  )}
                  <span style={{ color: "var(--ink-soft)" }}>{c.tags.length ? c.tags.join(", ") : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.hasMore && !d.loading && (
        <button
          type="button"
          data-testid="client-more"
          onClick={d.loadMore}
          disabled={d.loadingMore}
          style={{ ...chip(false), alignSelf: "center", padding: "0.55rem 1.4rem" }}
        >
          {d.loadingMore ? "Loading..." : "Show more"}
        </button>
      )}
    </div>
  );
};

export default ClientDirectory;
