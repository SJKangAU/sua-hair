// ManagePage.tsx
// Manage tab — stylists, services, opening hours, per-stylist hours,
// owner email notifications, (owner only) team access, text messages and the client import.
// Split into sections behind a tab bar (?section=) so the page isn't one long scroll.

import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useToastContext } from "../../context/ToastContext";
import StylistRoster from "../../components/admin/manage/StylistRoster";
import ServiceRoster from "../../components/admin/manage/ServiceRoster";
import OpeningHoursEditor from "../../components/admin/manage/OpeningHoursEditor";
import StylistHoursEditor from "../../components/admin/manage/StylistHoursEditor";
import OwnerNotificationsEditor from "../../components/admin/manage/OwnerNotificationsEditor";
import TeamAccess from "../../components/admin/manage/TeamAccess";
import TimeOffPolicySettings from "../../components/admin/manage/TimeOffPolicySettings";
import PolicySettings from "../../components/admin/manage/PolicySettings";
import EmailSettings from "../../components/admin/manage/EmailSettings";
import SmsSettings from "../../components/admin/manage/SmsSettings";
import ClientImport from "../../components/admin/manage/ClientImport";
import BookingImport from "../../components/admin/manage/BookingImport";
import ClientBackfill from "../../components/admin/manage/ClientBackfill";

interface Props {
  isOwner: boolean;
}

interface Section {
  id: string;
  label: string;
  ownerOnly?: boolean;
  render: (p: { onSuccess: (m: string) => void; onError: (m: string) => void; isOwner: boolean }) => ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "team",
    label: "Stylists & services",
    render: ({ isOwner, ...cb }) => (
      <>
        <StylistRoster isOwner={isOwner} {...cb} />
        <ServiceRoster {...cb} />
      </>
    ),
  },
  {
    id: "hours",
    label: "Hours",
    render: (cb) => (
      <>
        <OpeningHoursEditor {...cb} />
        <StylistHoursEditor {...cb} />
      </>
    ),
  },
  {
    // Who can sign in, and whose clients each stylist may open (FR-025)
    id: "access",
    label: "Team access",
    ownerOnly: true,
    render: (cb) => <TeamAccess {...cb} />,
  },
  {
    // Time-off wait behaviour (FR-029) and the cancellation/change policy (FR-028)
    id: "policies",
    label: "Policies",
    ownerOnly: true,
    render: (cb) => (
      <>
        <TimeOffPolicySettings {...cb} />
        <PolicySettings {...cb} />
      </>
    ),
  },
  {
    // Owner's own email preferences (privateSettings is owner-only in firestore.rules),
    // client emails (FR-027) and text messages (FR-024)
    id: "messages",
    label: "Messages",
    ownerOnly: true,
    render: (cb) => (
      <>
        <OwnerNotificationsEditor {...cb} />
        <EmailSettings {...cb} />
        <SmsSettings {...cb} />
      </>
    ),
  },
  {
    // Fresha imports keep an owner-only ledger (importBatches); backfill builds clients from bookings
    id: "import",
    label: "Import",
    ownerOnly: true,
    render: (cb) => (
      <>
        <ClientImport {...cb} />
        <BookingImport {...cb} />
        <ClientBackfill {...cb} />
      </>
    ),
  },
];

const ManagePage = ({ isOwner }: Props) => {
  const { addToast } = useToastContext();
  const [params, setParams] = useSearchParams();

  const visible = SECTIONS.filter((s) => isOwner || !s.ownerOnly);
  const active = visible.find((s) => s.id === params.get("section")) ?? visible[0];

  const select = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("section", id);
        return next;
      },
      { replace: true },
    );

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    const target = visible[(i + step + visible.length) % visible.length];
    select(target.id);
    document.getElementById(`manage-tab-${target.id}`)?.focus();
  };

  const body = active.render({
    isOwner,
    onSuccess: (msg) => addToast(msg, "success"),
    onError: (msg) => addToast(msg, "error"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}>
          Manage
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--admin-muted)", margin: 0 }}>
          Add, edit, and deactivate stylists and services without touching code.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Manage sections"
        style={{
          display: "flex",
          gap: "0.25rem",
          overflowX: "auto",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {visible.map((s, i) => {
          const selected = s.id === active.id;
          return (
            <button
              key={s.id}
              id={`manage-tab-${s.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="manage-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => select(s.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={{
                flex: "0 0 auto",
                padding: "0.6rem 0.9rem",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${selected ? "currentColor" : "transparent"}`,
                marginBottom: -1,
                color: selected ? "inherit" : "var(--admin-muted)",
                fontWeight: selected ? 500 : 400,
                fontSize: "0.85rem",
                fontFamily: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        id="manage-panel"
        role="tabpanel"
        aria-labelledby={`manage-tab-${active.id}`}
        style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
      >
        {body}
      </div>
    </div>
  );
};

export default ManagePage;
