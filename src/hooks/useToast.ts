// useToast.ts
// Hook for managing toast notifications
// Returns addToast function and the ToastContainer component props
// Usage: const { addToast, toasts, dismissToast } = useToast()

import { useState, useCallback } from 'react';
import type { ToastMessage, ToastType } from '../components/ui/Toast';

interface UseToast {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
}

const useToast = (): UseToast => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Add a new toast — generates a unique ID
  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  // Dismiss a toast by ID
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
};

export default useToast;