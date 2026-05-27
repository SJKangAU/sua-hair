// StepIndicator.tsx
// 2-step progress indicator for the booking flow
// Step 1: When & Who (calendar, stylist, service)
// Step 2: Your Details (name, phone, confirmation)

interface Props {
  currentStep: number;
}

const STEPS = ["When & Who", "Your Details"];

const StepIndicator = ({ currentStep }: Props) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "1.75rem 2rem 0",
        gap: 0,
      }}
    >
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const active = currentStep >= stepNum;
        const current = currentStep === stepNum;
        const completed = currentStep > stepNum;
        const isLast = i === STEPS.length - 1;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              flex: isLast ? "none" : 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.4rem",
                flexShrink: 0,
              }}
            >
              {/* Circle */}
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: active ? "var(--text-primary)" : "transparent",
                  border: active
                    ? "2px solid var(--text-primary)"
                    : "2px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                {completed ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="var(--gold)"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: active ? "var(--gold)" : "var(--text-muted)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {stepNum}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: current ? 500 : 400,
                  color: current
                    ? "var(--text-primary)"
                    : active
                    ? "var(--text-secondary)"
                    : "var(--text-muted)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  transition: "color 0.2s",
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
                  height: "1px",
                  background: completed
                    ? "var(--text-primary)"
                    : "var(--border)",
                  margin: "0 0.5rem",
                  marginBottom: "1.35rem",
                  transition: "background 0.2s",
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
