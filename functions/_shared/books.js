export const MANIFEST_KEY = "_tsukuyomi/books-manifest.json";

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

export function error(message, status = 400) {
  return json({ error: message }, { status });
}

export function getBucket(env) {
  return env.TSUKUYOMI_BOOKS_BUCKET || env.BOOKS_BUCKET || env.BUCKET || null;
}

export function requireAdmin(request, env) {
  const expected = env.TSUKUYOMI_ADMIN_TOKEN || env.ADMIN_TOKEN || "";
  if (!expected) {
    return { ok: false, response: error("TSUKUYOMI_ADMIN_TOKEN が未設定です", 500) };
  }

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = request.headers.get("x-admin-token") || "";
  const actual = bearer || headerToken;

  if (!actual || actual !== expected) {
    return { ok: false, response: error("管理トークンが違います", 401) };
  }
  return { ok: true };
}

export async function readCatalog(bucket) {
  const object = await bucket.get(MANIFEST_KEY);
  if (!object) {
    return { books: [], updatedAt: new Date().toISOString() };
  }

  const text = await object.text();
  const parsed = JSON.parse(text || "{}");
  if (Array.isArray(parsed)) return { books: parsed, updatedAt: new Date().toISOString() };
  if (!Array.isArray(parsed.books)) return { books: [], updatedAt: new Date().toISOString() };
  return parsed;
}

export async function writeCatalog(bucket, catalog) {
  const payload = {
    books: Array.isArray(catalog.books) ? catalog.books : [],
    updatedAt: new Date().toISOString()
  };
  await bucket.put(MANIFEST_KEY, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return payload;
}

export function toPublicManifestEntry(book) {
  return {
    id: book.id,
    title: book.title || "Untitled",
    author: book.author || "",
    description: book.description || "",
    format: book.format || "epub",
    path: `/api/books/${encodeURIComponent(book.id)}/content`,
    cover: book.coverKey ? `/api/books/${encodeURIComponent(book.id)}/cover` : "",
    published: book.published === true,
    updatedAt: book.updatedAt || ""
  };
}

export function sanitizeId(value, fallback = "book") {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || fallback;
}

export function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function boolValue(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

export function extFromFile(file, fallback = "") {
  const name = String(file?.name || "");
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : fallback;
}

export function contentTypeForExt(ext) {
  const normalized = String(ext || "").toLowerCase();
  if (normalized === "epub") return "application/epub+zip";
  if (normalized === "txt") return "text/plain; charset=utf-8";
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  return "application/octet-stream";
}

export async function serveR2Object(object, contentType = "application/octet-stream") {
  if (!object) return error("ファイルが見つかりません", 404);
  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }
  if (!headers.has("content-type")) headers.set("content-type", contentType);
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=300");
  return new Response(object.body, { headers });
}
