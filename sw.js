const CACHE_NAME = "training-tracker-v180";
const ASSETS = [
  "./training-tracker.html?v=180",
  "./training-tracker.css?v=180",
  "./js/config.js?v=180",
  "./js/exercises.js?v=180",
  "./js/calendar.js?v=180",
  "./js/theme.js?v=180",
  "./js/storage.js?v=180",
  "./js/session.js?v=180",
  "./js/plan.js?v=180",
  "./js/widget.js?v=180",
  "./js/stats.js?v=180",
  "./js/workout.js?v=180",
  "./js/band.js?v=180",
  "./js/music.js?v=180",
  "./js/coach.js?v=180",
  "./js/ai.js?v=180",
  "./js/history.js?v=180",
  "./js/utils.js?v=180",
  "./js/app.js?v=180",
  "./wearable.js?v=180",
  "./exercise-catalog.js?v=180",
  "./supabase-config.js?v=180",
  "./cloud.js?v=180",
  "./manifest.webmanifest?v=180",
  "./apple-touch-icon.png?v=180",
  "./icon-192.png?v=180",
  "./icon-512.png?v=180",
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
          caches.match("./training-tracker.html?v=180").then((cached) => cached || caches.match("./training-tracker.html"))
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
