// ManagePage.tsx
// Manage tab — stylists, services, opening hours, per-stylist hours

import { useToastContext } from "../../context/ToastContext";
import StylistRoster from "../../components/admin/manage/StylistRoster";
import ServiceRoster from "../../components/admin/manage/ServiceRoster";
import OpeningHoursEditor from "../../components/admin/manage/OpeningHoursEditor";
import StylistHoursEditor from "../../components/admin/manage/StylistHoursEditor";

const ManagePage = () => {
  const { addToast } = useToastContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}>
          Manage
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)", margin: 0 }}>
          Add, edit, and deactivate stylists and services without touching code.
        </p>
      </div>

      <StylistRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
      <ServiceRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      <hr style={{ border: "none", borderTop: "1px solid #f0f0f0", margin: 0 }} />

      <OpeningHoursEditor
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />

      <StylistHoursEditor
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
    </div>
  );
};

export default ManagePage;
