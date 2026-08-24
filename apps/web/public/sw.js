const CACHE_NAME = "retro-converter-shell-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);
  const indexResponse = await fetch("/index.html", { cache: "reload" });
  const html = await indexResponse.text();
  const assets = Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g), (match) => match[1])
    .filter((path) => path?.startsWith("/"));
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
    }).catch(() => request.mode === "navigate" ? caches.match("/index.html") : undefined)),
  );
});
