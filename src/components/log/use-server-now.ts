"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/server-clock";

// The server-corrected "now" (see server-clock.ts), redrawn every `tickMs`
// and the instant the app comes back to the foreground. The timer is never
// counted: each redraw recomputes it from the stored timestamps against this
// value, so a phone locked for 95 minutes reads 01 h 35 m the moment it wakes
// rather than whenever the next tick happens to fire.
export function useServerNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    const tick = () => setNow(serverNow());
    const id = window.setInterval(tick, tickMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [tickMs]);

  return now;
}
