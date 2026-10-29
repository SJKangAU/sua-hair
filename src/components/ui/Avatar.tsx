// Avatar.tsx
// A round monogram for a person (a client). Initials of the first and last word of the
// name; the shade is picked from the name so the same person always looks the same.
// Monochrome, like the rest of the admin: ink mixed into the surface colour, so it
// follows light and dark mode.

import { initialsOf } from "../../lib/clientFormat";

interface Props {
  name: string;
  size?: number;
}

const SHADES = [8, 12, 16, 20];

const shadeOf = (name: string): number => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHADES[h % SHADES.length];
};

const Avatar = ({ name, size = 36 }: Props) => (
  <span
    aria-hidden="true"
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none",
      width: size,
      height: size,
      borderRadius: "50%",
      background: `color-mix(in srgb, var(--ink) ${shadeOf(name)}%, var(--surface))`,
      color: "var(--ink)",
      border: "1px solid var(--border)",
      fontFamily: "var(--font-body)",
      fontSize: `${Math.round(size * 0.38)}px`,
      fontWeight: 600,
      letterSpacing: "0.02em",
      lineHeight: 1,
    }}
  >
    {initialsOf(name)}
  </span>
);

export default Avatar;
