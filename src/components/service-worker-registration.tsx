"use client";

import { useEffect } from "react";

// Registers the service worker so the app is installable as a PWA. The
// worker itself only caches static build assets (see public/sw.js) —
// registration failing here shouldn't break anything, it just means the
// install prompt won't be offered.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
