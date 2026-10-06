// Builds books/works/webapp-sample.zip from scripts/webapp-sample/ (a synthetic demo pack: no real content)
// and registers/updates its entry in books/manifest.json (size + sha256 are computed here, like the server does).
//
//   node scripts/build-webapp-sample.mjs            # build the zip only
//   node scripts/build-webapp-sample.mjs --manifest # also update books/manifest.json
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "scripts", "webapp-sample");
const outZip = path.join(root, "books", "works", "webapp-sample.zip");
const manifestPath = path.join(root, "books", "manifest.json");

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}
function walk(dir, base = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = base ? `${base}/${d.name}` : d.name;
    return d.isDirectory() ? walk(path.join(dir, d.name), rel) : [rel];
  }).sort();
}

const files = walk(srcDir);
const chunks = [];
const central = [];
let offset = 0;
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
const DOS_TIME = 0; const DOS_DATE = (46 << 9) | (1 << 5) | 1; // 2026-01-01, fixed => reproducible zip
for (const rel of files) {
  const data = fs.readFileSync(path.join(srcDir, rel));
  const name = Buffer.from(rel, "utf8");
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);
  const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), name, body]);
  central.push(Buffer.concat([u32(0x02014b50), u16(0x031e), u16(20), u16(0x0800), u16(method), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
  chunks.push(local);
  offset += local.length;
}
const cdStart = offset;
const cd = Buffer.concat(central);
const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(cdStart), u16(0)]);
const zip = Buffer.concat([...chunks, cd, eocd]);
fs.mkdirSync(path.dirname(outZip), { recursive: true });
fs.writeFileSync(outZip, zip);
const sha256 = crypto.createHash("sha256").update(zip).digest("hex");
console.log(`wrote ${path.relative(root, outZip)}  ${zip.length} bytes  ${files.length} files  sha256=${sha256}`);

if (process.argv.includes("--manifest")) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const entry = {
    id: "webapp-sample",
    title: "Webコンテンツ見本（時計とクイズ）",
    author: "hal the juggernaut",
    description: "オフラインで動く小さなWebアプリの見本（合成データ）。ダウンロード後は通信なしで開けます。",
    format: "zip",
    contentType: "webapp",
    version: 1,
    entry: "index.html",
    size: zip.length,
    sha256,
    path: "./books/works/webapp-sample.zip",
    cover: "",
    published: true,
    updatedAt: "2026-10-06"
  };
  const list = Array.isArray(manifest) ? manifest : manifest.books;
  const at = list.findIndex((e) => e.id === entry.id);
  if (at >= 0) {
    // keep the author-controlled version when the content did not change
    if (list[at].sha256 === sha256) entry.version = list[at].version;
    else entry.version = (Number(list[at].version) || 0) + 1;
    list[at] = entry;
  } else {
    list.push(entry);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`updated ${path.relative(root, manifestPath)} (version ${entry.version})`);
}
