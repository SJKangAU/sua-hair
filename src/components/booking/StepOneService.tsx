// StepOneService.tsx
// Step 1 of the booking flow
// Stylist selection with "Any stylist" option
// Service available immediately — no need to select stylist first
// Price shows based on selected stylist tier, or lowest price if "Any" selected

import { useSalonData } from "../../context/SalonDataContext";

interface Props {
  stylistId: string;
  serviceId: string;
  activeTime: number;
  restTime: number;
  totalTime: number;
  notes: string;
  onStylistSelect: (id: string) => void;
  onServiceSelect: (id: string) => void;
  onNotesChange: (value: string) => void;
}

const StepOneService = ({
  stylistId,
  serviceId,
  activeTime,
  restTime,
  totalTime,
  notes,
  onStylistSelect,
  onServiceSelect,
  onNotesChange,
}: Props) => {
  const {
    stylists,
    stylistsLoading,
    stylistsError,
    services,
    servicesLoading,
    servicesError,
  } = useSalonData();

  // Resolve price level — use junior (lowest) if no stylist or "any" selected
  const selectedStylist = stylists.find((s) => s.id === stylistId);
  const priceLevel = selectedStylist?.level ?? "junior";
  const isAny = stylistId === "any";

  // Get the display price — lowest tier if "any", otherwise resolved tier
  const getDisplayPrice = (service: {
    price: { director: number; senior: number; junior: number };
  }) => {
    if (isAny || !stylistId) {
      return Math.min(
        service.price.director,
        service.price.senior,
        service.price.junior,
      );
    }
    return service.price[priceLevel];
  };

  if (stylistsLoading || servicesLoading) {
    return (
      <div style={{ padding: "2rem" }}>
        <div
          style={{
            height: "1.5rem",
            background: "var(--surface)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "1.5rem",
            width: "60%",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: "72px",
                background: "var(--surface)",
                borderRadius: "var(--radius-md)",
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
        <div
          style={{
            height: "48px",
            background: "var(--surface)",
            borderRadius: "var(--radius-md)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    );
  }

  if (stylistsError || servicesError) {
    return (
      <div
        style={{ textAlign: "center", padding: "2rem", color: "var(--error)" }}
      >
        {stylistsError || servicesError}
      </div>
    );
  }

  return (
    <div>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.6rem",
          fontWeight: 400,
          color: "var(--text-primary)",
          marginBottom: "0.35rem",
          letterSpacing: "-0.01em",
        }}
      >
        Book an appointment
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          marginBottom: "1.75rem",
        }}
      >
        Choose a stylist and service to get started.
      </p>

      {/* Service first */}
      <div style={{ marginBottom: "1.75rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Service
        </label>
        <select
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: serviceId ? "var(--text-primary)" : "var(--text-muted)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            appearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239c9994' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            paddingRight: "2.5rem",
            cursor: "pointer",
            outline: "none",
          }}
          value={serviceId}
          onChange={(e) => onServiceSelect(e.target.value)}
        >
          <option value="">Select a service...</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} — from ${getDisplayPrice(service)} (
              {service.totalTime} min)
            </option>
          ))}
        </select>

        {/* Rest time info */}
        {serviceId && restTime > 0 && (
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              marginTop: "0.5rem",
              fontSize: "0.82rem",
              color: "var(--text-secondary)",
              borderLeft: "3px solid var(--gold)",
            }}
          >
            <strong>{activeTime} min</strong> active styling +{" "}
            <strong>{restTime} min</strong> setting time ={" "}
            <strong>{totalTime} min</strong> total
          </div>
        )}
      </div>

      {/* Stylist selection */}
      <div style={{ marginBottom: "1.75rem" }}>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Stylist
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.625rem",
          }}
        >
          {/* Any stylist option */}
          <div
            onClick={() => onStylistSelect("any")}
            style={{
              gridColumn: "1 / -1",
              padding: "0.875rem 1rem",
              border: `1.5px solid ${
                isAny || !stylistId ? "var(--text-primary)" : "var(--border)"
              }`,
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              background:
                isAny || !stylistId ? "var(--text-primary)" : "var(--white)",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
            onMouseEnter={(e) => {
              if (!isAny && stylistId) {
                e.currentTarget.style.borderColor = "var(--text-primary)";
                e.currentTarget.style.background = "var(--surface)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isAny && stylistId) {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--white)";
              }
            }}
          >
            {/* Any icon */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background:
                  isAny || !stylistId
                    ? "rgba(255,255,255,0.15)"
                    : "var(--surface-raised)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: "1.1rem",
              }}
            >
              ✦
            </div>
            <div>
              <p
                style={{
                  fontWeight: 500,
                  fontSize: "0.875rem",
                  color:
                    isAny || !stylistId
                      ? "var(--white)"
                      : "var(--text-primary)",
                  margin: 0,
                }}
              >
                Any available stylist
              </p>
              <p
                style={{
                  fontSize: "0.75rem",
                  color:
                    isAny || !stylistId
                      ? "rgba(255,255,255,0.6)"
                      : "var(--text-muted)",
                  margin: 0,
                  marginTop: "1px",
                }}
              >
                Show all available times
              </p>
            </div>
          </div>

          {/* Individual stylist cards */}
          {stylists.map((stylist) => {
            const selected = stylistId === stylist.id;
            return (
              <div
                key={stylist.id}
                onClick={() => onStylistSelect(stylist.id)}
                style={{
                  padding: "0.875rem",
                  border: `1.5px solid ${
                    selected ? "var(--text-primary)" : "var(--border)"
                  }`,
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: selected ? "var(--text-primary)" : "var(--white)",
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                }}
                onMouseEnter={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "var(--text-primary)";
                    e.currentTarget.style.background = "var(--surface)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--white)";
                  }
                }}
              >
                {/* Headshot */}
                {stylist.photoUrl ? (
                  <img
                    src={stylist.photoUrl}
                    alt={stylist.name}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      flexShrink: 0,
                      border: selected
                        ? "2px solid rgba(255,255,255,0.3)"
                        : "2px solid var(--border)",
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: selected
                        ? "rgba(255,255,255,0.15)"
                        : "var(--surface-raised)",
                      color: selected
                        ? "var(--white)"
                        : "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      flexShrink: 0,
                    }}
                  >
                    {stylist.name.charAt(0)}
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontWeight: 500,
                      fontSize: "0.825rem",
                      color: selected ? "var(--white)" : "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      margin: 0,
                    }}
                  >
                    {stylist.name.split(" ")[0]}
                  </p>
                  <p
                    style={{
                      fontSize: "0.7rem",
                      color: selected
                        ? "rgba(255,255,255,0.6)"
                        : "var(--text-muted)",
                      margin: 0,
                      marginTop: "1px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {stylist.role}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.78rem",
            fontWeight: 500,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Notes{" "}
          <span
            style={{
              textTransform: "none",
              fontWeight: 400,
              letterSpacing: 0,
              color: "var(--text-muted)",
            }}
          >
            (optional)
          </span>
        </label>
        <textarea
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.875rem",
            color: "var(--text-primary)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            height: "80px",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
          }}
          placeholder="Any special requests or hair concerns..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>
    </div>
  );
};

export default StepOneService;
