// StepIndicator.tsx
// 3-step progress indicator for the booking flow.
// Circle states: future = outlined, active = filled accent, completed = filled + checkmark.
// Connecting lines fill as steps complete.

interface Props {
  currentStep: number;
}

const STEPS = ["Services", "Date & Stylist", "Your Details"];

const StepIndicator = ({ currentStep }: Props) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "1.5rem 1.5rem 0",
        gap: 0,
      }}
    >
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const completed = currentStep > stepNum;
        const active = currentStep === stepNum;
        const isLast = i === STEPS.length - 1;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              flex: isLast ? "none" : 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.375rem",
                flexShrink: 0,
              }}
            >
              {/* Circle */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background:
                    completed || active ? "var(--ink)" : "transparent",
                  border: `2px solid ${
                    completed || active ? "var(--ink)" : "var(--border-strong)"
                  }`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
              >
                {completed ? (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path
                      d="M1.5 5.5l2.75 2.75 4.75-4.75"
                      stroke="#ffffff"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      color: active ? "#ffffff" : "var(--grey-muted)",
                      fontFamily: "var(--font-body)",
                      lineHeight: 1,
                    }}
                  >
                    {stepNum}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: active ? 600 : 400,
                  color: active
                    ? "var(--ink)"
                    : completed
                    ? "var(--ink-soft)"
                    : "var(--grey-muted)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  transition: "color 0.2s ease",
                  textAlign: "center",
                }}
              >
                {label}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div
                style={{
                  flex: 1,
                  height: "1.5px",
                  background: completed ? "var(--ink)" : "var(--border)",
                  margin: "0 0.375rem",
                  marginTop: "11px",
                  transition: "background 0.2s ease",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;
