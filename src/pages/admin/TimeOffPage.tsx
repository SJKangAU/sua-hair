// TimeOffPage.tsx
// /admin/time-off (owner) - stylists' days off and blocked times (FR-029): requests waiting for a
// decision, what's coming up, and a form to add time off for anyone (applied at once).

import { useToastContext } from "../../context/ToastContext";
import { useSalonData } from "../../context/SalonDataContext";
import useAuth from "../../hooks/useAuth";
import useTimeOff from "../../hooks/useTimeOff";
import TimeOffList from "../../components/timeoff/TimeOffList";
import TimeOffRequestForm from "../../components/timeoff/TimeOffRequestForm";

const TimeOffPage = () => {
  const { addToast } = useToastContext();
  const { stylists } = useSalonData();
  const { user } = useAuth();
  const { rows, loading, error } = useTimeOff({ all: true });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", maxWidth: 900 }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}>Time off</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)", margin: 0 }}>
          Stylists ask for days off and blocked times here. You decide; time you add yourself applies at once. What happens to a request
          while it waits is set in Manage.
        </p>
      </div>

      {loading ? (
        <p role="status">Loading...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <TimeOffList records={rows} canApprove isOwner ownUid={user?.uid ?? ""} onDone={(m) => addToast(m, "success")} onError={(m) => addToast(m, "error")} />
      )}

      <TimeOffRequestForm
        canApprove
        stylists={stylists.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        onDone={(m) => addToast(m, "success")}
        onError={(m) => addToast(m, "error")}
      />
    </div>
  );
};

export default TimeOffPage;
