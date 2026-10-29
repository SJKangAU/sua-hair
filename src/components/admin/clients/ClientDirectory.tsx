// ClientDirectory.tsx
// The client list: a search box, filters, a sort, and 25 clients at a time (a table
// on a wide screen, cards on a phone). One component for both roles:
//   owner    a summary strip, then name (with status badges), phone, last visit, next booking,
//            visits, spend, tags
//   stylist  name (allergy badge), phone, tags - their own clients, plus a colleague's or everyone's when
//            the owner has allowed it (a picker appears), no spend
// Clicking a client calls onOpen(id) (a drawer, or the full page).

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Search, Send, TriangleAlert, Users } from "lucide-react";
import useClientDirectory from "../../../hooks/useClientDirectory";
import Avatar from "../../ui/Avatar";
import ClientSummaryStrip from "./ClientSummaryStrip";
import { businessToday } from "../../../lib/businessTime";
import { useSalonData } from "../../../context/SalonDataContext";
import { retouchDue } from "../../../lib/retouch";
import { fmtDate, fmtMoney, sinceLabel } from "../../../lib/clientFormat";
import { scopeOptions, type ClientAccess } from "../../../lib/clientAccess";
import {
  LAPSED_DAYS,
  NEW_DAYS,
  matchesFilter,
  type DirectoryFilter,
  type DirectorySort,
} from "../../../lib/clients";
import type { Client, ClientCard } from "../../../types";

interface Props {
  role: "owner" | "stylist";
  stylistId?: string;
  // whose clients this stylist may open beyond their own (FR-025), and display names
  access?: ClientAccess;
  stylistNames?: Record<string, string>;
  onOpen: (clientId: string) => void;
  initialSearch?: string;
  // shows the "Invite lapsed clients back" button (the owner, or a stylist allowed to send win-back messages)
  onInviteBack?: () => void;
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
  .cd-skeleton { height: 14px; border-radius: 6px; background: var(--surface-raised); animation: cd-pulse 1.4s ease-in-out infinite; }
  @keyframes cd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { .cd-skeleton { animation: none; } }
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

const softBadge: React.CSSProperties = {
  ...badge,
  border: "1px solid var(--border-strong)",
  fontWeight: 500,
  color: "var(--ink-soft)",
};

const isFull = (c: Client | ClientCard): c is Client => "totalVisits" in c;

const ClientDirectory = ({ role, stylistId, access, stylistNames, onOpen, initialSearch = "", onInviteBack }: Props) => {
  const options = useMemo(
    () => (role === "stylist" && stylistId ? scopeOptions(stylistId, access ?? { all: false, stylistIds: [] }, stylistNames) : []),
    [role, stylistId, access, stylistNames],
  );
  const [scopeKey, setScopeKey] = useState("mine");
  const chosen = options.find((o) => o.key === scopeKey) ?? options[0];
  const d = useClientDirectory(role, chosen?.scope);
  // /admin/clients?q=... starts a search (the Today page's search sends people here)
  const { setSearch } = d;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialSearch) return;
    seeded.current = true;
    setSearch(initialSearch);
  }, [initialSearch, setSearch]);
  const owner = role === "owner";
  const today = businessToday();
  const { services } = useSalonData();
  const sortable = owner && d.filter === "all" && !d.searching;

  return (
    <div data-testid="client-directory" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <style>{CSS}</style>

      {owner && <ClientSummaryStrip filter={d.filter} onPick={d.setFilter} />}

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

      {!owner && onInviteBack && (
        <div>
          <button type="button" data-testid="invite-back" onClick={onInviteBack} style={{ ...chip(false), display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Send size={13} aria-hidden="true" /> Invite lapsed clients back
          </button>
        </div>
      )}

      {options.length > 1 && (
        <label style={{ fontSize: "var(--text-sm)", color: "var(--ink-muted)" }}>
          Show{" "}
          <select
            aria-label="Whose clients"
            data-testid="client-scope"
            value={chosen?.key}
            onChange={(e) => setScopeKey(e.target.value)}
            style={{ padding: "0.3rem", border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--surface)", color: "var(--ink)" }}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

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
          {onInviteBack && (
            <button type="button" data-testid="invite-back" onClick={onInviteBack} style={{ ...chip(false), display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Send size={13} aria-hidden="true" /> Invite lapsed clients back
            </button>
          )}
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
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", overflow: "hidden" }}>
          <p role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", margin: 0 }}>
            Loading clients...
          </p>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.8rem 1rem", borderTop: i ? "1px solid var(--border)" : "none" }}
            >
              <span className="cd-skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
              <span style={{ flex: 1, display: "grid", gap: 6 }}>
                <span className="cd-skeleton" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
                <span className="cd-skeleton" style={{ width: "25%", height: 10 }} />
              </span>
            </div>
          ))}
        </div>
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
              : chosen && chosen.key !== "mine"
              ? "No clients to show here yet."
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
                  <span className="cd-name" style={{ display: "flex", gap: "0.65rem", alignItems: "center", minWidth: 0 }}>
                    <Avatar name={c.name} size={36} />
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                        <span data-testid="client-row-name" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        {c.blocked && (
                          <span style={badge} title="Blocked">
                            <Ban size={11} aria-hidden="true" /> Blocked
                          </span>
                        )}
                        {c.allergies && (
                          <span style={{ ...badge, borderColor: "var(--error)", color: "var(--error)" }} title={c.allergies} data-testid="allergy-badge">
                            <TriangleAlert size={11} aria-hidden="true" /> Allergy
                          </span>
                        )}
                        {owner && isFull(c) && matchesFilter(c, "new", today) && <span style={softBadge}>New</span>}
                        {owner && isFull(c) && matchesFilter(c, "lapsed", today) && <span style={softBadge}>Lapsed</span>}
                        {owner && isFull(c) && (() => {
                          const due = retouchDue(c, services, today);
                          return due && due.state !== "later" ? (
                            <span style={softBadge} data-testid="retouch-badge" title={`Due for a retouch ${due.dueDate}`}>
                              {due.state === "overdue" ? "Retouch overdue" : "Retouch due soon"}
                            </span>
                          ) : null;
                        })()}
                        {owner && isFull(c) && c.noShowCount > 0 && (
                          <span style={softBadge}>
                            {c.noShowCount} no-show{c.noShowCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                      {owner && isFull(c) && c.lastVisit && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--ink-muted)" }}>
                          Last seen {sinceLabel(c.lastVisit, today)}
                        </span>
                      )}
                    </span>
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
