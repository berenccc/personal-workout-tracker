const CACHE_NAME = "training-tracker-v179";
const ASSETS = [
  "./training-tracker.html?v=179",
  "./training-tracker.css?v=179",
  "./js/config.js?v=179",
  "./js/exercises.js?v=179",
  "./js/calendar.js?v=179",
  "./js/theme.js?v=179",
  "./js/storage.js?v=179",
  "./js/session.js?v=179",
  "./js/plan.js?v=179",
  "./js/widget.js?v=179",
  "./js/stats.js?v=179",
  "./js/workout.js?v=179",
  "./js/band.js?v=179",
  "./js/music.js?v=179",
  "./js/coach.js?v=179",
  "./js/ai.js?v=179",
  "./js/history.js?v=179",
  "./js/utils.js?v=179",
  "./js/app.js?v=179",
  "./wearable.js?v=179",
  "./exercise-catalog.js?v=179",
  "./supabase-config.js?v=179",
  "./cloud.js?v=179",
  "./manifest.webmanifest?v=179",
  "./apple-touch-icon.png?v=179",
  "./icon-192.png?v=179",
  "./icon-512.png?v=179",
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
    // addAll отклоняет всю установку, если хоть один файл не скачался.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))
    )
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
          caches.match("./training-tracker.html?v=179").then((cached) => cached || caches.match("./training-tracker.html"))
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Кэшируем только свои файлы и CDN-библиотеку: ответы API с данными пользователя
        // и ошибки 404 в офлайн-кэш попадать не должны.
        const url = new URL(event.request.url);
        const isOwn = url.origin === self.location.origin && response.ok;
        const isCdn = url.hostname === "cdn.jsdelivr.net";
        if (isOwn || isCdn) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./training-tracker.html"))
      )
  );
});
