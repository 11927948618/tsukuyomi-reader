// Download -> verify -> unzip -> store a webapp pack (install and update use the same path).
//
// Authentication is only needed for the download (/api/books/<id>/content is protected by the existing limited-review
// session); once installed a pack runs without any network or login.
import { PACK_LIMITS, isWebappEntry, mimeForPath, normalizeEntryPath, normalizeVersion, validatePackEntries, formatBytes } from "./pack-validate.js";
import { deleteInstall, deletePack, getPack, probeBlobStorage, putPack, writeFiles } from "./pack-store.js";

export class PackError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = "PackError";
    this.code = code;
    this.detail = detail;
  }
}

const BATCH_BYTES = 8 * 1024 * 1024;
const BATCH_FILES = 64;

function randomId() {
  const bytes = new Uint8Array(4);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || String(Date.now() % 1e8);
}

async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function downloadZip(url, { expectedSize, onProgress, signal }) {
  let res;
  try {
    res = await fetch(url, { credentials: "same-origin", signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new PackError("aborted", "ダウンロードをキャンセルしました");
    throw new PackError("network", "通信できません。ネットワーク接続を確認してください", err);
  }
  if (res.status === 401 || res.status === 403) throw new PackError("auth-required", "認証の有効期限が切れています。ログインし直してから、もう一度ダウンロードしてください");
  if (res.status === 404) throw new PackError("not-found", "コンテンツが見つかりません（配信が終了した可能性があります）");
  if (!res.ok) throw new PackError("http", `ダウンロードに失敗しました（HTTP ${res.status}）`);

  const total = expectedSize || Number(res.headers.get("content-length")) || 0;
  const chunks = [];
  let loaded = 0;
  if (!res.body?.getReader) {
    const blob = await res.blob();
    onProgress?.({ phase: "download", loaded: blob.size, total: blob.size });
    return blob;
  }
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (loaded > PACK_LIMITS.zipBytes + 1024) throw new PackError("too-large", `ZIPの上限(${formatBytes(PACK_LIMITS.zipBytes)})を超えています`);
      onProgress?.({ phase: "download", loaded, total });
    }
  } catch (err) {
    try { await reader.cancel(); } catch { /* ignore */ }
    if (err instanceof PackError) throw err;
    if (err?.name === "AbortError") throw new PackError("aborted", "ダウンロードをキャンセルしました");
    throw new PackError("network", "ダウンロード中に通信が途切れました", err);
  }
  return new Blob(chunks, { type: "application/zip" });
}

async function assertEnoughSpace(neededBytes) {
  try {
    if (!navigator.storage?.estimate) return;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (quota > 0 && quota - usage < neededBytes) {
      throw new PackError("quota", `端末の空き容量が足りません（必要 約${formatBytes(neededBytes)} / 空き ${formatBytes(Math.max(0, quota - usage))}）`);
    }
  } catch (err) {
    if (err instanceof PackError) throw err;
  }
}

/**
 * Install or update one pack.
 *   entry        catalog entry (contentType "webapp", id, title, version, entry, size, sha256, path, cover)
 *   resolveUrl   (path) => absolute URL the browser can fetch (library.js passes buildManifestAssetUrl)
 * Resolves to the stored pack record. Throws PackError (never leaves a half-installed pack runnable).
 */
