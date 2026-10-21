// PageLoading.tsx
// Shown while a lazy-loaded admin / stylist screen is first downloaded.

const PageLoading = () => (
  <div
    role="status"
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--paper)",
      color: "var(--grey-muted)",
      fontFamily: "var(--font-body)",
      fontSize: "var(--text-sm)",
      letterSpacing: "0.08em",
    }}
  >
    Loading…
  </div>
);

export default PageLoading;
