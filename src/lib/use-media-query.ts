import { useSyncExternalStore } from "react";

// Whether a CSS media query currently matches; false on the server and during
// hydration. For the places that must render ONE of two layouts instead of
// both with one hidden by CSS (a hidden copy still re-renders every tick).
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
