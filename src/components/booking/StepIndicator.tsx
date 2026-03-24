// StepIndicator.tsx
// Displays the 3-step progress bar at the top of the booking form

interface StepIndicatorProps {
  currentStep: number;
}

const STEPS = ['Your Details', 'Stylist & Service', 'Date & Time'];

const StepIndicator = ({ currentStep }: StepIndicatorProps) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
      {STEPS.map((label, i) => {
        const active = currentStep >= i + 1;
        return (
          <div key={i} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: active ? '#c9a96e' : '#ddd',
              color: active ? 'white' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 0.25rem',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}>
              {i + 1}
            </div>
            <span style={{ fontSize: '0.75rem', color: active ? '#c9a96e' : '#999' }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;