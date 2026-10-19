// shellStyles.ts
// Layout constants and the stylesheet for the admin shell. The sidebar and the
// mobile tab bar need hover states, an active-page marker and a breakpoint,
// none of which inline styles can express — so they live here as classes,
// injected once by the layout.

import { ADMIN_NAV_BREAKPOINT } from "../../../lib/breakpoints";

export const SIDEBAR_WIDTH = 232;

export const SHELL_CSS = `
  .adm-shell {
    display: grid;
    grid-template-columns: ${SIDEBAR_WIDTH}px minmax(0, 1fr);
    min-height: 100vh;
  }
  .adm-topbar, .adm-tabbar { display: none; }
  .adm-main {
    padding: 2rem clamp(1rem, 3vw, 2rem) 3rem;
    max-width: 1400px;
    width: 100%;
    box-sizing: border-box;
    margin: 0 auto;
  }

  .adm-nav-link {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    color: var(--admin-faint);
    font-size: var(--text-base);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .adm-nav-link:hover { background: var(--admin-panel); color: var(--surface); }
  .adm-nav-link[aria-current="page"] {
    background: var(--admin-panel);
    color: var(--surface);
    font-weight: 600;
  }
  .adm-nav-link[aria-current="page"]::before {
    content: "";
    position: absolute;
    left: -0.75rem;
    top: 0.5rem;
    bottom: 0.5rem;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--surface);
  }
  .adm-footer-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    background: transparent;
    border: none;
    color: var(--admin-faint);
    font-size: var(--text-sm);
    font-family: var(--font-body);
    text-decoration: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .adm-footer-btn:hover { background: var(--admin-panel); color: var(--surface); }

  /* Hover for every admin button that has no bk-* class of its own: a slight
     darken reads on both outlined and filled buttons */
  .adm-shell button:not([class]) { transition: filter var(--transition-fast); }
  .adm-shell button:not([class]):not(:disabled):hover { filter: brightness(0.93); }
  .adm-bulk-primary:not(:disabled):hover { background: var(--surface-raised) !important; }
  .adm-bulk-secondary:not(:disabled):hover {
    background: var(--admin-panel) !important;
    color: var(--surface) !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .adm-shell button:not([class]) { transition: none; }
  }

  /* Bottom tab bar items */
  .adm-tab {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0.5rem 0.25rem;
    background: transparent;
    border: none;
    color: var(--admin-dimmer);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: color var(--transition-fast);
  }
  .adm-tab:hover { color: var(--surface); }
  .adm-tab[aria-current="page"], .adm-tab[data-active="true"] {
    color: var(--surface);
    font-weight: 700;
  }

  /* Phones and small tablets: sidebar becomes a top bar + bottom tab bar */
  @media (max-width: ${ADMIN_NAV_BREAKPOINT - 1}px) {
    .adm-shell { display: block; }
    .adm-sidebar { display: none !important; }
    .adm-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
      padding: 0.75rem 1rem;
      background: var(--admin-bg);
      border-bottom: 1px solid var(--admin-border);
    }
    .adm-tabbar {
      display: flex;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 60;
      background: var(--admin-bg);
      border-top: 1px solid var(--admin-border);
      padding-bottom: env(safe-area-inset-bottom, 0);
    }
    .adm-main { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }
  }
`;
