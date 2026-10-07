const CACHE_NAME = "tsukuyomi-reader-v0.1.240";
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
  "./css/reader.css",
  "./css/webapp.css",
  "./js/app.js",
  "./js/admin.js",
  "./js/analytics.js",
  "./js/version.js",
  "./js/legacy-check.js",
  "./js/library.js",
  "./js/reader.js",
  "./js/mobile-pager.js",
  "./js/document-model.js",
  "./js/normalize-txt.js",
  "./js/normalize-md.js",
  "./js/normalize-aozora.js",
  "./js/normalize-epub.js",
  "./js/storage.js",
  "./js/utils.js",
  "./js/webapp/pack-validate.js",
  "./js/webapp/pack-store.js",
  "./js/webapp/pack-installer.js",
  "./js/webapp/sandbox-host.js",
  "./js/webapp/sandbox-shim.js",
  "./js/webapp/lexer-source.js",
  "./js/webapp/launcher.js",
  "./js/webapp/shelf.js",
  "./vendor/jszip.min.js",
  "./templates/library.html",
  "./templates/auth.html",
  "./templates/reader.html",
  "./templates/help.html"
];

async function cacheManifestBooks(cache) {
  try {
    const configRes = await fetch("./config/site-config.json", { cache: "no-store" });
    const config = configRes.ok ? await configRes.json() : {};
    const manifestPath = config.booksManifest || "./books/manifest.json";
    let res = await fetch(manifestPath, { cache: "no-store" });
    const manifestUrl = new URL(manifestPath, self.location.origin);
    if (res.ok && manifestUrl.pathname.startsWith("/api/")) return;
    if (res.status === 404 && manifestPath !== "./books/manifest.json") {
      res = await fetch("./books/manifest.json", { cache: "no-store" });
    }
    if (!res.ok) return;
    const manifest = await res.json();
    const books = Array.isArray(manifest) ? manifest : Array.isArray(manifest?.books) ? manifest.books : [];
    const urls = books
      .filter((entry) => entry?.published === true)
      // Web content packs are downloaded explicitly into IndexedDB; never pre-cache their ZIP here (only the cover).
      .flatMap((entry) => (String(entry?.contentType || "").toLowerCase() === "webapp" ? [entry?.cover] : [entry?.path, entry?.cover]))
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

// A redirected Response (Cloudflare Pages answers "/x/y.html" with a 308 to "/x/y") must not be
// handed to the page or stored as-is: Firefox then hangs on the fetch / re-dispatches the redirect
// target to this worker. Re-wrap it so it is a plain 200 response without the "redirected" flag.
async function plainResponse(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function networkAndCache(req) {
  // Navigations arrive with redirect:"manual". Cloudflare Pages answers "/x.html" with a 308 to "/x"; caching that
  // opaque redirect made offline "/x.html" bounce between "/x.html" and "/x" (ERR_TOO_MANY_REDIRECTS). Follow the
  // redirect here so a plain 200 is returned and cached, and never cache redirects / error responses.
  const target = req.mode === "navigate" ? new Request(req.url, { credentials: "same-origin" }) : req;
  const res = await plainResponse(await fetch(target));
  if (res.ok && res.type !== "opaqueredirect") {
    const resClone = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
  }
  return res;
}

async function precacheStatic(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    const res = await fetch(url, { cache: "reload" });
    if (!res.ok) throw new TypeError(`precache failed: ${url} (${res.status})`);
    await cache.put(url, await plainResponse(res));
  }));
}

// Cloudflare Pages 308-redirects "/x/y.html" to "/x/y". Firefox re-dispatches the redirect target
// ("/x/y") to this worker, which the precache only holds as "/x/y.html" - so offline fallbacks
// also try the ".html" form for extension-less same-origin paths.
async function matchCached(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && !url.pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    return caches.match(url.pathname + ".html");
  }
  return undefined;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await precacheStatic(cache, STATIC_ASSETS);
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
  const isSameOrigin = url.origin === self.location.origin;
  const isApiRequest = isSameOrigin && url.pathname.startsWith("/api/");
  const isBookAsset = url.pathname.includes("/book/") || url.pathname.includes("/books/");
  const isHtmlRequest =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/");

  if (isApiRequest) {
    event.respondWith(fetch(req, { cache: "no-store" }));
    return;
  }

  // Content-pack ZIPs go straight to the network: they are stored in IndexedDB by the installer, and keeping a second
  // copy in the Service Worker cache would double the storage and tie the pack to the SW cache lifecycle.
  if (isSameOrigin && url.pathname.toLowerCase().endsWith(".zip")) return;

  if (isBookAsset) {
    event.respondWith(
      networkAndCache(req).catch(() => matchCached(req))
    );
    return;
  }

  if (isHtmlRequest) {
    event.respondWith(
      networkAndCache(req)
        .catch(() =>
          matchCached(req).then((cached) => {
            if (cached) return cached;
            return caches.match("./index.html");
          })
        )
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    networkAndCache(req).catch(() => matchCached(req))
  );
});
