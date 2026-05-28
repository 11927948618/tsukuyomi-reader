import { verifyAdminRequest } from "./admin-auth.js";

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

export function error(message, status = 400, init = {}) {
  return json({ error: message }, { ...init, status });
}

export function getBucket(env) {
  return env.TSUKUYOMI_BOOKS_BUCKET || env.BOOKS_BUCKET || env.BUCKET || null;
}

export async function requireAdmin(request, env) {
  const decision = await verifyAdminRequest(request, env);
  if (decision.ok) return decision;
  return {
    ...decision,
    response: error(decision.error || "管理者認証が必要です", decision.status || 401)
  };
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

export async function deleteR2Keys(bucket, keys) {
  const uniqueKeys = [...new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean))];
  const deleted = [];
  const failed = [];

  for (const key of uniqueKeys) {
    try {
      await bucket.delete(key);
      deleted.push(key);
    } catch (err) {
      failed.push({ key, error: err?.message || String(err || "") });
    }
  }

  return { deleted, failed };
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
  if (normalized === "pdf") return "application/pdf";
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
