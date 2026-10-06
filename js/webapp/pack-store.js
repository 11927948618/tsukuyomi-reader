// IndexedDB storage for installed webapp packs.
//
// Deliberately separate from the Service Worker caches and from every localStorage key of the Reader:
//  - the Reader SW deletes every cache but its own on activate, and the "強制同期" button deletes caches;
//    neither touches this database (verified in the spike),
//  - logging out never deletes packs (they are the user's downloaded content); deletion is an explicit action.
//
// Stores:
//   packs  keyPath id                    one record per installed pack (see putPack callers)
//   files  keyPath [installId, path]     one record per file of an install ("installId" = one installed version)
//   meta   keyPath key                   small settings
// A pack record points at exactly one installId; an update writes a NEW installId and switches the pointer in a
// single put, so an interrupted update leaves the old version runnable.

const DB_NAME = "tsukuyomi-webapps";
const DB_VERSION = 1;
const MAX_KEY = "￿";

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB が利用できません"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("packs")) db.createObjectStore("packs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) {
        const files = db.createObjectStore("files", { keyPath: ["installId", "path"] });
        files.createIndex("byInstall", "installId", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("IndexedDB を開けません"));
    req.onblocked = () => reject(new Error("IndexedDB が他のタブでロックされています"));
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function runTx(storeNames, mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    try {
      result = work(tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already finished */ }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB error"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  }));
}

const reqValue = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

// ---- packs ---------------------------------------------------------------

export async function listPacks() {
  const db = await openDb();
  return reqValue(db.transaction("packs").objectStore("packs").getAll());
}

export async function getPack(id) {
  const db = await openDb();
  return reqValue(db.transaction("packs").objectStore("packs").get(id));
}

export function putPack(pack) {
  return runTx(["packs"], "readwrite", (tx) => { tx.objectStore("packs").put(pack); });
}

export async function patchPack(id, patch) {
  const current = await getPack(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await putPack(next);
  return next;
}

/** Removes the pack record first, then its files (a crash in between leaves orphan files that gc() removes). */
export async function deletePack(id) {
  const pack = await getPack(id);
  if (!pack) return false;
  await runTx(["packs"], "readwrite", (tx) => { tx.objectStore("packs").delete(id); });
  if (pack.installId) await deleteInstall(pack.installId);
  return true;
}

// ---- files ---------------------------------------------------------------

/** records: [{ path, mime, size, blob? , buf? }] - written in a single transaction. */
export function writeFiles(installId, records) {
  return runTx(["files"], "readwrite", (tx) => {
    const store = tx.objectStore("files");
    for (const rec of records) store.put({ installId, path: rec.path, mime: rec.mime, size: rec.size, blob: rec.blob || null, buf: rec.buf || null });
  });
}

function toBlob(rec) {
  if (rec.blob) return rec.blob;
  if (rec.buf) return new Blob([rec.buf], { type: rec.mime });
  return null;
}

/** [{ path, mime, size, blob }] for one install. Blob records are handles (cheap); buffer records are rewrapped. */
export async function readInstallFiles(installId) {
  const db = await openDb();
  const rows = await reqValue(db.transaction("files").objectStore("files").getAll(IDBKeyRange.bound([installId, ""], [installId, MAX_KEY])));
  return rows.map((rec) => ({ path: rec.path, mime: rec.mime, size: rec.size, blob: toBlob(rec) })).filter((f) => f.blob);
}

export function deleteInstall(installId) {
  return runTx(["files"], "readwrite", (tx) => {
    tx.objectStore("files").delete(IDBKeyRange.bound([installId, ""], [installId, MAX_KEY]));
  });
}

/**
 * Integrity check used before every launch (cheap: metadata + blob handle sizes, no hashing).
 * Returns { ok, reason?, missing:[paths] }.
 */
export async function verifyInstall(pack) {
  if (!pack || !pack.installId || !Array.isArray(pack.fileIndex)) return { ok: false, reason: "no-install", missing: [] };
  const db = await openDb();
  const found = new Map();
  await new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound([pack.installId, ""], [pack.installId, MAX_KEY]);
    const req = db.transaction("files").objectStore("files").openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      const rec = cursor.value;
      const actual = rec.blob ? rec.blob.size : rec.buf ? rec.buf.byteLength : -1;
      found.set(rec.path, { recorded: rec.size, actual });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const missing = [];
  for (const [path, size] of pack.fileIndex) {
    const rec = found.get(path);
    if (!rec || rec.actual !== size || rec.recorded !== size) missing.push(path);
  }
  if (missing.length > 0) return { ok: false, reason: "files-missing-or-corrupt", missing };
  if (found.size !== pack.fileIndex.length) return { ok: false, reason: "unexpected-files", missing: [] };
  return { ok: true, missing: [] };
}

/**
 * Housekeeping at start-up: drop installs that nothing references (interrupted installs/updates, crashes
 * during delete) and half-finished "installing" pack records older than the threshold.
 */
export async function gc({ staleInstallingMs = 30 * 60 * 1000 } = {}) {
  const packs = await listPacks();
  const now = Date.now();
  const referenced = new Set();
  for (const pack of packs) {
    if (pack.status === "installing" && now - Date.parse(pack.startedAt || 0) > staleInstallingMs) {
      await runTx(["packs"], "readwrite", (tx) => { tx.objectStore("packs").delete(pack.id); });
      continue;
    }
    if (pack.installId) referenced.add(pack.installId);
  }
  const db = await openDb();
  const orphans = [];
  await new Promise((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").index("byInstall").openKeyCursor(null, "nextunique");
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      if (!referenced.has(cursor.key)) orphans.push(cursor.key);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  for (const installId of orphans) await deleteInstall(installId);
  return { removedInstalls: orphans.length };
}

// ---- meta ----------------------------------------------------------------

export async function getMeta(key) {
  const db = await openDb();
  const rec = await reqValue(db.transaction("meta").objectStore("meta").get(key));
  return rec ? rec.value : undefined;
}

export function setMeta(key, value) {
  return runTx(["meta"], "readwrite", (tx) => { tx.objectStore("meta").put({ key, value }); });
}

// ---- environment ------------------------------------------------------------

/**
 * Can this browser store Blobs in IndexedDB reliably? (WebKit ports have been unreliable; the install falls back to
 * ArrayBuffer storage when this fails.) Uses a throw-away database.
 */
export async function probeBlobStorage() {
  if (typeof indexedDB === "undefined" || typeof Blob === "undefined") return false;
  const name = `tsukuyomi-probe-${Math.random().toString(36).slice(2)}`;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("s");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const blob = new Blob([new Uint8Array(256 * 1024).fill(7)], { type: "application/x-probe" });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("s", "readwrite");
      tx.objectStore("s").put(blob, "k");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    const back = await reqValue(db.transaction("s").objectStore("s").get("k"));
    const ok = Boolean(back) && back.size === blob.size && (await back.arrayBuffer()).byteLength === blob.size;
    db.close();
    indexedDB.deleteDatabase(name);
    return ok;
  } catch {
    try { indexedDB.deleteDatabase(name); } catch { /* ignore */ }
    return false;
  }
}

/** { usage, quota, persisted } - every field may be null when the API is unavailable. */
export async function storageSummary() {
  const out = { usage: null, quota: null, persisted: null };
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      out.usage = est.usage ?? null;
      out.quota = est.quota ?? null;
    }
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch { /* ignore */ }
  return out;
}

/**
 * navigator.storage.persist() without ever blocking: Firefox shows a permission prompt and may never answer.
 * Resolves to true / false / "pending" / "unavailable".
 */
export function requestPersist(timeoutMs = 1500) {
  if (!navigator.storage?.persist) return Promise.resolve("unavailable");
  return Promise.race([
    navigator.storage.persist().then((v) => Boolean(v), () => false),
    new Promise((resolve) => setTimeout(() => resolve("pending"), timeoutMs))
  ]);
}
