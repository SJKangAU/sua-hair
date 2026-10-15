// SiteFooter.tsx
// Shared site footer for the public, customer-facing surfaces (booking page
// and the legal pages). Carries the salon contact line plus links to the
// Privacy Policy and Terms of Service so those pages are reachable from
// anywhere a customer lands. Uses react-router <Link> for the in-app legal
// routes and a plain external anchor for the marketing site.

import { Link } from "react-router-dom";

const linkStyle: React.CSSProperties = {
  color: "var(--ink-muted)",
  textDecoration: "none",
  transition: "color var(--transition-fast)",
};

const SiteFooter = () => {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "2rem",
        textAlign: "center",
        color: "var(--grey-muted)",
        fontSize: "var(--text-xs)",
        letterSpacing: "0.02em",
      }}
    >
      <p>Sua Hair Studio © 2025 · (03) 9569 0840 · Glen Waverley, VIC</p>
      <p
        style={{
          marginTop: "0.5rem",
          display: "flex",
          gap: "0.75rem",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Link to="/privacy" style={linkStyle}>
          Privacy Policy
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms" style={linkStyle}>
          Terms of Service
        </Link>
        <span aria-hidden="true">·</span>
        <a
          href="https://suahair.com.au"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          suahair.com.au
        </a>
      </p>
    </footer>
  );
};

export default SiteFooter;
