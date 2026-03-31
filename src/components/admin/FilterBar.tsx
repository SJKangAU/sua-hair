// FilterBar.tsx
// Filter controls for the bookings table
// Consumes stylists from SalonDataContext (Firestore) instead of hardcoded data.ts

import { useSalonData } from "../../context/SalonDataContext";

export interface Filters {
  stylistId: string;
  date: string;
  status: string;
}

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
  const hasActiveFilters = filters.stylistId || filters.date || filters.status;

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

      {/* Date filter */}
      <input
        type="date"
        style={{ ...selectStyle, colorScheme: "dark" }}
        value={filters.date}
        onChange={(e) => onChange({ ...filters, date: e.target.value })}
      />

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
