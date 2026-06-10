// StylistFilterChips.tsx
// Horizontal row of chip buttons for filtering by stylist (or "First available")

import type { FirestoreStylist } from "../../hooks/useStylists";

interface Props {
  stylists: FirestoreStylist[];
  stylistId: string;
  onSelect: (id: string) => void;
}

const chipStyle = (selected: boolean): React.CSSProperties => ({
  padding: "0.45rem 1rem",
  borderRadius: "20px",
  border: `1.5px solid ${selected ? "var(--text-primary)" : "var(--border)"}`,
  background: selected ? "var(--text-primary)" : "var(--white)",
  color: selected ? "var(--white)" : "var(--text-secondary)",
  fontSize: "0.8rem",
  fontWeight: selected ? 600 : 400,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  transition: "all 0.1s",
  whiteSpace: "nowrap" as const,
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
});

const StylistFilterChips = ({ stylists, stylistId, onSelect }: Props) => {
  const isAny = stylistId === "any" || stylistId === "";

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: "0.625rem",
        }}
      >
        Stylist
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button onClick={() => onSelect("any")} style={chipStyle(isAny)}>
          First available
        </button>

        {stylists.map((stylist) => {
          const selected = stylistId === stylist.id;
          return (
            <button
              key={stylist.id}
              onClick={() => onSelect(stylist.id)}
              style={chipStyle(selected)}
            >
              {stylist.photoUrl && (
                <img
                  src={stylist.photoUrl}
                  alt={stylist.name}
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                  onError={(e) =>
                    ((e.target as HTMLImageElement).style.display = "none")
                  }
                />
              )}
              {stylist.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StylistFilterChips;
