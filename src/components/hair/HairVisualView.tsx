// HairVisualView.tsx
// How a "Your hair" option looks: a colour swatch, a built-in line icon, the owner's own
// image, or plain text. Shared by the booking step, the Manage editor's preview and the staff
// view, so an option looks the same everywhere. Icons use currentColor, so dark mode works.

import type { ReactElement } from "react";
import type { HairIconKey, HairVisual } from "../../lib/hairProfile";

const ICON_PATHS: Record<HairIconKey, ReactElement> = {
  // length: a head with hair falling to different lengths
  short: <><circle cx="16" cy="9" r="4.5" /><path d="M11.5 9c0-3 2-5 4.5-5s4.5 2 4.5 5" /><path d="M11.5 9v4M20.5 9v4" /></>,
  shoulder: <><circle cx="16" cy="9" r="4.5" /><path d="M11.5 9c0-3 2-5 4.5-5s4.5 2 4.5 5" /><path d="M11.5 9v10M20.5 9v10" /></>,
  long: <><circle cx="16" cy="9" r="4.5" /><path d="M11.5 9c0-3 2-5 4.5-5s4.5 2 4.5 5" /><path d="M11.5 9v18M20.5 9v18" /></>,
  // thickness: strands, finer to bolder
  fine: <path d="M8 6v20M12 6v20M16 6v20M20 6v20M24 6v20" strokeWidth="0.9" />,
  medium: <path d="M9 6v20M14 6v20M19 6v20M24 6v20" strokeWidth="1.7" />,
  thick: <path d="M9 6v20M16 6v20M23 6v20" strokeWidth="3" />,
  // condition
  healthy: <><path d="M10 26c-3-6-3-14 0-20M16 26c-3-6-3-14 0-20M22 26c-3-6-3-14 0-20" /><path d="M25 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" strokeWidth="1.2" /></>,
  dry: <path d="M10 26l2-5-2-4 2-5-2-6M16 26l2-5-2-4 2-5-2-6M22 26l2-5-2-4 2-5-2-6" />,
  damaged: <><path d="M12 6v8l-3 4M12 14l3 4M20 6v6l3 3-3 3M20 18v8" /><path d="M9 26l3-4M15 26l-3-4" /></>,
  // texture
  wave: <path d="M5 16c3-6 6-6 9 0s6 6 9 0 3-3 4-3" />,
  curl: <path d="M5 18c0-6 6-6 6 0s6 6 6 0 6-6 6 0" />,
  coil: <path d="M8 6c8 0 8 4 0 4s-8 4 0 4 8 4 0 4-8 4 0 4" />,
  straight: <path d="M9 5v22M16 5v22M23 5v22" />,
  // misc
  scissors: <><circle cx="9" cy="23" r="3.5" /><circle cx="9" cy="9" r="3.5" /><path d="M12 11l16 12M12 21L28 9" /></>,
  colour: <path d="M16 4c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z" />,
  bleach: <><circle cx="16" cy="16" r="5" /><path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8" /></>,
  perm: <path d="M16 6c-8 0-8 7 0 7s8 7 0 7-6-4-3-6" />,
  untouched: <><circle cx="16" cy="16" r="11" /><path d="M10.5 16.5l4 4 7-8" /></>,
  unsure: <><circle cx="16" cy="16" r="11" /><path d="M12.5 12.5c0-2.5 2-4 4-4s4 1.5 4 3.5c0 3-4 3-4 6M16 23v.5" /></>,
};

interface Props {
  visual: HairVisual;
  size?: number;
  /** extra text for screen readers (the option label is read by the button around it) */
  title?: string;
}

const HairVisualView = ({ visual, size = 44, title }: Props) => {
  const box = { width: size, height: size, flexShrink: 0 } as const;
  if (visual.kind === "swatch") {
    return (
      <span
        role={title ? "img" : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        style={{ ...box, borderRadius: "50%", background: visual.color, border: "1.5px solid var(--border-strong)", display: "inline-block" }}
        data-testid="hair-swatch"
      />
    );
  }
  if (visual.kind === "image") {
    return (
      <img
        src={visual.url}
        alt={title ?? ""}
        loading="lazy"
        style={{ ...box, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
      />
    );
  }
  if (visual.kind === "text") {
    return (
      <span
        style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--border-strong)", borderRadius: 8, fontSize: size > 36 ? "0.7rem" : "0.6rem", fontWeight: 600, color: "var(--ink)", textAlign: "center", lineHeight: 1.1, padding: 2, overflow: "hidden" }}
      >
        {visual.text}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ ...box, color: "var(--ink)" }}
    >
      {ICON_PATHS[visual.icon]}
    </svg>
  );
};

export default HairVisualView;
