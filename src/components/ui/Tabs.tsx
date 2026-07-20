// Tabs.tsx
// Admin tab navigation — lucide-react icons, monochrome active state.
// Active tab: white text + 2px white underline on --ink header. Inactive: --admin-dimmer.

import {
  Calendar,
  ClipboardList,
  ClipboardCheck,
  Users,
  GraduationCap,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

const TAB_ICONS: Record<string, LucideIcon> = {
  today: Calendar,
  approvals: ClipboardCheck,
  bookings: ClipboardList,
  clients: Users,
  training: GraduationCap,
  analytics: BarChart3,
  manage: Settings,
};

interface Tab {
  id: string;
  label: string;
  icon?: string; // kept for backward compat — ignored in favour of lucide lookup
  badgeCount?: number; // e.g. pending-approval count — rendered as a small pill
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

const Tabs = ({ tabs, activeTab, onChange }: Props) => {
  return (
    <div
      style={{
        borderBottom: `1px solid var(--admin-border)`,
        background: "var(--admin-bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "0 1.5rem",
          gap: "0.25rem",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = TAB_ICONS[tab.id];

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              style={{
                padding: "1rem 1.125rem",
                background: "none",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--surface)"
                  : "2px solid transparent",
                marginBottom: "-1px",
                color: active ? "var(--surface)" : "var(--admin-dimmer)",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: active ? 600 : 400,
                fontFamily: "var(--font-body)",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "color 0.15s",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {Icon && (
                <Icon
                  size={16}
                  strokeWidth={active ? 2 : 1.5}
                  color="currentColor"
                />
              )}
              {tab.label}
              {!!tab.badgeCount && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    background: active
                      ? "var(--surface)"
                      : "var(--admin-dimmer)",
                    color: "var(--ink)",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {tab.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Tabs;
