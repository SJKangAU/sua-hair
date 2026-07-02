// WaitlistPanel.tsx
// Admin view of all waitlist entries — oldest first.
// Owner can mark entries as Contacted or Resolved.
// Filters: All / Pending / Contacted / Resolved.

import { useState } from "react";
import useWaitlist from "../../../hooks/useWaitlist";
import type { WaitlistEntry } from "../../../types";

interface Props {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

type Filter = "all" | WaitlistEntry["status"];

const STATUS_LABELS: Record<WaitlistEntry["status"], string> = {
  pending: "Pending",
  contacted: "Contacted",
  resolved: "Resolved",
};

// Monochrome status chips — border treatment encodes progress, not colour
const STATUS_STYLES: Record<WaitlistEntry["status"], React.CSSProperties> = {
  pending: {
    border: "1.5px dashed var(--border-strong)",
    color: "var(--ink)",
    fontWeight: 600,
  },
  contacted: {
    border: "1px solid var(--border-strong)",
    color: "var(--ink-soft)",
    fontWeight: 500,
  },
  resolved: {
    border: "1px solid transparent",
    color: "var(--grey-muted)",
    fontWeight: 400,
  },
};

const WaitlistPanel = ({ onSuccess, onError }: Props) => {
  const { entries, loading, updateStatus } = useWaitlist();
  const [filter, setFilter] = useState<Filter>("all");
  const [updating, setUpdating] = useState<string | null>(null);

  const visible = entries.filter(
    (e) => filter === "all" || e.status === filter,
  );
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  const handleUpdate = async (
    id: string,
    status: WaitlistEntry["status"],
    name: string,
  ) => {
    setUpdating(id);
    try {
      await updateStatus(id, status);
      onSuccess(`${name} marked as ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch {
      onError("Failed to update status. Please try again.");
    }
    setUpdating(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.35rem 0.85rem",
    borderRadius: "999px",
    border: "none",
    background: active ? "#1a1a1a" : "#f0f0f0",
    color: active ? "#fff" : "#555",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
            Waitlist
            {pendingCount > 0 && (
              <span
                style={{
                  marginLeft: "0.5rem",
                  background: "var(--ink)",
                  color: "#fff",
                  borderRadius: "999px",
                  padding: "0.1rem 0.5rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  verticalAlign: "middle",
                }}
              >
                {pendingCount}
              </span>
            )}
          </h3>
          <p
            style={{ fontSize: "0.8rem", color: "#999", margin: "0.2rem 0 0" }}
          >
            Clients waiting for an opening — oldest requests first.
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {(["all", "pending", "contacted", "resolved"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={pillStyle(filter === f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f as WaitlistEntry["status"]]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#bbb", fontSize: "0.85rem", padding: "1rem 0" }}>
          Loading waitlist…
        </div>
      ) : visible.length === 0 ? (
        <div
          style={{
            background: "#fafafa",
            border: "1px solid #f0f0f0",
            borderRadius: "10px",
            padding: "2.5rem",
            textAlign: "center",
            color: "#bbb",
            fontSize: "0.88rem",
          }}
        >
          {filter === "all" ? "No waitlist entries." : `No ${filter} entries.`}
        </div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
        >
          {visible.map((entry) => {
            const statusStyle = STATUS_STYLES[entry.status];
            const isUpdating = updating === entry.id;
            return (
              <div
                key={entry.id}
                style={{
                  background: "#fff",
                  border: "1px solid #f0f0f0",
                  borderRadius: "10px",
                  padding: "0.9rem 1.1rem",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "1rem",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                      {entry.customerName}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        background: "transparent",
                        ...statusStyle,
                      }}
                    >
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "#777" }}>
                    {entry.customerPhone}
                    <span style={{ marginLeft: "0.75rem" }}>
                      Requested: {entry.requestedDate}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#bbb",
                      marginTop: "0.2rem",
                    }}
                  >
                    Joined {formatDate(entry.createdAt)}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {entry.status === "pending" && (
                    <button
                      onClick={() =>
                        handleUpdate(entry.id, "contacted", entry.customerName)
                      }
                      disabled={isUpdating}
                      style={{
                        padding: "0.4rem 0.85rem",
                        background: isUpdating ? "#ddd" : "#1a1a1a",
                        color: isUpdating ? "#999" : "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: isUpdating ? "not-allowed" : "pointer",
                        fontSize: "0.78rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Mark Contacted
                    </button>
                  )}
                  {entry.status !== "resolved" && (
                    <button
                      onClick={() =>
                        handleUpdate(entry.id, "resolved", entry.customerName)
                      }
                      disabled={isUpdating}
                      style={{
                        padding: "0.4rem 0.85rem",
                        background: "none",
                        color: isUpdating ? "var(--border-strong)" : "var(--ink-soft)",
                        border: `1px solid ${isUpdating ? "var(--border)" : "var(--border-strong)"}`,
                        borderRadius: "6px",
                        cursor: isUpdating ? "not-allowed" : "pointer",
                        fontSize: "0.78rem",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WaitlistPanel;
