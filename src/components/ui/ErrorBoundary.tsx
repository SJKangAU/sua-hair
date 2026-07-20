// ErrorBoundary.tsx
// App-level React error boundary — without one, a single render crash
// white-screens the entire app. Class component because error boundaries
// have no hook equivalent (getDerivedStateFromError/componentDidCatch).
// The fallback matches the site's monochrome aesthetic and offers a reload,
// which recovers from transient states (bad cached data, failed chunk load).

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled render error:", error, errorInfo.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "var(--paper, #fff)",
          color: "var(--ink, #111)",
          fontFamily: "var(--font-body, sans-serif)",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 400,
            fontSize: "1.75rem",
            margin: 0,
          }}
        >
          Something went wrong
        </h1>
        <p style={{ margin: 0, maxWidth: "26rem", lineHeight: 1.5 }}>
          An unexpected error stopped the page from loading. Reloading usually
          fixes it — if not, please call us on (03) 9569 0840.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "0.5rem",
            padding: "0.65rem 1.5rem",
            border: "1px solid var(--ink, #111)",
            background: "var(--ink, #111)",
            color: "#fff",
            borderRadius: "6px",
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
