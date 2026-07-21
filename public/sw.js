// Minimal service worker — its only job is to make the app installable
// and speed up repeat loads by caching static build assets. It deliberately
// does NOT cache navigation requests, API routes, or anything Supabase
// (auth, data, realtime), so logged data is never served stale.
const CACHE_NAME = "nestlog-static-v1";
const STATIC_PATH_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icon(-\d+)?(-maskable)?$/,
  /^\/apple-icon$/,
  /^\/favicon\.ico$/,
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isStaticAsset =
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    STATIC_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname));

  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
