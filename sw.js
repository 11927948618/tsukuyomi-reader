const CACHE_NAME = "tsukuyomi-reader-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/reset.css",
  "./css/base.css",
  "./css/vertical.css",
  "./css/reader.css",
  "./js/app.js",
  "./js/library.js",
  "./js/reader.js",
  "./js/normalize-txt.js",
  "./js/normalize-epub.js",
  "./js/storage.js",
  "./js/paging.js",
  "./js/utils.js",
  "./templates/library.html",
  "./templates/reader.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isHtmlRequest =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/");

  if (isHtmlRequest) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            return caches.match("./index.html");
          })
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      });
    })
  );
});
