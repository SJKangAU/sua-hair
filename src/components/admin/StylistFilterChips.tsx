// StylistFilterChips.tsx
// The stylist filter row shared by the Today timeline, the Today list on a phone
// and the bookings list: an "All" chip, one chip per stylist (in the stylist's
// colour) and optional group chips (Seniors / Juniors). Several can be on at
// once; none on = All. The picked stylists live in useStylistFilter.

import useStylistColors from "../../hooks/useStylistColors";

export interface FilterChip {
  key: string;
  label: string;
  // The stylists this chip switches on or off (a stylist chip has one id)
  ids: string[];
  // Set on a single-stylist chip: its colour shows as a dot, and fills the chip when on
  stylistId?: string;
}

interface Props {
  chips: FilterChip[];
  picked: string[];
  // Every stylist this screen can show: picks outside it do not count as "on"
  availableIds: string[];
  onToggle: (ids: string[]) => void;
  onClear: () => void;
  // A larger, finger-sized chip for the phone layout
  large?: boolean;
  scrollable?: boolean;
}

const StylistFilterChips = ({
  chips,
  picked,
  availableIds,
  onToggle,
  onClear,
  large = false,
  scrollable = false,
}: Props) => {
  const colorOf = useStylistColors();
  const noneInView = !availableIds.some((id) => picked.includes(id));

  return (
    <div
      role="group"
      aria-label="Filter by stylist"
      data-testid="stylist-filter"
      style={{
        display: "flex",
        alignItems: "center",
        gap: large ? "0.5rem" : "0.4rem",
        flexWrap: scrollable ? "nowrap" : "wrap",
        overflowX: scrollable ? "auto" : undefined,
        paddingBottom: scrollable ? "0.25rem" : undefined,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {chips.map(({ key, label, ids, stylistId }) => {
        const isAll = key === "all";
        const on = isAll ? noneInView : ids.length > 0 && ids.every((id) => picked.includes(id));
        const color = stylistId ? colorOf(stylistId) : undefined;
        const filled = on && color ? color.solid : on ? "var(--accent)" : "transparent";
        const ink = on && color ? color.solidInk : on ? "var(--surface)" : "var(--ink)";
        return (
          <button
            key={key}
            type="button"
            className="bk-ghost"
            aria-pressed={on}
            data-testid={`stylist-filter-${key}`}
            data-stylist-color={color?.id}
            onClick={() => (isAll ? onClear() : onToggle(ids))}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              minHeight: large ? "38px" : undefined,
              padding: large ? "0.4rem 1rem" : "0.3rem 0.8rem",
              borderRadius: "999px",
              border: `1px solid ${on && color ? color.solid : "var(--border-strong)"}`,
              background: filled,
              color: ink,
              cursor: "pointer",
              fontSize: large ? "var(--text-base)" : "var(--text-sm)",
              fontWeight: on ? 700 : 500,
              fontFamily: "var(--font-body)",
            }}
          >
            {color && !on && (
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color.solid,
                  flexShrink: 0,
                }}
              />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default StylistFilterChips;
