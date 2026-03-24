// StepOneDetails.tsx
// Step 1 of the booking form
// Handles mobile number input, customer lookup, and name input
// Phone confirmation checkbox prevents accidental wrong number submissions

import { validatePhone, validateName } from '../../lib/validation';
import type { CustomerProfile } from '../../types';

interface Props {
  customerName: string;
  customerPhone: string;
  phoneConfirmed: boolean;
  lookingUp: boolean;
  customerProfile: CustomerProfile | null;
  errors: { name?: string; phone?: string };
  onPhoneChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneConfirm: (confirmed: boolean) => void;
}

const inputStyle = {
  width: '100%',
  padding: '0.65rem',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '1rem',
  marginTop: '0.25rem',
  boxSizing: 'border-box' as const,
};

const inputErrorStyle = {
  ...inputStyle,
  border: '1px solid #e24b4a',
};

const errorTextStyle = {
  color: '#e24b4a',
  fontSize: '0.8rem',
  marginTop: '0.25rem',
  display: 'block' as const,
};

const labelStyle = {
  display: 'block' as const,
  marginBottom: '1rem',
  fontWeight: 500,
  fontSize: '0.95rem',
};

const StepOneDetails = ({
  customerName,
  customerPhone,
  phoneConfirmed,
  lookingUp,
  customerProfile,
  errors,
  onPhoneChange,
  onNameChange,
  onPhoneConfirm,
}: Props) => {
  const phoneValid = validatePhone(customerPhone);
  const nameValid = validateName(customerName);
  const phoneHasInput = customerPhone.length > 0;
  const nameHasInput = customerName.length > 0;

  return (
    <div>
      <h3 style={{ marginBottom: '1.25rem', fontSize: '1.1rem' }}>Your Details</h3>

      {/* Mobile number field */}
      <label style={labelStyle}>
        Mobile Number
        <input
          style={errors.phone ? inputErrorStyle : inputStyle}
          type="tel"
          placeholder="e.g. 0412 345 678"
          value={customerPhone}
          onChange={e => onPhoneChange(e.target.value)}
        />
        {/* Inline validation feedback */}
        {phoneHasInput && !phoneValid && (
          <span style={errorTextStyle}>
            Please enter a valid Australian mobile number (e.g. 0412 345 678)
          </span>
        )}
        {errors.phone && <span style={errorTextStyle}>{errors.phone}</span>}
        {lookingUp && (
          <span style={{ fontSize: '0.8rem', color: '#6b6b6b', display: 'block', marginTop: '0.25rem' }}>
            Looking up your details...
          </span>
        )}
      </label>

      {/* Phone confirmation checkbox — shows once number is valid */}
      {phoneValid && (
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={phoneConfirmed}
            onChange={e => onPhoneConfirm(e.target.checked)}
            style={{ marginTop: '2px', cursor: 'pointer' }}
          />
          <span>
            I confirm <strong>{customerPhone}</strong> is my correct mobile number
          </span>
        </label>
      )}

      {/* Returning customer banner */}
      {customerProfile && !lookingUp && (
        <div style={{
          background: '#fdf6ec',
          border: '1px solid #c9a96e',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.9rem',
        }}>
          <p style={{ fontWeight: 600, color: '#c9a96e' }}>
            Welcome back, {customerProfile.name}! 👋
          </p>
          <p style={{ color: '#6b6b6b', marginTop: '0.25rem' }}>
            {customerProfile.visitCount === 1
              ? 'This will be your 2nd visit — we appreciate you coming back!'
              : `You've visited us ${customerProfile.visitCount} times — thank you for your loyalty!`}
          </p>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Last visit: {customerProfile.lastVisit}
          </p>
        </div>
      )}

      {/* New customer banner */}
      {phoneValid && !customerProfile && !lookingUp && (
        <div style={{
          background: '#f0f7ff',
          border: '1px solid #b5d4f4',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.9rem',
          color: '#6b6b6b',
        }}>
          Welcome! Looks like it's your first time with us 🎉
        </div>
      )}

      {/* Full name field */}
      <label style={labelStyle}>
        Full Name
        <input
          style={errors.name ? inputErrorStyle : inputStyle}
          type="text"
          placeholder="e.g. Jane Smith"
          value={customerName}
          onChange={e => onNameChange(e.target.value)}
        />
        {nameHasInput && !nameValid && (
          <span style={errorTextStyle}>
            Name must be at least 2 characters and contain letters only
          </span>
        )}
        {errors.name && <span style={errorTextStyle}>{errors.name}</span>}
      </label>
    </div>
  );
};

export default StepOneDetails;