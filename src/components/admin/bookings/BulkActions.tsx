// BulkActions.tsx
// Bulk action bar shown when bookings are selected: Confirm all (pending
// bookings only) and Cancel all, each of which gives a single summary toast
// ("12 bookings confirmed") with one Undo — see useBookingActions. Monochrome:
// a dark bar, a white primary button and an outlined secondary one.

import { Check, X } from "lucide-react";

interface Props {
  selectedCount: number;
  onConfirmAll: () => void;
  onCancelAll: () => void;
  onClearSelection: () => void;
}

const baseButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.4rem 0.9rem",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "var(--text-sm)",
  fontFamily: "var(--font-body)",
};

const BulkActions = ({
  selectedCount,
  onConfirmAll,
  onCancelAll,
  onClearSelection,
}: Props) => {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1.25rem",
        background: "var(--admin-bg)",
        borderRadius: "8px",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          color: "var(--surface)",
          fontSize: "var(--text-base)",
          fontWeight: 500,
        }}
      >
        {selectedCount} booking{selectedCount > 1 ? "s" : ""} selected
      </span>

      <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
        <button
          className="adm-bulk-primary"
          onClick={onConfirmAll}
          style={{
            ...baseButton,
            background: "var(--surface)",
            color: "var(--ink)",
            border: "1px solid var(--surface)",
          }}
        >
          <Check size={14} strokeWidth={2.25} aria-hidden="true" />
          Confirm all
        </button>

        <button
          className="adm-bulk-secondary"
          onClick={onCancelAll}
          style={{
            ...baseButton,
            background: "transparent",
            color: "var(--surface)",
            border: "1px solid var(--admin-dimmer)",
          }}
        >
          <X size={14} strokeWidth={2.25} aria-hidden="true" />
          Cancel all
        </button>

        <button
          className="adm-bulk-secondary"
          onClick={onClearSelection}
          style={{
            ...baseButton,
            background: "transparent",
            color: "var(--admin-faint)",
            border: "1px solid var(--admin-dim)",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default BulkActions;
