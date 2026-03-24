// validation.ts
// All input validation logic for the booking form
// Centralised here so rules can be updated in one place

import { SALON_CONFIG } from './config';

// Validate Australian mobile number — must be 10 digits starting with 04
export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s/g, '');
  return SALON_CONFIG.phoneRegex.test(cleaned);
};

// Validate name — letters and spaces only, minimum 2 characters
export const validateName = (name: string): boolean => {
  return SALON_CONFIG.nameRegex.test(name.trim());
};

// Strip spaces from phone number before saving to Firestore
export const cleanPhone = (phone: string): string => {
  return phone.replace(/\s/g, '');
};