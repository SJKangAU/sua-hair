// ManagePage.tsx
// Manage tab — stylist and service management without touching code
// Steve can add, edit, deactivate, and reactivate stylists and services
// Price changes are logged to priceHistory automatically

import StylistRoster from "../../components/admin/manage/StylistRoster";
import ServiceRoster from "../../components/admin/manage/ServiceRoster";

interface Props {
  addToast: (message: string, type: "success" | "error" | "warning") => void;
}

const ManagePage = ({ addToast }: Props) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Manage
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#6b6b6b", margin: 0 }}>
          Add, edit, and deactivate stylists and services without touching code.
        </p>
      </div>

      {/* Stylist roster */}
      <StylistRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      {/* Service roster */}
      <ServiceRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
    </div>
  );
};

export default ManagePage;
