// FilterBar.tsx
// Filter controls for the bookings table
// Consumes stylists from SalonDataContext (Firestore) instead of hardcoded data.ts

import { useSalonData } from "../../context/SalonDataContext";
import useStylistFilter from "../../hooks/useStylistFilter";
import StylistFilterChips from "./StylistFilterChips";
import { Flag } from "lucide-react";
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
  border: "1px solid var(--admin-input-border)",
  borderRadius: "6px",
  fontSize: "0.9rem",
  background: "var(--surface)",
  color: "var(--ink)",
  cursor: "pointer",
  outline: "none",
};

const FilterBar = ({ filters, onChange, onClear }: Props) => {
  // Consume stylists from Firestore via context
  const { stylists } = useSalonData();
  const { picked, toggle, clear } = useStylistFilter();
  const hasActiveFilters = computeHasActiveFilters(filters);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        flexWrap: "wrap",
        padding: "1rem 1.25rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        style={{
          color: "var(--admin-muted)",
          fontSize: "0.82rem",
          fontWeight: 500,
        }}
      >
        Filter by:
      </span>

      {/* Stylist filter: several can be picked, remembered per user, none = All */}
      <StylistFilterChips
        chips={[
          { key: "all", label: "All", ids: [] },
          ...stylists.map((s) => ({
            key: s.id,
            label: s.name.split(" ")[0],
            ids: [s.id],
            stylistId: s.id,
          })),
        ]}
        picked={picked}
        availableIds={stylists.map((s) => s.id)}
        onToggle={toggle}
        onClear={clear}
      />

      {/* Date range filter */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <input
          type="date"
          aria-label="From date"
          style={{ ...selectStyle, colorScheme: "light" }}
          value={filters.dateFrom}
          max={filters.dateTo || undefined}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />
        <span style={{ color: "var(--grey-muted)", fontSize: "0.8rem" }}>
          to
        </span>
        <input
          type="date"
          aria-label="To date"
          style={{ ...selectStyle, colorScheme: "light" }}
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
        <option value="arrived">Arrived</option>
        <option value="in_service">In service</option>
        <option value="completed">Completed</option>
        <option value="no_show">No-show</option>
        <option value="cancelled">Cancelled</option>
      </select>

      {/* Flagged-only toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "var(--admin-muted)",
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
        <Flag size={14} strokeWidth={2} aria-hidden="true" />
        Flagged only
      </label>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          style={{
            padding: "0.5rem 0.75rem",
            background: "none",
            border: "1px solid var(--border-strong)",
            borderRadius: "6px",
            fontSize: "0.82rem",
            color: "var(--grey-muted)",
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
