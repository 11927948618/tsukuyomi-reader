// Pure helpers for "webapp" content packs (ZIP of a small offline web app).
// Shared by the browser (install-time validation) and Pages Functions (upload-time validation),
// so it must stay dependency-free and DOM-free.

export const DEFAULT_ENTRY = "index.html";

// Initial limits (design: 1 pack <= 32 MB zipped; authors should aim for 20-25 MB).
export const PACK_LIMITS = Object.freeze({
  zipBytes: 32 * 1024 * 1024,
  unpackedBytes: 150 * 1024 * 1024,
  fileBytes: 60 * 1024 * 1024,
  fileCount: 2000
});

const MIME_BY_EXT = Object.freeze({
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript",
  json: "application/json", txt: "text/plain", md: "text/markdown", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", ico: "image/x-icon",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  glb: "model/gltf-binary", gltf: "model/gltf+json", bin: "application/octet-stream",
  wasm: "application/wasm", ktx2: "image/ktx2"
});

export function mimeForPath(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/** "Webコンテンツ" catalog entry? (everything else is a book and goes to the existing Reader.) */
export function isWebappEntry(entry) {
  return Boolean(entry) && typeof entry === "object" && String(entry.contentType || "").toLowerCase() === "webapp";
}

/** Positive integer version or null. */
export function normalizeVersion(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1e9 ? n : null;
}

/**
 * Safe, normalised relative path inside a pack, or null when it must be rejected
 * (absolute, "..", backslash, NUL/control characters, drive letters, empty segments, over-long).
 */
export function normalizePackPath(raw) {
  if (typeof raw !== "string") return null;
  let path = raw;
  if (path.startsWith("./")) path = path.slice(2);
  if (!path || path.length > 512) return null;
  if (path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return null;
  if (/^[A-Za-z]:/.test(path)) return null;
  const segments = path.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.length > 255) return null;
  }
  return segments.join("/");
}

/** Entry path from a catalog / form value ("" => default). null when unsafe. */
export function normalizeEntryPath(value, fallback = DEFAULT_ENTRY) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return fallback;
  return normalizePackPath(text);
}

export function isIgnoredPath(path) {
  const p = String(path || "");
  return p.startsWith("__MACOSX/") || /(^|\/)(\.DS_Store|Thumbs\.db)$/.test(p);
}

/**
 * Validate the file list of a pack.
 * items: [{ name, size, dir? }]  (size = uncompressed bytes; null when unknown)
 * Returns { ok, errors:[{code,message,path?}], files:[{path,size}], totalBytes, entry }.
 */
export function validatePackEntries(items, { entry = DEFAULT_ENTRY, limits = PACK_LIMITS } = {}) {
  const errors = [];
  const files = [];
  const seen = new Map();
  let totalBytes = 0;
  const entryPath = normalizeEntryPath(entry);
  if (!entryPath) errors.push({ code: "entry-invalid", message: `入口ファイルの指定が不正です: ${entry}` });

  for (const item of Array.isArray(items) ? items : []) {
    const rawName = String(item?.name ?? "");
    if (item?.dir || rawName.endsWith("/")) continue;
    if (isIgnoredPath(rawName)) continue;
    const path = normalizePackPath(rawName);
    if (!path) {
      errors.push({ code: "unsafe-path", message: `使用できないファイルパスです: ${rawName.slice(0, 120)}`, path: rawName });
      continue;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      errors.push({ code: "duplicate-path", message: `大文字小文字だけが異なる重複パスがあります: ${path}`, path });
      continue;
    }
    seen.set(key, path);
    const size = Number.isFinite(item?.size) && item.size >= 0 ? Number(item.size) : 0;
    if (size > limits.fileBytes) {
      errors.push({ code: "file-too-large", message: `1ファイルの上限(${formatBytes(limits.fileBytes)})を超えています: ${path}`, path });
    }
    totalBytes += size;
    files.push({ path, size });
  }

  if (files.length === 0) errors.push({ code: "empty-pack", message: "パッケージにファイルがありません" });
  if (files.length > limits.fileCount) errors.push({ code: "too-many-files", message: `ファイル数の上限(${limits.fileCount})を超えています: ${files.length}` });
  if (totalBytes > limits.unpackedBytes) errors.push({ code: "unpacked-too-large", message: `展開後の合計上限(${formatBytes(limits.unpackedBytes)})を超えています` });
  if (entryPath && files.length > 0 && !seen.has(entryPath.toLowerCase())) {
    errors.push({ code: "entry-missing", message: `入口ファイルがパッケージ内にありません: ${entryPath}` });
  }
  return { ok: errors.length === 0, errors, files, totalBytes, entry: entryPath };
}

/** Is the catalog entry different from what is installed (update / rollback)? */
export function needsUpdate(remote, local) {
  if (!remote || !local) return false;
  if (normalizeVersion(remote.version) !== normalizeVersion(local.version)) return true;
  return Boolean(remote.sha256 && local.sha256 && String(remote.sha256).toLowerCase() !== String(local.sha256).toLowerCase());
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
