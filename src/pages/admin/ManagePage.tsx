// ManagePage.tsx
// Manage tab — uses ToastContext directly, no addToast prop needed

import { useToastContext } from "../../context/ToastContext";
import StylistRoster from "../../components/admin/manage/StylistRoster";
import ServiceRoster from "../../components/admin/manage/ServiceRoster";

const ManagePage = () => {
  const { addToast } = useToastContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
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
      <StylistRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
      <ServiceRoster
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
    </div>
  );
};

export default ManagePage;
