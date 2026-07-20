// FilterBar.tsx
// Filter controls for the bookings table
// Consumes stylists from SalonDataContext (Firestore) instead of hardcoded data.ts

import { useSalonData } from "../../context/SalonDataContext";
import {
  hasActiveFilters as computeHasActiveFilters,
  type Filters,
} from "../../lib/bookingFilters";

export type { Filters };

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClear: () => void;
}

const selectStyle = {
  padding: "0.5rem 0.75rem",
  border: "1px solid #ccc",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "#1a1a1a",
  color: "white",
  cursor: "pointer",
  outline: "none",
};

const FilterBar = ({ filters, onChange, onClear }: Props) => {
  // Consume stylists from Firestore via context
  const { stylists } = useSalonData();
  const hasActiveFilters = computeHasActiveFilters(filters);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "1rem 1.25rem",
        background: "#2a2a2a",
        borderRadius: "10px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}
    >
      <span style={{ color: "#aaa", fontSize: "0.82rem", fontWeight: 500 }}>
        Filter by:
      </span>

      {/* Stylist filter — driven by Firestore */}
      <select
        style={selectStyle}
        value={filters.stylistId}
        onChange={(e) => onChange({ ...filters, stylistId: e.target.value })}
      >
        <option value="">All stylists</option>
        {stylists.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {/* Date range filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input
          type="date"
          aria-label="From date"
          style={{ ...selectStyle, colorScheme: "dark" }}
          value={filters.dateFrom}
          max={filters.dateTo || undefined}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />
        <span style={{ color: "#666", fontSize: "0.8rem" }}>to</span>
        <input
          type="date"
          aria-label="To date"
          style={{ ...selectStyle, colorScheme: "dark" }}
          value={filters.dateTo}
          min={filters.dateFrom || undefined}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        />
      </div>

      {/* Status filter */}
      <select
        style={selectStyle}
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value })}
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="confirmed">Confirmed</option>
        <option value="cancelled">Cancelled</option>
      </select>

      {/* Flagged-only toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "#aaa",
          fontSize: "0.85rem",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={filters.flaggedOnly}
          onChange={(e) =>
            onChange({ ...filters, flaggedOnly: e.target.checked })
          }
          style={{ cursor: "pointer", width: "15px", height: "15px" }}
        />
        🚩 Flagged only
      </label>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          style={{
            padding: "0.5rem 0.75rem",
            background: "none",
            border: "1px solid #555",
            borderRadius: "6px",
            fontSize: "0.82rem",
            color: "#aaa",
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export default FilterBar;
