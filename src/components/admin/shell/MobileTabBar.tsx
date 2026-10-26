// MobileTabBar.tsx
// The bottom tab bar for screens under 900px: Today, Approvals (with its count
// badge), Bookings and More. More opens a bottom sheet holding the remaining
// destinations plus the booking-site link, the signed-in user and sign-out —
// everything the desktop sidebar shows.

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Ellipsis, ExternalLink, LogOut, Moon, Sun, X } from "lucide-react";
import CountBadge from "./CountBadge";
import { TAB_BAR_IDS, type NavItem } from "./navItems";
import type { AdminTheme } from "../../../hooks/useAdminTheme";

interface Props {
  items: NavItem[];
  approvalsCount: number;
  email: string | null | undefined;
  onSignOut: () => void;
  theme: AdminTheme;
  onToggleTheme: () => void;
}

const MobileTabBar = ({
  items,
  approvalsCount,
  email,
  onSignOut,
  theme,
  onToggleTheme,
}: Props) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  const barItems = TAB_BAR_IDS.map((id) => items.find((i) => i.id === id)).filter(
    (i): i is NavItem => Boolean(i),
  );
  const moreItems = items.filter((i) => !TAB_BAR_IDS.includes(i.id));
  // "More" reads as active when the current page lives inside it
  const moreActive = moreItems.some((i) => location.pathname.startsWith(i.path));

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      <nav className="adm-tabbar" aria-label="Admin navigation">
        {barItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.id} to={item.path} className="adm-tab">
              <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
              {item.label}
              {item.id === "approvals" && approvalsCount > 0 && (
                <CountBadge count={approvalsCount} floating />
              )}
            </NavLink>
          );
        })}
        <button
          className="adm-tab"
          data-active={moreActive || moreOpen}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Ellipsis size={22} strokeWidth={1.75} aria-hidden="true" />
          More
        </button>
      </nav>

      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(22,22,21,0.45)",
              zIndex: 70,
            }}
          />
          <div
            className="adm-sheet"
            role="dialog"
            aria-label="More"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 71,
              background: "var(--admin-bg)",
              borderRadius: "16px 16px 0 0",
              padding: "1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px))",
              fontFamily: "var(--font-body)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-2xs)",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--admin-dimmer)",
                }}
              >
                More
              </span>
              <button
                className="adm-footer-btn"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                style={{ width: "auto", padding: "0.4rem" }}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className="adm-nav-link"
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
              <a href="/" className="adm-footer-btn" style={{ padding: "0.6rem 0.75rem", fontSize: "var(--text-base)" }}>
                <ExternalLink size={18} strokeWidth={1.75} aria-hidden="true" />
                View booking site
              </a>
              <button
                className="adm-footer-btn"
                onClick={onToggleTheme}
                aria-pressed={theme === "dark"}
                style={{ padding: "0.6rem 0.75rem", fontSize: "var(--text-base)" }}
              >
                {theme === "dark" ? (
                  <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </div>
            <div
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid var(--admin-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <span
                title={email ?? undefined}
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--admin-dimmer)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </span>
              <button
                className="adm-footer-btn"
                onClick={onSignOut}
                style={{ width: "auto", flexShrink: 0 }}
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MobileTabBar;
