// StepIndicator.tsx
// 3-step B&W progress indicator for the booking flow

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
                  background: completed || active ? "#0a0a0a" : "transparent",
                  border: `2px solid ${
                    completed || active ? "#0a0a0a" : "#d0d0d0"
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
                      color: active ? "#ffffff" : "#999999",
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
                  color: active ? "#0a0a0a" : completed ? "#555555" : "#aaaaaa",
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
                  background: completed ? "#0a0a0a" : "#e0e0e0",
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
