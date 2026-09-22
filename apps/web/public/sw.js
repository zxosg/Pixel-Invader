const CACHE_NAME = "retro-converter-shell-v4";
const APP_BASE_URL = new URL("./", self.registration.scope);
const SHELL = [
  APP_BASE_URL.toString(),
  new URL("index.html", APP_BASE_URL).toString(),
  new URL("manifest.webmanifest", APP_BASE_URL).toString(),
  new URL("icon.svg", APP_BASE_URL).toString(),
];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);
  const indexResponse = await fetch(new URL("index.html", APP_BASE_URL), { cache: "reload" });
  const html = await indexResponse.text();
  const assets = Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), (match) => match[1])
    .filter((path) => path?.startsWith(APP_BASE_URL.pathname));
  await cache.addAll(assets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => request.mode === "navigate"
      ? caches.match(new URL("index.html", APP_BASE_URL).toString())
      : undefined)),
  );
});
