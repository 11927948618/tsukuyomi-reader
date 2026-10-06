import test from "node:test";
import assert from "node:assert/strict";

import {
  PACK_LIMITS, DEFAULT_ENTRY, isWebappEntry, normalizeVersion, normalizePackPath, normalizeEntryPath,
  validatePackEntries, needsUpdate, mimeForPath, isIgnoredPath
} from "../js/webapp/pack-validate.js";
import { readZipEntries, inspectZip, sha256Hex } from "../functions/_shared/zip-inspect.js";
import { toPublicManifestEntry, contentTypeForExt } from "../functions/_shared/books.js";

// ---- tiny ZIP writer (stored entries) so tests can also craft hostile archives ----
function crc32(bytes) {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}
function makeZip(files, { flags = 0, madeBy = 0x0314, externalAttrs = 0, nameBytes = null, method = 0 } = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (bytes) => { chunks.push(bytes); offset += bytes.length; };
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const cat = (...parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  for (const [name, content] of Object.entries(files)) {
    const nameB = nameBytes || enc.encode(name);
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    const localOffset = offset;
    push(cat(u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), nameB, data));
    central.push(cat(u32(0x02014b50), u16(madeBy), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(externalAttrs), u32(localOffset), nameB));
  }
  const cdOffset = offset;
  for (const c of central) push(c);
  const cdSize = offset - cdOffset;
  push(cat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdOffset), u16(0)));
  return cat(...chunks);
}

test("normalizePackPath rejects unsafe paths and keeps safe ones", () => {
  assert.equal(normalizePackPath("index.html"), "index.html");
  assert.equal(normalizePackPath("./models/a.glb"), "models/a.glb");
  assert.equal(normalizePackPath("日本語/ファイル.json"), "日本語/ファイル.json");
  for (const bad of ["../x", "a/../b", "/abs", "a\\b", "C:/x", "a//b", "a/./b", "", "a/\u0000b", "x".repeat(600)]) {
    assert.equal(normalizePackPath(bad), null, `should reject ${JSON.stringify(bad).slice(0, 30)}`);
  }
  assert.equal(normalizePackPath(42), null);
});

test("entry path defaults to index.html and is validated", () => {
  assert.equal(normalizeEntryPath(""), DEFAULT_ENTRY);
  assert.equal(normalizeEntryPath(undefined), DEFAULT_ENTRY);
  assert.equal(normalizeEntryPath("app/start.html"), "app/start.html");
  assert.equal(normalizeEntryPath("../x.html"), null);
});

