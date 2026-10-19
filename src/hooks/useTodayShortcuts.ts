// useTodayShortcuts.ts
// Wires the Today page's keyboard shortcuts (see lib/shortcuts.ts). They stay
// quiet while typing in a field and while any dialog — the booking drawer, a
// modal, the More sheet — is open, so an arrow key in a form never changes
// the day behind it.

import { useEffect, useRef } from "react";
import { isTypingTarget, todayShortcut } from "../lib/shortcuts";

interface Handlers {
  onNew: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

const useTodayShortcuts = (handlers: Handlers) => {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const action = todayShortcut(e);
      if (!action) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      e.preventDefault();
      const h = ref.current;
      if (action === "new") h.onNew();
      else if (action === "prev") h.onPrev();
      else if (action === "next") h.onNext();
      else h.onToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
};

export default useTodayShortcuts;
