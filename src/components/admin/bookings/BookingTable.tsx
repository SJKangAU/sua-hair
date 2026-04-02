// BookingTable.tsx
// Upgraded bookings list with:
// - Debounced search by name and phone
// - Bulk selection with confirm/cancel all
// - CSV export
// - Booking type badge via BookingCard
// - Sorted by date and time ascending

import { useState, useCallback } from "react";
import BookingCard from "./BookingCard";
import SearchBar from "./SearchBar";
import BulkActions from "./BulkActions";
import type { Booking } from "../../../types";
import type { Filters } from "../FilterBar";

interface Props {
  bookings: Booking[];
  filters: Filters;
  onUpdate: (id: string, status: "pending" | "confirmed" | "cancelled") => void;
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
    new Date().toISOString().split("T")[0]
  }.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const BookingTable = ({ bookings, filters, onUpdate }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Apply filters
  const filtered = bookings.filter((b) => {
    if (filters.stylistId && b.stylistId !== filters.stylistId) return false;
    if (filters.date && b.date !== filters.date) return false;
    if (filters.status && b.status !== filters.status) return false;
    return true;
  });

  // Apply search — matches name or phone
  const searched = searchQuery
    ? filtered.filter(
        (b) =>
          b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.customerPhone && b.customerPhone.includes(searchQuery)),
      )
    : filtered;

  // Sort by date then time ascending
  const sorted = [...searched].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  // ── Selection handlers ──────────────────────────────────────────────────────

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selected ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((b) => b.id)));
    }
  };

  const handleClearSelection = () => setSelectedIds(new Set());

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const handleBulkConfirm = async () => {
    const pending = sorted.filter(
      (b) => selectedIds.has(b.id) && b.status === "pending",
    );
    await Promise.all(pending.map((b) => onUpdate(b.id, "confirmed")));
    setSelectedIds(new Set());
  };

  const handleBulkCancel = async () => {
    const cancellable = sorted.filter(
      (b) => selectedIds.has(b.id) && b.status !== "cancelled",
    );
    await Promise.all(cancellable.map((b) => onUpdate(b.id, "cancelled")));
    setSelectedIds(new Set());
  };

  // Memoised search handler to prevent unnecessary re-renders
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedIds(new Set()); // clear selection on new search
  }, []);

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Search and export row */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <SearchBar onSearch={handleSearch} />
        <button
          onClick={() => exportToCSV(sorted)}
          style={{
            padding: "0.6rem 1rem",
            background: "#1a1a1a",
            color: "#aaa",
            border: "1px solid #555",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "0.82rem",
            whiteSpace: "nowrap",
          }}
        >
          ↓ Export CSV
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
      {sorted.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.4rem 1.25rem",
            fontSize: "0.82rem",
            color: "#6b6b6b",
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
              : `Select all ${sorted.length} bookings`}
          </span>
        </div>
      )}

      {/* Empty state */}
      {sorted.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            background: "white",
            borderRadius: "10px",
            color: "#6b6b6b",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            No bookings found
          </p>
          <p style={{ fontSize: "0.85rem" }}>
            {searchQuery
              ? `No results for "${searchQuery}"`
              : "Try adjusting your filters"}
          </p>
        </div>
      )}

      {/* Booking cards */}
      {sorted.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          selected={selectedIds.has(booking.id)}
          onSelect={handleSelect}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
};

export default BookingTable;