test("validatePackEntries: ok pack, ignores dirs and OS junk", () => {
  const r = validatePackEntries([
    { name: "index.html", size: 100 }, { name: "css/", size: 0, dir: true }, { name: "css/a.css", size: 5 },
    { name: "__MACOSX/._index.html", size: 1 }, { name: ".DS_Store", size: 1 }
  ], { entry: "index.html" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.files.map((f) => f.path), ["index.html", "css/a.css"]);
  assert.equal(r.totalBytes, 105);
});

test("validatePackEntries: missing entry, duplicates (case-insensitive), unsafe path, limits", () => {
  assert.deepEqual(validatePackEntries([{ name: "a.html", size: 1 }], { entry: "index.html" }).errors.map((e) => e.code), ["entry-missing"]);
  assert.ok(validatePackEntries([{ name: "A.js", size: 1 }, { name: "a.js", size: 1 }, { name: "index.html", size: 1 }]).errors.some((e) => e.code === "duplicate-path"));
  assert.ok(validatePackEntries([{ name: "../evil", size: 1 }, { name: "index.html", size: 1 }]).errors.some((e) => e.code === "unsafe-path"));
  const limits = { ...PACK_LIMITS, fileBytes: 10, unpackedBytes: 15, fileCount: 2 };
  const codes = validatePackEntries([{ name: "index.html", size: 11 }, { name: "b", size: 5 }, { name: "c", size: 1 }], { limits }).errors.map((e) => e.code);
  assert.ok(codes.includes("file-too-large") && codes.includes("unpacked-too-large") && codes.includes("too-many-files"));
  assert.ok(validatePackEntries([], {}).errors.some((e) => e.code === "empty-pack"));
});

test("needsUpdate / normalizeVersion / isWebappEntry / mime / ignored", () => {
  assert.equal(normalizeVersion("3"), 3);
  assert.equal(normalizeVersion(0), null);
  assert.equal(normalizeVersion(1.5), null);
  assert.equal(needsUpdate({ version: 2 }, { version: 2 }), false);
  assert.equal(needsUpdate({ version: 3 }, { version: 2 }), true);
  assert.equal(needsUpdate({ version: 1 }, { version: 2 }), true); // rollback is an update too
  assert.equal(needsUpdate({ version: 2, sha256: "AA" }, { version: 2, sha256: "bb" }), true);
  assert.equal(needsUpdate({ version: 2, sha256: "AA" }, { version: 2, sha256: "aa" }), false);
  assert.equal(needsUpdate({ version: 2, sha256: "AA" }, { version: 2 }), false);
  assert.equal(isWebappEntry({ contentType: "webapp" }), true);
  assert.equal(isWebappEntry({ contentType: "WebApp" }), true);
  assert.equal(isWebappEntry({ format: "epub" }), false);
  assert.equal(isWebappEntry(null), false);
  assert.equal(mimeForPath("a/b/model.glb"), "model/gltf-binary");
  assert.equal(mimeForPath("x.unknown"), "application/octet-stream");
  assert.equal(isIgnoredPath("__MACOSX/x"), true);
  assert.equal(isIgnoredPath("a/.DS_Store"), true);
});

test("inspectZip accepts a valid pack and reports a summary", () => {
  const zip = makeZip({ "index.html": "<p>hi</p>", "scene.json": "{}", "日本語.txt": "ok" });
  const r = inspectZip(zip, { entry: "index.html" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.summary.files, 3);
  assert.equal(r.summary.entry, "index.html");
});

test("inspectZip rejects non-zip, empty, missing entry, size, hostile archives", () => {
  assert.equal(inspectZip(new TextEncoder().encode("hello world, not a zip file at all"), {}).errors[0].code, "not-zip");
  assert.equal(inspectZip(new Uint8Array(10), {}).errors[0].code, "not-zip");
  assert.equal(inspectZip(makeZip({ "a.html": "x" }), { entry: "index.html" }).errors[0].code, "entry-missing");
  assert.equal(inspectZip(makeZip({ "index.html": "x" }, { flags: 1 }), {}).errors[0].code, "encrypted");
  assert.equal(inspectZip(makeZip({ "index.html": "x" }, { method: 14 }), {}).errors[0].code, "method");
  assert.equal(inspectZip(makeZip({ "index.html": "x", "link": "index.html" }, { madeBy: 0x0314, externalAttrs: (0xa1ff << 16) >>> 0 }), {}).errors[0].code, "symlink");
  assert.equal(inspectZip(makeZip({ "x": "x" }, { nameBytes: new Uint8Array([0x83, 0x65, 0x83, 0x58]) }), {}).errors[0].code, "name-encoding");
  assert.ok(inspectZip(makeZip({ "../evil.html": "x", "index.html": "y" }), {}).errors.some((e) => e.code === "unsafe-path"));
  const big = inspectZip(new Uint8Array(PACK_LIMITS.zipBytes + 1), {});
  assert.equal(big.errors[0].code, "zip-too-large");
});

test("readZipEntries survives truncated / corrupted tails", () => {
  const zip = makeZip({ "index.html": "x" });
  assert.equal(readZipEntries(zip.slice(0, zip.length - 5)).ok, false);
  const corrupt = zip.slice(); corrupt[corrupt.length - 8] = 0xff; // break central directory size
  assert.equal(readZipEntries(corrupt).ok, false);
});

test("sha256Hex matches a known digest", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("catalog entry: book entries are unchanged, webapp entries expose only pack fields", () => {
  const book = { id: "b", title: "T", format: "epub", contentKey: "works/b.epub", coverKey: "", published: true, updatedAt: "2026-01-01" };
  assert.deepEqual(Object.keys(toPublicManifestEntry(book)).sort(),
    ["author", "cover", "description", "format", "id", "path", "published", "publicExpiresAt", "title", "updatedAt"].sort());
  const web = toPublicManifestEntry({ ...book, id: "w", format: "zip", contentType: "webapp", version: 3, entry: "index.html", size: 1234, sha256: "ab", contentKey: "works/w.zip" });
  assert.equal(web.contentType, "webapp");
  assert.equal(web.version, 3);
  assert.equal(web.entry, "index.html");
  assert.equal(web.size, 1234);
  assert.equal(web.sha256, "ab");
  assert.equal(web.path, "/api/books/w/content");
  assert.equal(contentTypeForExt("zip"), "application/zip");
});

test("the bundled sample pack is valid, reproducible and matches its manifest entry", async () => {
  const fs = await import("node:fs");
  const buf = fs.readFileSync(new URL("../books/works/webapp-sample.zip", import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(new URL("../books/manifest.json", import.meta.url), "utf8"));
  const entry = manifest.find((e) => e.id === "webapp-sample");
  assert.ok(entry && isWebappEntry(entry));
  const r = inspectZip(buf, { entry: entry.entry });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(entry.size, buf.length);
  assert.equal(entry.sha256, await sha256Hex(buf));
  assert.equal(entry.format, "zip");
  assert.ok(buf.length < PACK_LIMITS.zipBytes / 100, "the demo pack should stay tiny");
});
