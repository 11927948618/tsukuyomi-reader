const CACHE_NAME = "tsukuyomi-reader-v0.1.45";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./README.md",
  "./book/manifest.json",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-maskable.svg",
  "./css/reset.css",
  "./css/base.css",
  "./css/vertical.css",
  "./css/reader.css",
  "./js/app.js",
  "./js/version.js",
  "./js/library.js",
  "./js/reader.js",
  "./js/normalize-txt.js",
  "./js/normalize-epub.js",
  "./js/storage.js",
  "./js/utils.js",
  "./vendor/jszip.min.js",
  "./templates/library.html",
  "./templates/reader.html",
  "./templates/help.html"
];

// Light edition keeps bundled-book restrictions at the library boundary.
// When reverting to the generic edition, this helper can be removed together with book/manifest.json support.
async function cacheBundledBooks(cache) {
  try {
    const res = await fetch("./book/manifest.json", { cache: "no-store" });
    if (!res.ok) return;
    const manifest = await res.json();
    const books = Array.isArray(manifest?.books) ? manifest.books : [];
    const urls = books
      .map((entry) => String(entry?.path || entry?.filename || "").replace(/^\.?\/+/, ""))
      .filter(Boolean)
      .map((relativePath) => `./book/${relativePath.split("/").map((part) => encodeURIComponent(part)).join("/")}`);
    if (urls.length > 0) {
      await cache.addAll(urls);
    }
  } catch (err) {
    // Leave install successful even when bundled-book cache priming fails.
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await cacheBundledBooks(cache);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      )
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isBundledBookAsset = url.pathname.includes("/book/");
  const isHtmlRequest =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/");
  const isSameOrigin = url.origin === self.location.origin;

  if (isBundledBookAsset) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

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

  if (!isSameOrigin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
