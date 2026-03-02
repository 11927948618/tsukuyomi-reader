import { safeText } from "./utils.js";

const BLOCKED_SELECTORS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link[rel='stylesheet']"
].join(",");

export async function normalizeEpubToBook(file) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZipが見つかりません");
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const opfPath = await findOpfPath(zip);
  const opfText = await readTextFromZip(zip, opfPath);
  const opfDoc = parseXml(opfText, "OPF");
  const opfDir = dirname(opfPath);
  const opfInfo = parseOpf(opfDoc, opfDir);

  if (opfInfo.spine.length === 0) {
    throw new Error("EPUBのspineが見つかりません");
  }

  const chapters = [];
  const chapterPathToId = new Map();

  for (let i = 0; i < opfInfo.spine.length; i += 1) {
    const item = opfInfo.spine[i];
    if (!item || !item.href) continue;

    const chapterPath = normalizePath(resolvePath(opfDir, item.href));
    const chapterText = await readTextFromZip(zip, chapterPath);
    const chapterDoc = parseHtml(chapterText);
    sanitizeChapter(chapterDoc);

    const chapterId = `chapter-${String(chapters.length + 1).padStart(3, "0")}`;
    const fallbackTitle = filenameStem(item.href) || `章${chapters.length + 1}`;
    const chapterTitle = safeText(extractChapterTitle(chapterDoc), fallbackTitle);

    const section = document.createElement("section");
    section.className = "chapter";
    section.setAttribute("id", chapterId);
    section.setAttribute("data-chapter", chapterId);

    const h1 = document.createElement("h1");
    h1.textContent = chapterTitle;
    section.appendChild(h1);

    const body = chapterDoc.body || chapterDoc.documentElement;
    if (body) {
      while (body.firstChild) {
        section.appendChild(body.firstChild);
      }
    }

    chapters.push({
      id: chapterId,
      title: chapterTitle,
      path: chapterPath,
      section
    });
    chapterPathToId.set(chapterPath, chapterId);
  }

  if (chapters.length === 0) {
    throw new Error("本文章を抽出できませんでした");
  }

  for (const chapter of chapters) {
    rewriteChapterLinks(chapter.section, chapter.path, chapterPathToId);
  }

  let toc = await buildTocFromNav(zip, opfInfo.navPath, chapterPathToId);
  if (toc.length === 0) {
    toc = await buildTocFromNcx(zip, opfInfo.ncxPath, chapterPathToId);
  }
  if (toc.length === 0) {
    toc = chapters.map((chapter) => ({ title: chapter.title, chapterId: chapter.id }));
  }

  const titleFallback = filenameStem(file?.name || "") || "Untitled";
  const title = safeText(opfInfo.title, titleFallback);
  const html = chapters.map((chapter) => chapter.section.outerHTML).join("\n");

  return {
    title,
    html,
    toc,
    meta: null
  };
}

async function findOpfPath(zip) {
  const containerPath = findZipEntryPath(zip, "META-INF/container.xml");
  if (containerPath) {
    const containerText = await readTextFromZip(zip, containerPath);
    const containerDoc = parseXml(containerText, "container.xml");
    const rootfiles = getElementsByLocalName(containerDoc, "rootfile");
    for (const rootfile of rootfiles) {
      const fullPath = rootfile.getAttribute("full-path");
      if (fullPath) return normalizePath(fullPath);
    }
  }

  const opfCandidate = Object.keys(zip.files).find((path) => path.toLowerCase().endsWith(".opf"));
  if (opfCandidate) return normalizePath(opfCandidate);

  throw new Error("EPUB内にOPFが見つかりません");
}

function parseOpf(opfDoc, opfDir) {
  const manifestItems = getElementsByLocalName(opfDoc, "item");
  const spineItems = getElementsByLocalName(opfDoc, "itemref");
  const metadataTitles = getElementsByLocalName(opfDoc, "title");
  const spineNode = getFirstElementByLocalName(opfDoc, "spine");

  const manifest = new Map();
  for (const item of manifestItems) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || ""
    });
  }

  const spine = [];
  for (const itemref of spineItems) {
    const idref = itemref.getAttribute("idref");
    if (!idref) continue;
    const manifestItem = manifest.get(idref);
    if (!manifestItem) continue;
    const media = (manifestItem.mediaType || "").toLowerCase();
    if (media.includes("xhtml") || media.includes("html") || media === "") {
      spine.push(manifestItem);
    }
  }

  const navItem = Array.from(manifest.values()).find((item) =>
    (item.properties || "")
      .split(/\s+/)
      .map((v) => v.trim())
      .includes("nav")
  );
  const navPath = navItem ? normalizePath(resolvePath(opfDir, navItem.href)) : null;

  const spineTocId = spineNode ? spineNode.getAttribute("toc") : "";
  const ncxItem =
    (spineTocId && manifest.get(spineTocId)) ||
    Array.from(manifest.values()).find((item) =>
      (item.mediaType || "").toLowerCase().includes("x-dtbncx+xml")
    );
  const ncxPath = ncxItem ? normalizePath(resolvePath(opfDir, ncxItem.href)) : null;

  const titleNode = metadataTitles[0] || null;
  const title = titleNode ? titleNode.textContent || "" : "";

  return { title, manifest, spine, navPath, ncxPath };
}

