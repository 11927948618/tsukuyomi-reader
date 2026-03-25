import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bookRoot = path.join(projectRoot, "book");
const manifestPath = path.join(bookRoot, "manifest.json");

const SUPPORTED_EXTENSIONS = new Map([
  [".txt", "txt"],
  [".epub", "epub"],
  [".html", "html"],
  [".htm", "html"],
  [".zip", "zip"]
]);

async function main() {
  await ensureBookRoot();

  const existingManifest = await loadExistingManifest();
  const existingByPath = new Map(
    (Array.isArray(existingManifest.books) ? existingManifest.books : [])
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [normalizeManifestPath(entry.path || entry.filename || ""), entry])
      .filter(([relativePath]) => relativePath)
  );

  const { files, skipped } = await collectBundledBookFiles(bookRoot);
  const books = files.map((relativePath) => {
    const existing = existingByPath.get(relativePath) || {};
    const filename = path.posix.basename(relativePath);
    const kind = detectKind(relativePath);
    const generatedTitle = toDisplayTitle(filename);

    return {
      filename,
      ...(relativePath !== filename ? { path: relativePath } : {}),
      title: safeText(existing.title, generatedTitle),
      kind: safeText(existing.kind, kind),
      description: safeText(existing.description, defaultDescription(kind))
    };
  });

  const manifest = {
    formatVersion: 1,
    mode: "bundled-books",
    books
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Updated: ${toProjectRelative(manifestPath)}`);
  console.log(`Books: ${books.length}`);
  for (const book of books) {
    console.log(`- ${book.path || book.filename} [${book.kind}]`);
  }

  if (skipped.length > 0) {
    console.log("");
    console.log("Skipped unsupported files:");
    for (const relativePath of skipped) {
      console.log(`- ${relativePath}`);
    }
  }
}

async function ensureBookRoot() {
  try {
    const stat = await fs.stat(bookRoot);
    if (!stat.isDirectory()) {
      throw new Error("book is not a directory");
    }
  } catch (err) {
    throw new Error(`book folder not found: ${bookRoot}`);
  }
}

async function loadExistingManifest() {
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return { formatVersion: 1, mode: "bundled-books", books: [] };
  }
}

async function collectBundledBookFiles(rootDir) {
  const files = [];
  const skipped = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "ja"));

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      const relativePath = normalizeManifestPath(path.relative(rootDir, absolutePath));
      if (!relativePath || relativePath === "manifest.json") continue;

      if (!isSupportedBookFile(relativePath)) {
        skipped.push(relativePath);
        continue;
      }

      files.push(relativePath);
    }
  }

  await walk(rootDir);
  return { files, skipped };
}

function isSupportedBookFile(relativePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function detectKind(relativePath) {
  return SUPPORTED_EXTENSIONS.get(path.extname(relativePath).toLowerCase()) || "txt";
}

function toDisplayTitle(filename) {
  return filename
    .replace(/\.md\.epub$/i, "")
    .replace(/\.(txt|epub|html|htm|zip)$/i, "")
    .trim();
}

function defaultDescription(kind) {
  if (kind === "epub") return "同梱EPUB";
  if (kind === "html") return "同梱HTML";
  if (kind === "zip") return "同梱ZIP";
  return "同梱TXT";
}

function normalizeManifestPath(input) {
  return String(input || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
}

function safeText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function toProjectRelative(absolutePath) {
  return normalizeManifestPath(path.relative(projectRoot, absolutePath));
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exitCode = 1;
});
