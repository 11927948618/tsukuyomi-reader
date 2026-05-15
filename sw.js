const CACHE_NAME = "tsukuyomi-reader-v0.1.47";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./sw.js",
  "./README.md",
  "./config/site-config.json",
  "./books/manifest.json",
  "./book/manifest.json",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-maskable.svg",
  "./css/reset.css",
  "./css/base.css",
  "./css/admin.css",
  "./css/vertical.css",
  "./css/reader.css",
  "./js/app.js",
  "./js/admin.js",
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

async function cacheManifestBooks(cache) {
  try {
    const configRes = await fetch("./config/site-config.json", { cache: "no-store" });
    const config = configRes.ok ? await configRes.json() : {};
    const manifestPath = config.booksManifest || "./books/manifest.json";
    let res = await fetch(manifestPath, { cache: "no-store" });
    if (res.status === 404 && manifestPath !== "./books/manifest.json") {
      res = await fetch("./books/manifest.json", { cache: "no-store" });
    }
    if (!res.ok) return;
    const manifest = await res.json();
    const books = Array.isArray(manifest) ? manifest : Array.isArray(manifest?.books) ? manifest.books : [];
    const urls = books
      .filter((entry) => entry?.published === true)
      .flatMap((entry) => [entry?.path, entry?.cover])
      .filter(Boolean)
      .map((path) => buildAssetUrl(path, manifestPath));
    if (urls.length > 0) {
      await Promise.allSettled(urls.map((url) => cache.add(url)));
    }
  } catch (err) {
    // Leave install successful even when book cache priming fails.
  }
}

function buildAssetUrl(path, manifestPath) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return raw;
  if (raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/")) return encodeRelativeUrl(raw);
  const base = String(manifestPath || "").split(/[?#]/, 1)[0].replace(/\/[^/]*$/, "");
  return encodeRelativeUrl(base ? `${base}/${raw}` : raw);
}

function encodeRelativeUrl(url) {
  const [pathAndQuery, hash = ""] = String(url).split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const encodedPath = path
    .split("/")
    .map((part) => {
      if (!part || part === "." || part === "..") return part;
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch (err) {
        return encodeURIComponent(part);
      }
    })
    .join("/");
  return `${encodedPath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS);
    await cacheManifestBooks(cache);
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
  const isBookAsset = url.pathname.includes("/book/") || url.pathname.includes("/books/");
  const isHtmlRequest =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/");
  const isSameOrigin = url.origin === self.location.origin;

  if (isBookAsset) {
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
