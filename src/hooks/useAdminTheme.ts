// useAdminTheme.ts
// Light/dark choice for the admin shell. The choice is kept in this browser only,
// and defaults to light. The `data-theme` attribute goes on <html> (not the shell)
// so modals, toasts and the page background all follow it, and is removed again
// when the admin shell unmounts so the customer pages never pick it up.

import { useCallback, useEffect, useState } from "react";

export type AdminTheme = "light" | "dark";

const STORAGE_KEY = "sua-admin-theme";

const readSaved = (): AdminTheme => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
};

const useAdminTheme = () => {
  const [theme, setTheme] = useState<AdminTheme>(readSaved);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: AdminTheme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: the choice just lasts for this visit
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
};

export default useAdminTheme;
