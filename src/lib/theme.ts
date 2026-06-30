// theme.ts
// Single source of truth for design tokens.
// Import THEME in components rather than scattering magic hex strings.
// CSS custom properties in index.css mirror these values so both
// inline-style and class-based styling stay in sync.

export const THEME = {
  colors: {
    ink: "#161615",        // primary text, near-black
    inkSoft: "#3a3a38",    // secondary headings, hover states
    paper: "#faf9f7",      // page background
    surface: "#ffffff",    // card surfaces
    border: "#e7e5e0",     // default hairline
    borderStrong: "#cfccc5", // emphasis, dividers
    greyMuted: "#8a8884",  // secondary text, placeholders
    // accent is the ONLY fill colour — reserved for primary CTAs and active nav
    accent: "#161615",
  },
  fonts: {
    display: "'Bodoni Moda', Georgia, serif",  // headlines, confirmation screen
    body: "'Inter', system-ui, sans-serif",    // all UI text
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
  },
  radii: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "20px",
  },
  shadows: {
    sm: "0 1px 3px rgba(22, 22, 21, 0.06)",
    md: "0 4px 16px rgba(22, 22, 21, 0.08)",
    lg: "0 12px 40px rgba(22, 22, 21, 0.1)",
  },
} as const;

export type Theme = typeof THEME;
