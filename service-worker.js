const CACHE_NAME = "quizhub-v5";
const APP_SHELL = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./ai-generate.js",
  "./doc-upload.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.svg",
  "./icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App shell: cache-first. Everything else (Firestore, AI API, fonts,
// live quiz data) always goes to the network — a quiz must never be
// answered from a stale cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAppShellFile = APP_SHELL.some((path) => url.pathname.endsWith(path.replace("./", "")));

  if (isAppShellFile && event.request.method === "GET") {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
  // else: let the network handle it (Firestore, Anthropic API, fonts, xlsx CDN)
});
