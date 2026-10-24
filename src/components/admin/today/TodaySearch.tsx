// TodaySearch.tsx
// One search box over bookings and clients, focused with Ctrl K (or Cmd K).
//   Bookings  matched in memory from the loaded bookings (name, phone, service)
//             — upcoming first
//   Clients   looked up in the whole booking history (name prefix or exact
//             mobile number), grouped one row per client
// Arrow keys move through the results, Enter opens one, Escape closes. A
// booking result opens its drawer on its date; a client result opens the
// Clients tab on that client.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import Badge from "../../ui/Badge";
import { useBookingContext } from "../../../context/BookingContext";
import { formatWhen } from "../../../lib/bookingHistory";
import { fetchBookingsForClientQuery } from "../../../lib/clientSearch";
import { phoneMatches } from "../../../lib/phoneSearch";
import { groupClientHits, type ClientHit } from "../../../lib/clientHits";
import { todayString } from "../../../lib/dates";
import type { Booking } from "../../../types";

interface Props {
  onOpenBooking: (booking: Booking) => void;
  onOpenClient: (client: ClientHit) => void;
}

const MAX_BOOKINGS = 6;
const MAX_CLIENTS = 4;

type Result =
  | { kind: "booking"; booking: Booking }
  | { kind: "client"; client: ClientHit };

const TodaySearch = ({ onOpenBooking, onOpenClient }: Props) => {
  const { bookings } = useBookingContext();
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [clientState, setClientState] = useState<{
    term: string;
    hits: ClientHit[];
  }>({ term: "", hits: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const listId = useId();

  const q = term.trim();
  const searching = q.length >= 2;

  // Ctrl K / Cmd K from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clients: debounced Firestore lookup; a slower earlier request never
  // overwrites a newer one
  useEffect(() => {
    if (!searching) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const found = await fetchBookingsForClientQuery(q);
        if (id !== requestId.current) return;
        setClientState({
          term: q,
          hits: groupClientHits(found).slice(0, MAX_CLIENTS),
        });
      } catch (err) {
        console.error("Today search (clients):", err);
        if (id === requestId.current) setClientState({ term: q, hits: [] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, searching]);

  // Bookings: matched in memory, upcoming first then most recent past
  const bookingHits = useMemo(() => {
    if (!searching) return [];
    const lower = q.toLowerCase();
    const today = todayString();
    return bookings
      .filter(
        (b) =>
          (b.bookingType === "customer" || b.bookingType === "walkin") &&
          (b.customerName.toLowerCase().includes(lower) ||
            b.serviceName.toLowerCase().includes(lower) ||
            phoneMatches(b.customerPhone, q)),
      )
      .sort((a, b) => {
        const aUp = a.date >= today;
        const bUp = b.date >= today;
        if (aUp !== bUp) return aUp ? -1 : 1;
        return aUp
          ? a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
          : b.date.localeCompare(a.date);
      })
      .slice(0, MAX_BOOKINGS);
  }, [bookings, q, searching]);

  // Only show client hits that belong to what is typed now
  const clientHits = searching && clientState.term === q ? clientState.hits : [];
  const clientsPending = searching && clientState.term !== q;

  const results: Result[] = [
    ...bookingHits.map((booking): Result => ({ kind: "booking", booking })),
    ...clientHits.map((client): Result => ({ kind: "client", client })),
  ];
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const open = focused && searching;

  const choose = (r: Result) => {
    setTerm("");
    setFocused(false);
    inputRef.current?.blur();
    if (r.kind === "booking") onOpenBooking(r.booking);
    else onOpenClient(r.client);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setTerm("");
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      choose(results[activeIndex]);
    }
  };

  const rowStyle = (isActive: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    padding: "0.6rem 0.875rem",
    background: isActive ? "var(--surface-raised)" : "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
  });

  const sectionLabel = (text: string) => (
    <p
      style={{
        margin: 0,
        padding: "0.5rem 0.875rem 0.25rem",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--ink-muted)",
      }}
    >
      {text}
    </p>
  );

  return (
    <div style={{ position: "relative", width: "min(100%, 280px)" }}>
      <Search
        size={16}
        strokeWidth={2}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "0.75rem",
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--ink-muted)",
          pointerEvents: "none",
        }}
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search clients and bookings"
        value={term}
        placeholder="Search clients and bookings"
        onChange={(e) => {
          setTerm(e.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onInputKey}
        style={{
          width: "100%",
          padding: "0.6rem 3.75rem 0.6rem 2.25rem",
          border: "1px solid var(--border-strong)",
          borderRadius: "8px",
          fontSize: "var(--text-base)",
          fontFamily: "var(--font-body)",
          background: "var(--surface)",
          color: "var(--ink)",
          boxSizing: "border-box",
        }}
      />
      {!term && (
        <kbd
          aria-hidden="true"
          style={{
            position: "absolute",
            right: "0.6rem",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "1px 6px",
            border: "1px solid var(--border-strong)",
            borderRadius: "4px",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-body)",
            color: "var(--ink-muted)",
            pointerEvents: "none",
          }}
        >
          Ctrl K
        </kbd>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          // mousedown (not click) so choosing a row happens before the input
          // loses focus and closes the list
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            minWidth: "320px",
            maxHeight: "70vh",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "var(--shadow-lg)",
            zIndex: 40,
            paddingBottom: "0.25rem",
          }}
        >
          {bookingHits.length > 0 && sectionLabel("Bookings")}
          {bookingHits.map((b, i) => (
            <button
              key={b.id}
              role="option"
              aria-selected={activeIndex === i}
              className="bk-row"
              onClick={() => choose({ kind: "booking", booking: b })}
              onMouseEnter={() => setActive(i)}
              style={rowStyle(activeIndex === i)}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {b.customerName}
                </span>
                <Badge variant={b.status} />
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  color: "var(--ink-muted)",
                }}
              >
                {formatWhen(b.date, b.time)} · {b.serviceName}
              </span>
            </button>
          ))}

          {clientHits.length > 0 && sectionLabel("Clients")}
          {clientHits.map((c, i) => {
            const index = bookingHits.length + i;
            return (
              <button
                key={c.key}
                role="option"
                aria-selected={activeIndex === index}
                className="bk-row"
                onClick={() => choose({ kind: "client", client: c })}
                onMouseEnter={() => setActive(index)}
                style={rowStyle(activeIndex === index)}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {c.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--text-sm)",
                    color: "var(--ink-muted)",
                  }}
                >
                  {c.phone || "No phone"} · {c.visits} visit
                  {c.visits === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}

          {results.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: "0.875rem",
                fontSize: "var(--text-sm)",
                color: "var(--ink-muted)",
              }}
            >
              {clientsPending ? "Searching…" : "No clients or bookings found."}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TodaySearch;
