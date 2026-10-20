"use client";

import { useEffect, useState } from "react";
import { serverNow, subscribeServerClock } from "@/lib/server-clock";

// The server-corrected "now" (see server-clock.ts), redrawn every `tickMs`,
// the instant the app comes back to the foreground and the instant the
// server's clock is found to differ from the device's. The timer is never
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
    // ... and the moment the server's clock turns out to differ from the
    // device's, rather than on the next tick (30 s away on an idle screen).
    const unsubscribe = subscribeServerClock(tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
      unsubscribe();
    };
  }, [tickMs]);

  return now;
}
