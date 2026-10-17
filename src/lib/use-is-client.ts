import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// False on the server and during hydration, true afterwards. Sleep cards show
// times in the *device's* time zone and a timer read against the live clock,
// neither of which the server can know, so they render only once this is true
// rather than render one thing on the server and another in the browser.
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
