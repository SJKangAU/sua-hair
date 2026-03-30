// StepTwoService.tsx
// Step 2 of the booking form
// Consumes stylists and services from SalonDataContext (Firestore)
// Shows loading and error states while data fetches

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

const inputStyle = {
  width: "100%",
  padding: "0.65rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  fontSize: "1rem",
  marginTop: "0.25rem",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block" as const,
  marginBottom: "1rem",
  fontWeight: 500,
  fontSize: "0.95rem",
};

const StepTwoService = ({
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
  // Consume from context — data fetched once at BookingPage level
  const {
    stylists,
    stylistsLoading,
    stylistsError,
    services,
    servicesLoading,
    servicesError,
  } = useSalonData();

  // Loading state
  if (stylistsLoading || servicesLoading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b6b" }}>
        Loading stylists and services...
      </div>
    );
  }

  // Error state
  if (stylistsError || servicesError) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#e24b4a" }}>
        {stylistsError || servicesError}
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: "1.25rem", fontSize: "1.1rem" }}>
        Choose Your Stylist & Service
      </h3>

      {/* Stylist selection cards — driven by Firestore */}
      <p style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Stylist</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.5rem",
          marginBottom: "1.25rem",
        }}
      >
        {stylists.map((stylist) => {
          const selected = stylistId === stylist.id;
          return (
            <div
              key={stylist.id}
              onClick={() => onStylistSelect(stylist.id)}
              style={{
                padding: "0.75rem",
                border: `2px solid ${selected ? "#c9a96e" : "#ddd"}`,
                borderRadius: "8px",
                cursor: "pointer",
                background: selected ? "#fdf6ec" : "white",
                transition: "all 0.15s",
              }}
            >
              <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                {stylist.name}
              </p>
              <p style={{ fontSize: "0.75rem", color: "#6b6b6b" }}>
                {stylist.role}
              </p>
            </div>
          );
        })}
      </div>

      {/* Service dropdown — driven by Firestore */}
      <label style={labelStyle}>
        Service
        <select
          style={inputStyle}
          value={serviceId}
          onChange={(e) => onServiceSelect(e.target.value)}
        >
          <option value="">Select a service...</option>
          // Update the service dropdown to show tiered price
          {services.map((service) => {
            const stylist = stylists.find((s) => s.id === stylistId);
            const level = stylist?.level ?? "junior";
            const price = service.price[level];

            return (
              <option key={service.id} value={service.id}>
                {service.name} — from ${price} ({service.totalTime} min total)
              </option>
            );
          })}
        </select>
      </label>

      {/* Rest time breakdown — shown for services with a setting period */}
      {serviceId && restTime > 0 && (
        <div
          style={{
            background: "#f0f7ff",
            border: "1px solid #b5d4f4",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            fontSize: "0.85rem",
            color: "#6b6b6b",
            marginBottom: "1rem",
          }}
        >
          This service includes <strong>{activeTime} min</strong> of active
          styling and <strong>{restTime} min</strong> of setting time. Your
          total appointment is <strong>{totalTime} min</strong>.
        </div>
      )}

      {/* Optional notes */}
      <label style={labelStyle}>
        Notes (optional)
        <textarea
          style={{ ...inputStyle, height: "80px", resize: "vertical" }}
          placeholder="Any special requests or hair concerns..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </label>
    </div>
  );
};

export default StepTwoService;
