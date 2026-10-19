// useBookingDrawerParam.ts
// Which booking's drawer is open lives in the URL (?booking=<id>), so any page
// can open it, a notification can deep-link straight to it, and a reload or a
// shared link lands on the same booking. Opening and closing replace the
// history entry rather than stacking one per click.

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const useBookingDrawerParam = () => {
  const [params, setParams] = useSearchParams();
  const bookingId = params.get("booking");

  const open = useCallback(
    (id: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("booking", id);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const close = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("booking");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { bookingId, open, close };
};

export default useBookingDrawerParam;
