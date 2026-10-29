import { useCallback, useSyncExternalStore } from "react";

export { COMPACT_QUERY } from "../lib/map/boot";

/** NARROW_QUERY matches screens too narrow for the legend and the link panel to be open side by side. */
export const NARROW_QUERY = "(max-width: 699px)";

/** useMediaQuery is whether query matches now, and re-renders when that changes. */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (listener) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
