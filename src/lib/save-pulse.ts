import { useEffect, useRef, useState } from "react";

// A boolean that flips true then automatically back to false after `ms` —
// JOS-48's mL save-confirmation flash. Not a debounce: calling `pulse()`
// restarts the same window every time rather than waiting for calls to
// stop. Only ever read/written from the returned callback or the cleanup
// effect, never during render, so it's safe under this codebase's
// react-hooks/refs rule (see debounced-commit.ts's identical note).
export function useSavePulse(ms: number): [boolean, () => void] {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pulse() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setActive(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActive(false);
    }, ms);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return [active, pulse];
}
