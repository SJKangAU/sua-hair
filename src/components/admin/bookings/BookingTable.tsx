// BookingTable.tsx
// Upgraded bookings list with:
// - Debounced search by name and phone
// - Bulk selection with confirm/cancel all
// - CSV export
// - Booking type badge via BookingCard
// - Sorted by date and time ascending

import { useState, useCallback } from "react";
import { Download, History } from "lucide-react";
import BookingCard from "./BookingCard";
import useBookingActions from "../../../hooks/useBookingActions";
import { isOpenStatus } from "../../../lib/bookingStatus";
import { groupBookingsByDate } from "../../../lib/bookingGroups";
import { timeStringToMinutes } from "../../../lib/scheduling";
import { todayString } from "../../../lib/dates";
import SearchBar from "./SearchBar";
import BulkActions from "./BulkActions";
import type { Booking, BookingStatus } from "../../../types";
import { filterBookings, type Filters } from "../../../lib/bookingFilters";

interface Props {
  bookings: Booking[];
  filters: Filters;
  onUpdate: (id: string, status: BookingStatus) => void;
  onSetFlag: (id: string, flagged: boolean, reason?: string) => void;
}

// Convert bookings array to CSV string and trigger download
const exportToCSV = (bookings: Booking[]) => {
  const headers = [
    "Date",
    "Time",
    "Customer Name",
    "Phone",
    "Stylist",
    "Service",
    "Price",
    "Duration",
    "Status",
    "Type",
    "Notes",
  ];

  const rows = bookings.map((b) => [
    b.date,
    b.time,
    b.customerName,
    b.customerPhone || "",
    b.stylistName,
    b.serviceName,
    `$${b.servicePrice}`,
    `${b.totalTime}min`,
    b.status,
    b.bookingType,
    b.notes || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sua-hair-bookings-${
    todayString()
  }.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const BookingTable = ({ bookings, filters, onUpdate, onSetFlag }: Props) => {
  const { changeStatuses } = useBookingActions();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPast, setShowPast] = useState(false);

  // Filters + search share the exact predicate BookingsPage uses for its count
  const searched = filterBookings(bookings, filters, searchQuery);

  // Everything that matches, soonest first — what Export CSV writes
  const allSorted = [...searched].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
  });

  // The list itself: upcoming days first, grouped (Today, Tomorrow, then
  // dates). Past days stay hidden until asked for — but a search, or a date
  // range the owner chose, is a deliberate look at the past, so it shows them.
  const forcePast =
    searchQuery !== "" || !!filters.dateFrom || !!filters.dateTo;
  const includePast = showPast || forcePast;
  const { groups, pastCount } = groupBookingsByDate(
    searched,
    todayString(),
    includePast,
  );
  const visible = groups.flatMap((g) => g.bookings);

  // ── Selection handlers ──────────────────────────────────────────────────────

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === visible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visible.map((b) => b.id)));
    }
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const handleBulkConfirm = async () => {
    const pending = visible.filter(
      (b) => selectedIds.has(b.id) && b.status === "pending",
    );
    // One summary toast ("3 bookings confirmed"), not one per booking
    await changeStatuses(
      pending.map((b) => b.id),
      "confirmed",
    );
    setSelectedIds(new Set());
  };

  const handleBulkCancel = async () => {
    // Only bookings still to be served can be cancelled — not completed,
    // no-show or already-cancelled ones. One summary toast with a single Undo.
    const cancellable = visible.filter(
      (b) => selectedIds.has(b.id) && isOpenStatus(b.status),
    );
    await changeStatuses(
      cancellable.map((b) => b.id),
      "cancelled",
    );
    setSelectedIds(new Set());
  };

  // Memoised search handler to prevent unnecessary re-renders
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedIds(new Set()); // clear selection on new search
  }, []);

  const allSelected = visible.length > 0 && selectedIds.size === visible.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Search, past toggle and export row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <SearchBar onSearch={handleSearch} />
        {pastCount > 0 && !forcePast && (
          <button
            className="bk-ghost"
            onClick={() => setShowPast((v) => !v)}
            aria-pressed={showPast}
            style={toolbarButton}
          >
            <History size={15} strokeWidth={2} aria-hidden="true" />
            {showPast ? "Hide" : "Show"} past bookings ({pastCount})
          </button>
        )}
        <button
          className="bk-ghost"
          onClick={() => exportToCSV(allSorted)}
          style={toolbarButton}
        >
          <Download size={15} strokeWidth={2} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Bulk actions bar */}
      <BulkActions
        selectedCount={selectedIds.size}
        onConfirmAll={handleBulkConfirm}
        onCancelAll={handleBulkCancel}
        onClearSelection={handleClearSelection}
      />

      {/* Select all row */}
      {visible.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.4rem 1.25rem",
            fontSize: "0.82rem",
            color: "var(--grey-muted)",
          }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            style={{ cursor: "pointer", width: "16px", height: "16px" }}
          />
          <span>
            {allSelected
              ? "Deselect all"
              : `Select all ${visible.length} bookings`}
          </span>
        </div>
      )}

      {/* Empty state */}
      {visible.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            color: "var(--grey-muted)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            {pastCount > 0 && !includePast
              ? "No upcoming bookings"
              : "No bookings found"}
          </p>
          <p style={{ fontSize: "0.85rem" }}>
            {searchQuery
              ? `No results for "${searchQuery}"`
              : pastCount > 0 && !includePast
              ? `There ${
                  pastCount === 1
                    ? "is 1 past booking"
                    : `are ${pastCount} past bookings`
                } — use "Show past bookings" above.`
              : "Try adjusting your filters"}
          </p>
        </div>
      )}

      {/* Booking cards, grouped by day */}
      {groups.map((group) => (
        <section
          key={group.date}
          aria-label={group.label}
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <h3
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.5rem",
              margin: "0.75rem 0 0",
              padding: "0 0.25rem 0.4rem",
              borderBottom: "1px solid var(--border)",
              fontSize: "var(--text-base)",
              fontWeight: 700,
              color: group.isPast ? "var(--ink-muted)" : "var(--ink)",
            }}
          >
            {group.label}
            <span
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 400,
                color: "var(--ink-muted)",
              }}
            >
              {group.bookings.length} booking
              {group.bookings.length === 1 ? "" : "s"}
            </span>
          </h3>
          {group.bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              selected={selectedIds.has(booking.id)}
              onSelect={handleSelect}
              onUpdate={onUpdate}
              onSetFlag={onSetFlag}
            />
          ))}
        </section>
      ))}
    </div>
  );
};

const toolbarButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.6rem 1rem",
  background: "var(--surface)",
  color: "var(--ink)",
  border: "1px solid var(--border-strong)",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
  whiteSpace: "nowrap",
};

export default BookingTable;
