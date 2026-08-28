const CACHE_NAME = "training-tracker-v114";
const ASSETS = [
  "./training-tracker.html?v=114",
  "./training-tracker.css?v=114",
  "./training-tracker.js?v=114",
  "./exercise-catalog.js?v=114",
  "./supabase-config.js?v=114",
  "./cloud.js?v=114",
  "./manifest.webmanifest?v=114",
  "./apple-touch-icon.png?v=114",
  "./icon-192.png?v=114",
  "./icon-512.png?v=114",
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
          caches.match("./training-tracker.html?v=114").then((cached) => cached || caches.match("./training-tracker.html"))
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
