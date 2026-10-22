// OpeningHoursNotice.tsx
// The public page's words about when the salon is open and when it is closed for a holiday.
// Everything comes from the salon's settings (src/lib/openingHoursSummary.ts), the same data the
// booking rules read, so what is printed here is what can be booked.
//   HoursLine      under the page title, in the hero
//   ClosuresBanner above the booking form; renders nothing when there are no closures

import { useSalonData } from "../../context/SalonDataContext";
import { businessToday } from "../../lib/businessTime";
import { formatDisplayDate } from "../../lib/dates";
import {
  closureRanges,
  upcomingClosures,
  weeklyHoursRows,
  type ClosureRange,
} from "../../lib/openingHoursSummary";

const SHORT = { weekday: "short", day: "numeric", month: "short" } as const;

const rangeText = (r: ClosureRange): string => {
  const when =
    r.from === r.to
      ? formatDisplayDate(r.from, SHORT)
      : `${formatDisplayDate(r.from, SHORT)} – ${formatDisplayDate(r.to, SHORT)}`;
  return r.label ? `${when} (${r.label})` : when;
};

const useClosureRanges = (): ClosureRange[] => {
  const { salonSettings } = useSalonData();
  return closureRanges(
    upcomingClosures(salonSettings.dateOverrides, salonSettings.weeklySchedule, businessToday()),
  );
};

export const HoursLine = () => {
  const { salonSettings } = useSalonData();
  const rows = weeklyHoursRows(salonSettings.weeklySchedule);
  const ranges = useClosureRanges();
  return (
    <div data-testid="opening-hours">
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: "var(--text-base)",
          letterSpacing: "0.04em",
        }}
      >
        {rows.map((r) => `${r.days} ${r.hours}`).join(" · ")} · Mount Waverley
      </p>
      {ranges.length > 0 && (
        <p
          data-testid="opening-hours-closures"
          style={{
            color: "var(--ink-muted)",
            fontSize: "var(--text-sm)",
            letterSpacing: "0.03em",
            marginTop: "0.5rem",
          }}
        >
          Closed: {ranges.map(rangeText).join(" · ")}
        </p>
      )}
    </div>
  );
};

export const ClosuresBanner = () => {
  const ranges = useClosureRanges();
  if (ranges.length === 0) return null;
  return (
    <aside
      data-testid="closures-banner"
      aria-label="Upcoming closures"
      style={{
        margin: "0 0 1rem",
        padding: "0.875rem 1.125rem",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--ink)",
        borderRadius: "10px",
        fontSize: "var(--text-sm)",
        color: "var(--ink)",
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: "block", marginBottom: "0.25rem" }}>
        Upcoming closures
      </strong>
      <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-muted)" }}>
        {ranges.map((r) => (
          <li key={r.from}>{rangeText(r)}</li>
        ))}
      </ul>
    </aside>
  );
};
