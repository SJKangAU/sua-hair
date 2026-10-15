// LegalPage.tsx
// Shared layout for the public legal pages (Privacy Policy, Terms of
// Service). Mirrors the booking page's monochrome chrome — sticky ink
// header with the wordmark, a floating white reading card on paper, and the
// shared SiteFooter — so the legal pages read as part of the same product.
//
// Each page passes its title, a visible "Last updated" date, and its body
// content as children. Body styling (headings, paragraphs, lists) is applied
// via the `legal-prose` class defined here so individual pages stay as plain
// semantic markup.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "./SiteFooter";

const PROSE_CSS = `
  .legal-prose { color: var(--ink); font-size: var(--text-base); line-height: 1.7; }
  .legal-prose h2 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 1.35rem;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin: 2rem 0 0.65rem;
  }
  .legal-prose h2:first-child { margin-top: 0; }
  .legal-prose p { margin: 0 0 0.9rem; }
  .legal-prose ul { margin: 0 0 0.9rem; padding-left: 1.25rem; }
  .legal-prose li { margin: 0 0 0.4rem; }
  .legal-prose a { color: var(--ink); text-decoration: underline; }
  .legal-prose strong { font-weight: 600; }
`;

interface Props {
  title: string;
  lastUpdated: string; // human-readable, e.g. "15 October 2026"
  children: ReactNode;
}

const LegalPage = ({ title, lastUpdated, children }: Props) => {
  return (
    <div
      style={{
        minHeight: "100svh",
        background: "var(--paper)",
        fontFamily: "var(--font-body)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{PROSE_CSS}</style>

      {/* Header */}
      <header
        style={{
          background: "var(--ink)",
          padding: "0 clamp(1rem, 4vw, 1.75rem)",
          height: "60px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.5rem",
            fontWeight: 400,
            color: "var(--surface)",
            letterSpacing: "0.06em",
            textDecoration: "none",
          }}
        >
          Sua Hair
        </Link>
        <Link
          to="/"
          style={{
            color: "var(--grey-muted)",
            fontSize: "var(--text-xs)",
            textDecoration: "none",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          ← Back to booking
        </Link>
      </header>

      {/* Content */}
      <main
        style={{
          flex: 1,
          maxWidth: "720px",
          width: "100%",
          margin: "2.5rem auto 4rem",
          padding: "0 1.25rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "16px",
            boxShadow: "var(--shadow-md)",
            padding: "clamp(1.75rem, 4vw, 3rem)",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2rem, 4vw, 2.75rem)",
              fontWeight: 300,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              margin: "0 0 0.5rem",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--grey-muted)",
              margin: "0 0 2rem",
            }}
          >
            Last updated: {lastUpdated}
          </p>

          <div className="legal-prose">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default LegalPage;
