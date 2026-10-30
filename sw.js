const CACHE_NAME = "training-tracker-v182";
const ASSETS = [
  "./training-tracker.html?v=182",
  "./training-tracker.css?v=182",
  "./js/config.js?v=182",
  "./js/exercises.js?v=182",
  "./js/calendar.js?v=182",
  "./js/theme.js?v=182",
  "./js/storage.js?v=182",
  "./js/session.js?v=182",
  "./js/plan.js?v=182",
  "./js/widget.js?v=182",
  "./js/stats.js?v=182",
  "./js/workout.js?v=182",
  "./js/band.js?v=182",
  "./js/music.js?v=182",
  "./js/coach.js?v=182",
  "./js/ai.js?v=182",
  "./js/history.js?v=182",
  "./js/utils.js?v=182",
  "./js/app.js?v=182",
  "./wearable.js?v=182",
  "./exercise-catalog.js?v=182",
  "./supabase-config.js?v=182",
  "./cloud.js?v=182",
  "./manifest.webmanifest?v=182",
  "./apple-touch-icon.png?v=182",
  "./icon-192.png?v=182",
  "./icon-512.png?v=182",
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
          caches.match("./training-tracker.html?v=182").then((cached) => cached || caches.match("./training-tracker.html"))
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
