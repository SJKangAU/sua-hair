// ServiceArt.tsx
// The picture beside a service on the booking page: the owner's own image when they have
// uploaded one (Manage, Services), otherwise a built-in illustration for the service's category.
// The illustrations use currentColor and the theme tokens, so they work in dark mode.

import type { ReactElement } from "react";

const ART: Record<string, ReactElement> = {
  // scissors and comb
  cut: (
    <>
      <circle cx="17" cy="44" r="6" />
      <circle cx="17" cy="20" r="6" />
      <path d="M22 23l30 24M22 41L52 17" />
      <path d="M44 52h12M44 56h12M44 48h12" strokeWidth="1.2" />
    </>
  ),
  // brush and bowl
  colour: (
    <>
      <path d="M8 38h30a15 15 0 0 1-30 0z" fill="var(--surface-raised, transparent)" />
      <path d="M40 30L54 10l4 3-12 22z" />
      <path d="M40 30l-6 8 8 2 4-7z" fill="var(--border, transparent)" />
    </>
  ),
  // blow dryer
  styling: (
    <>
      <path d="M10 22c0-6 5-10 12-10h16a8 8 0 0 1 0 16H22c-7 0-12-2-12-6z" />
      <path d="M26 28l-4 24h8l3-24" />
      <path d="M46 16l10-3M46 22h11M46 28l10 3" strokeWidth="1.3" />
    </>
  ),
  // drop with leaf
  treatment: (
    <>
      <path d="M32 8c9 12 14 19 14 27a14 14 0 0 1-28 0c0-8 5-15 14-27z" />
      <path d="M32 44c0-6 4-10 9-11-1 6-4 10-9 11z" fill="var(--border, transparent)" />
      <path d="M32 44V34" strokeWidth="1.2" />
    </>
  ),
  // razor
  grooming: (
    <>
      <path d="M8 40l32-20 6 10-32 20z" />
      <path d="M40 20l8-5 6 10-8 5" />
      <path d="M16 46l4 6" strokeWidth="1.2" />
    </>
  ),
  // curl
  perm: (
    <>
      <path d="M32 8c-16 0-16 14 0 14s16 14 0 14-12-8-6-12" />
      <path d="M26 44c-6 4-4 12 4 12h12" strokeWidth="1.3" />
    </>
  ),
};

const FALLBACK = (
  <>
    <circle cx="32" cy="22" r="9" />
    <path d="M18 54c0-9 6-15 14-15s14 6 14 15" />
  </>
);

interface Props {
  category: string;
  imageUrl?: string;
  size?: number;
}

const ServiceArt = ({ category, imageUrl, size = 56 }: Props) => {
  const box = { width: size, height: size, flexShrink: 0, borderRadius: 10 } as const;
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        data-testid="service-art"
        data-art="custom"
        style={{ ...box, objectFit: "cover", border: "1px solid var(--border)" }}
      />
    );
  }
  return (
    <span
      data-testid="service-art"
      data-art="default"
      aria-hidden="true"
      style={{ ...box, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface-raised, var(--surface))", border: "1px solid var(--border)", color: "var(--ink)" }}
    >
      <svg
        viewBox="0 0 64 64"
        width={size - 12}
        height={size - 12}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ART[category] ?? FALLBACK}
      </svg>
    </span>
  );
};

export default ServiceArt;
