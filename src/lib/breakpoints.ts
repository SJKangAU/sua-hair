// breakpoints.ts
// Shared responsive breakpoint for admin dashboard list-row / grid layouts,
// so mobile collapse behavior stays consistent across components instead of
// drifting per file (BookingCard, ClientCard, TrainingList, etc.).
export const MOBILE_BREAKPOINT = 640;

// Admin shell: at or above this width the dark left sidebar shows; below it the
// navigation moves to a bottom tab bar.
export const ADMIN_NAV_BREAKPOINT = 900;
