// ServiceStep.tsx
// Step 1 of the booking flow — multi-select service picker
//
// Services arrive pre-sorted by sortOrder (from useServices) and are
// grouped by category while preserving that order.  The first category
// starts expanded; all others are collapsed.
//
// Prices are shown as "from $X" (minimum tier) because the stylist is not
// chosen until Step 2.  Exact prices appear in BookingSummarySheet and
// DetailsStep once a stylist is known.
//
// Toggling a service also clears date/time in the parent (BookingForm) because
// the totalTime passed to useBookingAvailability changes, making previously
// computed slots potentially invalid.

import { useState } from "react";
import type { FirestoreService } from "../../hooks/useServices";

interface Props {
  selectedIds: string[];
  onToggle: (id: string) => void;
  services: FirestoreService[];
}

const CATEGORY_LABELS: Record<string, string> = {
  cut: "Haircuts",
  colour: "Colour",
  styling: "Styling",
  treatment: "Treatments",
  grooming: "Grooming",
  perm: "Perm / Texture",
};

const categoryLabel = (key: string) =>
  CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

const CheckCircle = ({ selected }: { selected: boolean }) => (
  <div
    style={{
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: selected ? "var(--ink)" : "transparent",
      border: `2px solid ${selected ? "var(--ink)" : "var(--border-strong)"}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "all 0.15s ease",
    }}
  >
    {selected && (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path
          d="M1.5 5.5l2.75 2.75 4.75-4.75"
          stroke="var(--surface)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </div>
);

const ServiceStep = ({ selectedIds, onToggle, services }: Props) => {
  // Group services preserving sortOrder within each category
  const categories: string[] = [];
  const grouped: Record<string, FirestoreService[]> = {};
  services.forEach((s) => {
    if (!grouped[s.category]) {
      grouped[s.category] = [];
      categories.push(s.category);
    }
    grouped[s.category].push(s);
  });

  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(categories.length > 0 ? [categories[0]] : []),
  );

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const selectedServices = services.filter((s) => selectedIds.includes(s.id));
  const totalTime = selectedServices.reduce((sum, s) => sum + s.totalTime, 0);

  const getMinPrice = (s: FirestoreService) =>
    Math.min(s.price.director, s.price.senior, s.price.junior);

  return (
    <div>
      {/* Heading */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "2rem",
            fontWeight: 300,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            margin: "0 0 0.25rem",
            lineHeight: 1.15,
          }}
        >
          Select Services
        </h2>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--grey-muted)",
            margin: 0,
          }}
        >
          Choose as many services as you'd like
        </p>
      </div>

      {/* Category accordion */}
      <div>
        {categories.map((cat) => {
          const isOpen = expanded.has(cat);
          const catServices = grouped[cat];

          return (
            <div key={cat}>
              {/* Category header */}
              <button
                className="bk-row"
                onClick={() => toggleCategory(cat)}
                aria-expanded={isOpen}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                  padding: "0.875rem 0",
                  background: "none",
                  border: "none",
                  borderTop: `1px solid var(--border)`,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink)",
                  }}
                >
                  {categoryLabel(cat)}
                </span>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--grey-muted)",
                    transform: isOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.22s ease",
                    lineHeight: 1,
                  }}
                >
                  ↓
                </span>
              </button>

              {/* Services within category — animated accordion */}
              <div
                style={{
                  maxHeight: isOpen ? "2000px" : "0",
                  overflow: "hidden",
                  transition: "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                {catServices.map((service) => {
                  const isSelected = selectedIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      className="bk-row"
                      onClick={() => onToggle(service.id)}
                      aria-pressed={isSelected}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.875rem",
                        width: "100%",
                        padding: "0.75rem 0",
                        background: "none",
                        border: "none",
                        borderBottom: `1px solid var(--border)`,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {/* Service info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "var(--text-base)",
                            fontWeight: isSelected ? 600 : 400,
                            color: "var(--ink)",
                          }}
                        >
                          {service.name}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontSize: "var(--text-xs)",
                            color: "var(--grey-muted)",
                          }}
                        >
                          {service.totalTime} min
                          {service.restTime > 0
                            ? ` · ${service.activeTime} active + ${service.restTime} setting`
                            : ""}
                        </p>
                      </div>

                      {/* Price */}
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          fontWeight: 500,
                          color: "var(--ink)",
                          flexShrink: 0,
                          minWidth: "56px",
                          textAlign: "right",
                        }}
                      >
                        from ${getMinPrice(service)}
                      </span>

                      {/* Check circle */}
                      <CheckCircle selected={isSelected} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Bottom border after last category */}
        <div style={{ borderTop: `1px solid var(--border)` }} />
      </div>

      {/* Selection summary bar */}
      {selectedIds.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1.25rem",
            padding: "0.875rem 1rem",
            background: "var(--ink)",
            borderRadius: "8px",
            animation: "bkFadeIn 0.2s ease both",
          }}
        >
          <span style={{ fontSize: "var(--text-sm)", color: "var(--grey-muted)" }}>
            {selectedIds.length} service{selectedIds.length !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <span
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 600,
              color: "var(--surface)",
            }}
          >
            {totalTime} min total
          </span>
        </div>
      )}
    </div>
  );
};

export default ServiceStep;
