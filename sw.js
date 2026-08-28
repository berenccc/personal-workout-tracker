const CACHE_NAME = "training-tracker-v85";
const ASSETS = [
  "./training-tracker.html?v=85",
  "./training-tracker.css?v=85",
  "./training-tracker.js?v=85",
  "./exercise-catalog.js?v=85",
  "./training-history.js?v=85",
  "./training-feedback.js?v=85",
  "./supabase-config.js?v=85",
  "./cloud.js?v=85",
  "./manifest.webmanifest?v=85",
  "./apple-touch-icon.png?v=85",
  "./icon-192.png?v=85",
  "./icon-512.png?v=85",
  "./icon-192.svg",
  "./icon-512.svg",
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() =>
          caches.match("./training-tracker.html?v=85").then((cached) => cached || caches.match("./training-tracker.html"))
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./training-tracker.html"))
      )
  );
});
