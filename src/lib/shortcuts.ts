// shortcuts.ts
// Keyboard shortcuts for the Today page: N new booking, left / right arrow to
// change day, T back to today. Ctrl K (search) is handled by the search box
// itself. Anything with a modifier key belongs to the browser or the search
// box, so it is never claimed here.

export type TodayShortcut = "new" | "prev" | "next" | "today";

export const todayShortcut = (e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): TodayShortcut | null => {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "n":
    case "N":
      return "new";
    case "ArrowLeft":
      return "prev";
    case "ArrowRight":
      return "next";
    case "t":
    case "T":
      return "today";
    default:
      return null;
  }
};

// Typing in a field must never trigger a shortcut
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
};