async function buildTocFromNav(zip, navPath, chapterPathToId) {
  if (!navPath) return [];

  try {
    const navText = await readTextFromZip(zip, navPath);
    const navDoc = parseHtml(navText);
    const nav =
      navDoc.querySelector("nav[epub\\:type='toc']") ||
      navDoc.querySelector("nav[role='doc-toc']") ||
      navDoc.querySelector("nav");
    if (!nav) return [];

    const toc = [];
    for (const a of Array.from(nav.querySelectorAll("a[href]"))) {
      const mapped = mapHrefToChapter(a.getAttribute("href"), navPath, chapterPathToId);
      if (!mapped) continue;
      const title = safeText(a.textContent || "", "");
      if (!title) continue;
      toc.push({ title, chapterId: mapped });
    }
    return dedupeToc(toc);
  } catch (err) {
    return [];
  }
}

async function buildTocFromNcx(zip, ncxPath, chapterPathToId) {
  if (!ncxPath) return [];

  try {
    const ncxText = await readTextFromZip(zip, ncxPath);
    const ncxDoc = parseXml(ncxText, "NCX");
    const navPoints = getElementsByLocalName(ncxDoc, "navPoint");
    const toc = [];

    for (const navPoint of navPoints) {
      const content = getFirstElementByLocalName(navPoint, "content");
      const labelText = getFirstElementByLocalName(navPoint, "text");
      if (!content) continue;

      const src = content.getAttribute("src");
      const mapped = mapHrefToChapter(src, ncxPath, chapterPathToId);
      if (!mapped) continue;

      const title = safeText(labelText?.textContent || "", "");
      if (!title) continue;
      toc.push({ title, chapterId: mapped });
    }

    return dedupeToc(toc);
  } catch (err) {
    return [];
  }
}

function rewriteChapterLinks(section, currentPath, chapterPathToId) {
  const anchors = Array.from(section.querySelectorAll("a[href]"));
  for (const a of anchors) {
    const rawHref = (a.getAttribute("href") || "").trim();
    if (!rawHref) {
      a.removeAttribute("href");
      continue;
    }

    if (rawHref.startsWith("#")) {
      a.setAttribute("href", rawHref);
      continue;
    }

    const chapterId = mapHrefToChapter(rawHref, currentPath, chapterPathToId);
    if (chapterId) {
      a.setAttribute("href", `#${chapterId}`);
    } else {
      a.removeAttribute("href");
    }

    a.removeAttribute("target");
    a.removeAttribute("download");
    a.setAttribute("rel", "nofollow");
  }
}

function mapHrefToChapter(href, basePath, chapterPathToId) {
  const raw = String(href || "").trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return null;

  const withoutFragment = raw.split("#")[0];
  if (!withoutFragment) return chapterPathToId.get(normalizePath(basePath)) || null;

  const resolved = normalizePath(resolvePath(dirname(basePath), withoutFragment));
  return chapterPathToId.get(resolved) || null;
}

function sanitizeChapter(doc) {
  doc.querySelectorAll(BLOCKED_SELECTORS).forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes || [])) {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

function extractChapterTitle(doc) {
  const heading = doc.querySelector("h1, h2, h3, title");
  return heading ? heading.textContent || "" : "";
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(`${label}の解析に失敗しました`);
  }
  return doc;
}

function parseHtml(text) {
  return new DOMParser().parseFromString(text, "text/html");
}

async function readTextFromZip(zip, path) {
  const found = findZipEntryPath(zip, path);
  if (!found) throw new Error(`EPUB内ファイルが見つかりません: ${path}`);
  return zip.file(found).async("string");
}

function findZipEntryPath(zip, targetPath) {
  const normalizedTarget = normalizePath(targetPath).toLowerCase();
  for (const path of Object.keys(zip.files)) {
    if (normalizePath(path).toLowerCase() === normalizedTarget) return path;
  }
  return null;
}

function normalizePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/^\//, "");
}

function dirname(path) {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return "";
  return normalized.slice(0, idx);
}

function resolvePath(base, relative) {
  const rel = String(relative || "").trim();
  if (!rel) return normalizePath(base);
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || rel.startsWith("//")) return rel;

  const baseParts = normalizePath(base).split("/").filter(Boolean);
  const relParts = normalizePath(rel).split("/").filter(Boolean);
  const merged = rel.startsWith("/") ? [] : [...baseParts];

  for (const part of relParts) {
    if (part === ".") continue;
    if (part === "..") {
      merged.pop();
      continue;
    }
    merged.push(part);
  }
  return merged.join("/");
}

function filenameStem(path) {
  const raw = normalizePath(path).split("/").pop() || "";
  return raw.replace(/\.[^.]+$/, "");
}

function getElementsByLocalName(doc, name) {
  return Array.from(doc.getElementsByTagNameNS("*", name));
}

function getFirstElementByLocalName(doc, name) {
  const items = getElementsByLocalName(doc, name);
  return items[0] || null;
}

function dedupeToc(toc) {
  const seen = new Set();
  const out = [];
  for (const item of toc) {
    const key = `${item.chapterId}::${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
