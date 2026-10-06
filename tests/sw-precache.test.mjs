// Guards the biggest regression risk of adding files: sw.js pre-caches STATIC_ASSETS with cache.addAll-like
// semantics, so ONE missing/404 entry aborts the whole Service Worker install (nobody gets updates), and a file the
// app needs but that is not listed breaks the first offline start (the legacy-check.js bug).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function staticAssets() {
  const match = read("sw.js").match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, "STATIC_ASSETS not found in sw.js");
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (m) => m[1]);
}
const toRel = (asset) => (asset === "./" ? "index.html" : asset.replace(/^\.\//, ""));

test("every STATIC_ASSETS entry exists in the repository", () => {
  const missing = staticAssets().filter((asset) => !fs.existsSync(path.join(root, toRel(asset))));
  assert.deepEqual(missing, []);
});

test("no duplicate STATIC_ASSETS entries", () => {
  const list = staticAssets();
  assert.deepEqual(list.filter((a, i) => list.indexOf(a) !== i), []);
});

test("everything index.html and the module graph need at start-up is pre-cached", () => {
  const assets = new Set(staticAssets().map(toRel));
  const needed = new Set(["index.html"]);

  const html = read("index.html");
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)) needed.add(m[1]);

  // Walk static + dynamic relative imports starting from every script the page loads.
  const queue = Array.from(needed).filter((f) => f.endsWith(".js"));
  const seen = new Set();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    needed.add(file);
    const dir = path.posix.dirname(file);
    for (const m of read(file).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.posix.normalize(path.posix.join(dir, m[1]));
      if (fs.existsSync(path.join(root, target))) queue.push(target);
    }
  }
  // the app also loads templates at run time
  for (const t of ["auth", "library", "reader", "help"]) needed.add(`templates/${t}.html`);

  const notCached = Array.from(needed).filter((f) => !assets.has(f));
  assert.deepEqual(notCached, [], "files needed at start-up but missing from STATIC_ASSETS");
});

test("webapp ZIPs are never pre-cached or runtime-cached by the Service Worker", () => {
  const sw = read("sw.js");
  assert.ok(!staticAssets().some((a) => a.toLowerCase().endsWith(".zip")));
  assert.match(sw, /endsWith\("\.zip"\)\) return;/);
  assert.match(sw, /contentType.*webapp.*\[entry\?\.cover\]/s);
});