export async function installPack(entry, { resolveUrl, onProgress, signal, jszip = globalThis.JSZip } = {}) {
  if (!isWebappEntry(entry) || !entry.id) throw new PackError("bad-entry", "Webコンテンツの情報が不正です");
  const version = normalizeVersion(entry.version);
  const entryPath = normalizeEntryPath(entry.entry);
  if (!version || !entryPath) throw new PackError("bad-entry", "Webコンテンツの version / 入口の情報が不正です");
  if (!jszip) throw new PackError("env", "ZIP展開ライブラリが読み込まれていません");
  const url = resolveUrl ? resolveUrl(entry.path) : entry.path;
  const expectedSize = Number(entry.size) || 0;

  await assertEnoughSpace(Math.max(expectedSize, 1024 * 1024) * 2.5);

  // 1. download (authentication is checked here, and only here)
  const zipBlob = await downloadZip(`${url}${url.includes("?") ? "&" : "?"}v=${version}`, { expectedSize, onProgress, signal });
  if (expectedSize && zipBlob.size !== expectedSize) throw new PackError("size-mismatch", "ダウンロードしたサイズが一致しません。もう一度お試しください");
  if (zipBlob.size > PACK_LIMITS.zipBytes) throw new PackError("too-large", `ZIPの上限(${formatBytes(PACK_LIMITS.zipBytes)})を超えています`);

  // 2. integrity (SHA-256 needs a secure context; the catalog always carries it for webapp entries)
  let verifiedHash = false;
  if (entry.sha256 && globalThis.crypto?.subtle) {
    onProgress?.({ phase: "verify", loaded: zipBlob.size, total: zipBlob.size });
    const actual = await sha256Hex(zipBlob);
    if (actual.toLowerCase() !== String(entry.sha256).toLowerCase()) throw new PackError("hash-mismatch", "ダウンロードしたファイルが破損しています。もう一度お試しください");
    verifiedHash = true;
  }

  // 3. open the archive and validate it with the same rules the server applied at upload time
  let zip;
  try {
    zip = await jszip.loadAsync(zipBlob);
  } catch (err) {
    throw new PackError("invalid-package", "ZIPファイルを開けません（破損している可能性があります）", err);
  }
  const items = Object.values(zip.files).map((f) => ({ name: f.name, dir: f.dir, size: Number(f._data?.uncompressedSize) || 0 }));
  const check = validatePackEntries(items, { entry: entryPath });
  if (!check.ok) throw new PackError("invalid-package", `パッケージが不正です: ${check.errors.slice(0, 3).map((e) => e.message).join(" / ")}`, check.errors);

  if (signal?.aborted) throw new PackError("aborted", "インストールをキャンセルしました");

  // 4. write the new version into its own install namespace
  const blobOk = await probeBlobStorage();
  const storageKind = blobOk ? "blob" : "buffer";
  const previous = await getPack(entry.id);
  const installId = `${entry.id}@${version}-${randomId()}`;
  const startedAt = new Date().toISOString();
  if (!previous) {
    // lets gc() reclaim the files if the tab dies mid-install
    await putPack({ id: entry.id, title: entry.title || entry.id, contentType: "webapp", version, installId, status: "installing", startedAt, storageKind });
  }

  let batch = [];
  let batchBytes = 0;
  let written = 0;
  let unpackedBytes = 0;
  const fileIndex = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const records = batch;
    batch = [];
    batchBytes = 0;
    await writeFiles(installId, records);
  };
  try {
    for (const file of check.files) {
      if (signal?.aborted) throw new PackError("aborted", "インストールをキャンセルしました");
      const raw = await zip.file(file.path).async("blob");
      const typed = new Blob([raw], { type: mimeForPath(file.path) });
      unpackedBytes += typed.size;
      if (typed.size > PACK_LIMITS.fileBytes || unpackedBytes > PACK_LIMITS.unpackedBytes) throw new PackError("invalid-package", "展開後のサイズが上限を超えています");
      const rec = { path: file.path, mime: mimeForPath(file.path), size: typed.size };
      if (storageKind === "blob") rec.blob = typed; else rec.buf = await typed.arrayBuffer();
      batch.push(rec);
      batchBytes += typed.size;
      fileIndex.push([file.path, typed.size]);
      written += 1;
      if (batchBytes >= BATCH_BYTES || batch.length >= BATCH_FILES) await flush();
      onProgress?.({ phase: "unpack", loaded: written, total: check.files.length });
    }
    await flush();

    // optional cover for the offline shelf (best effort)
    let cover = null;
    if (entry.cover && resolveUrl) {
      try {
        const res = await fetch(resolveUrl(entry.cover), { credentials: "same-origin", signal });
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0 && blob.size < 2 * 1024 * 1024) cover = blob;
        }
      } catch { /* cover is optional */ }
    }

    // 5. commit: the single put that makes the new version the runnable one
    const now = new Date().toISOString();
    const record = {
      id: entry.id,
      title: entry.title || entry.id,
      author: entry.author || "",
      description: entry.description || "",
      contentType: "webapp",
      version,
      installId,
      entry: entryPath,
      sha256: entry.sha256 || "",
      hashVerified: verifiedHash,
      size: zipBlob.size,
      unpackedBytes,
      fileCount: fileIndex.length,
      fileIndex,
      storageKind,
      status: "ready",
      installedAt: previous?.installedAt || now,
      updatedAt: now,
      lastLaunchedAt: previous?.lastLaunchedAt || null,
      catalogUpdatedAt: entry.updatedAt || "",
      cover: cover || previous?.cover || null
    };
    await putPack(record);
    if (previous?.installId && previous.installId !== installId) {
      try { await deleteInstall(previous.installId); } catch { /* gc() will reclaim it */ }
    }
    onProgress?.({ phase: "done", loaded: written, total: check.files.length });
    return record;
  } catch (err) {
    try { await deleteInstall(installId); } catch { /* gc() will reclaim it */ }
    if (!previous) {
      try { await deletePack(entry.id); } catch { /* gc() will reclaim it */ }
    }
    if (err instanceof PackError) throw err;
    if (err?.name === "QuotaExceededError" || /quota/i.test(String(err?.message))) throw new PackError("quota", "端末の保存容量が足りません", err);
    throw new PackError("storage", `端末への保存に失敗しました: ${err?.message || err}`, err);
  }
}
