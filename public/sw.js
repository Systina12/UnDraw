const CACHE_PREFIX = "draw-inverse-";
const CACHE = `${CACHE_PREFIX}v3`;

function appRoot() {
  return new URL("./", self.registration.scope);
}

self.addEventListener("install", (event) => {
  const root = appRoot();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([root.pathname, new URL("index.html", root).pathname])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const root = appRoot();
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            void caches.open(CACHE).then((cache) => {
              void cache.put(event.request, response.clone());
              void cache.put(root.pathname, response.clone());
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match(root.pathname).then((fallback) => fallback ?? Response.error()))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      if (response.ok) void caches.open(CACHE).then((cache) => void cache.put(event.request, response.clone()));
      return response;
    })),
  );
});
