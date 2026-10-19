// AdminSidebar.tsx
// The dark 232px left sidebar (screens 900px and up): brand + notification
// bell, the two nav groups — "Operate" and "Run the salon" — with an
// Approvals count badge, then "View booking site" and the signed-in user with
// sign-out at the bottom. Monochrome: the active page is marked by a lighter
// panel and a white bar, not colour.

import { NavLink } from "react-router-dom";
import { ExternalLink, LogOut } from "lucide-react";
import NotificationBell from "../../ui/NotificationBell";
import CountBadge from "./CountBadge";
import { SIDEBAR_WIDTH } from "./shellStyles";
import {
  NAV_GROUP_LABELS,
  type NavGroup,
  type NavItem,
} from "./navItems";
import type { Notification } from "../../../types";

interface Props {
  items: NavItem[];
  approvalsCount: number;
  email: string | null | undefined;
  onSignOut: () => void;
  onSelectNotification: (notification: Notification) => void;
}

const GROUPS: NavGroup[] = ["operate", "run"];

const AdminSidebar = ({
  items,
  approvalsCount,
  email,
  onSignOut,
  onSelectNotification,
}: Props) => (
  <aside
    className="adm-sidebar"
    aria-label="Admin navigation"
    style={{
      width: SIDEBAR_WIDTH,
      background: "var(--admin-bg)",
      borderRight: "1px solid var(--admin-border)",
      position: "sticky",
      top: 0,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      padding: "1.25rem 0.75rem 1rem 1.5rem",
      boxSizing: "border-box",
      fontFamily: "var(--font-body)",
    }}
  >
    {/* Brand + bell */}
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "0.5rem",
        padding: "0 0.75rem 1.5rem 0",
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.3rem",
            fontWeight: 400,
            color: "var(--surface)",
            margin: 0,
            letterSpacing: "0.01em",
            lineHeight: 1.2,
          }}
        >
          Sua Hair Studio
        </h1>
        <p
          style={{
            fontSize: "var(--text-2xs)",
            color: "var(--admin-dimmer)",
            margin: "0.2rem 0 0",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Admin
        </p>
      </div>
      <NotificationBell align="left" onSelect={onSelectNotification} />
    </div>

    {/* Nav groups */}
    <nav style={{ flex: 1, overflowY: "auto", paddingRight: "0.75rem" }}>
      {GROUPS.map((group) => {
        const groupItems = items.filter((i) => i.group === group);
        if (groupItems.length === 0) return null;
        return (
          <div key={group} style={{ marginBottom: "1.5rem" }}>
            <p
              style={{
                margin: "0 0 0.5rem 0.75rem",
                fontSize: "var(--text-2xs)",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--admin-dimmer)",
              }}
            >
              {NAV_GROUP_LABELS[group]}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {groupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className="adm-nav-link"
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                    {item.id === "approvals" && approvalsCount > 0 && (
                      <CountBadge count={approvalsCount} />
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>

    {/* Footer: site link, user, sign out */}
    <div
      style={{
        borderTop: "1px solid var(--admin-border)",
        paddingTop: "0.75rem",
        paddingRight: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <a href="/" className="adm-footer-btn">
        <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
        View booking site
      </a>
      {email && (
        <p
          title={email}
          style={{
            margin: "0.5rem 0 0.25rem 0.75rem",
            fontSize: "var(--text-xs)",
            color: "var(--admin-dimmer)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {email}
        </p>
      )}
      <button className="adm-footer-btn" onClick={onSignOut}>
        <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
        Sign out
      </button>
    </div>
  </aside>
);

export default AdminSidebar;
