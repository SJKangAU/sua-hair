// StepOneService.tsx
// Step 1 of the booking flow (was StepTwoService)
// Stylist selection cards with headshots and tiered pricing
// Service dropdown resolves price based on selected stylist level
// Consumes stylists and services from SalonDataContext (Firestore)

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

  // Resolve tiered price based on selected stylist level
  const selectedStylist = stylists.find((s) => s.id === stylistId);
  const priceLevel = selectedStylist?.level ?? "junior";

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
      <div style={{ textAlign: "center", padding: "2rem", color: "#e24b4a" }}>
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
        Choose your stylist
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          marginBottom: "1.75rem",
        }}
      >
        Select a stylist to see availability and pricing.
      </p>

      {/* Stylist cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        {stylists.map((stylist) => {
          const selected = stylistId === stylist.id;
          return (
            <div
              key={stylist.id}
              onClick={() => onStylistSelect(stylist.id)}
              style={{
                padding: "1rem",
                border: `1.5px solid ${
                  selected ? "var(--text-primary)" : "var(--border)"
                }`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                background: selected ? "var(--text-primary)" : "var(--white)",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
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
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                    border: selected
                      ? "2px solid var(--gold)"
                      : "2px solid var(--border)",
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: selected
                      ? "var(--gold-dark)"
                      : "var(--surface-raised)",
                    color: selected ? "var(--white)" : "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: "1rem",
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
                    fontSize: "0.85rem",
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
                    fontSize: "0.72rem",
                    color: selected ? "var(--gold-light)" : "var(--text-muted)",
                    margin: 0,
                    marginTop: "1px",
                  }}
                >
                  {stylist.role}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Service dropdown */}
      <div style={{ marginBottom: "1.25rem" }}>
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
          {!stylistId && (
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--gold)",
                marginLeft: "0.5rem",
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              — select a stylist first
            </span>
          )}
        </label>
        <select
          style={{
            width: "100%",
            padding: "0.75rem 1rem",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.9rem",
            color: "var(--text-primary)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            appearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239c9994' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            paddingRight: "2.5rem",
            cursor: !stylistId ? "not-allowed" : "pointer",
            opacity: !stylistId ? 0.6 : 1,
            outline: "none",
          }}
          value={serviceId}
          onChange={(e) => onServiceSelect(e.target.value)}
          disabled={!stylistId}
        >
          <option value="">Select a service...</option>
          {services.map((service) => {
            const price = service.price[priceLevel];
            return (
              <option key={service.id} value={service.id}>
                {service.name} — from ${price} ({service.totalTime} min)
              </option>
            );
          })}
        </select>
      </div>

      {/* Rest time info */}
      {serviceId && restTime > 0 && (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "var(--radius-md)",
            padding: "0.875rem 1rem",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            marginBottom: "1.25rem",
            borderLeft: "3px solid var(--gold)",
          }}
        >
          <strong>{activeTime} min</strong> active styling +{" "}
          <strong>{restTime} min</strong> setting time ={" "}
          <strong>{totalTime} min</strong> total appointment
        </div>
      )}

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
            style={{ textTransform: "none", fontWeight: 400, letterSpacing: 0 }}
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
            fontSize: "0.9rem",
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
