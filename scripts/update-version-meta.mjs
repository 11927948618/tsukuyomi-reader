import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = path.join(rootDir, "js", "version.js");
const serviceWorkerPath = path.join(rootDir, "sw.js");
const args = process.argv.slice(2);
const shouldBump = args.includes("--bump");
const refIndex = args.indexOf("--ref");
const requestedRef = refIndex >= 0 ? args[refIndex + 1] : "";
const now = getTokyoTimestamp();
const compactNow = now.replace(/[-: ]/g, "").replace("JST", "").slice(0, 12);
const releaseRef = sanitizeRef(requestedRef || `backup-${compactNow}`);

const versionSource = fs.readFileSync(versionPath, "utf8");
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, "utf8");
const newline = versionSource.includes("\r\n") ? "\r\n" : "\n";
const versionMatch = versionSource.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);

if (!versionMatch) throw new Error("APP_VERSION was not found in js/version.js");

const currentVersion = `${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;
const nextVersion = shouldBump
  ? `${versionMatch[1]}.${versionMatch[2]}.${Number(versionMatch[3]) + 1}`
  : currentVersion;
const nextVersionSource = [
  `export const APP_VERSION = "${nextVersion}";`,
  `export const BUILD_TIME = "${now}";`,
  `export const COMMIT = "${releaseRef}";`,
  ""
].join(newline);
const nextServiceWorkerSource = serviceWorkerSource.replace(
  /const CACHE_NAME = "tsukuyomi-reader-v[^"]+";/,
  `const CACHE_NAME = "tsukuyomi-reader-v${nextVersion}";`
);

if (nextServiceWorkerSource === serviceWorkerSource && !serviceWorkerSource.includes(`v${nextVersion}"`)) {
  throw new Error("CACHE_NAME was not found in sw.js");
}

fs.writeFileSync(versionPath, nextVersionSource, "utf8");
fs.writeFileSync(serviceWorkerPath, nextServiceWorkerSource, "utf8");
console.log(`version=${nextVersion} build=${now} ref=${releaseRef}`);

function sanitizeRef(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "manual-update";
}

function getTokyoTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute} JST`;
}
