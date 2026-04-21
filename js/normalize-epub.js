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
  const blobUrlCache = new Map();

  if (opfInfo.spine.length === 0) {
    throw new Error("EPUBのspineが見つかりません");
  }

  const chapters = [];
  const chapterPathToId = new Map();
  const chapterWritingModeHints = [];

  for (let i = 0; i < opfInfo.spine.length; i += 1) {
    const item = opfInfo.spine[i];
    if (!item || !item.href) continue;

    const chapterPath = normalizePath(resolvePath(opfDir, item.href));
    const chapterText = await readTextFromZip(zip, chapterPath);
    const chapterDoc = parseHtml(chapterText);
    const chapterWritingMode = detectChapterWritingMode(chapterText, chapterDoc);
    if (chapterWritingMode) {
      chapterWritingModeHints.push(chapterWritingMode);
    }
    sanitizeChapter(chapterDoc);
    await rewriteChapterAssets(chapterDoc, chapterPath, zip, opfInfo.mediaTypeByPath, blobUrlCache);

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
    toc = buildTocFromHeadings(chapters);
  }
  if (toc.length === 0) {
    toc = chapters.map((chapter) => ({ title: chapter.title, chapterId: chapter.id }));
  }

  const titleFallback = filenameStem(file?.name || "") || "Untitled";
  const title = safeText(opfInfo.title, titleFallback);
  const html = chapters.map((chapter) => chapter.section.outerHTML).join("\n");
  const writingModePreference = resolveEpubWritingModePreference(
    chapterWritingModeHints,
    opfInfo.pageProgressionDirection
  );

  return {
    title,
    html,
    toc,
    settings: writingModePreference ? { writingModePreference } : null,
    meta: writingModePreference ? { writingModeHint: writingModePreference } : null
  };
}

export async function normalizeEpub(file) {
  return normalizeEpubToBook(file);
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
  const mediaTypeByPath = new Map();
  for (const item of manifestItems) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    const normalizedHref = normalizePath(resolvePath(opfDir, href));
    const entry = {
      href,
      mediaType: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || ""
    };
    manifest.set(id, entry);
    mediaTypeByPath.set(normalizedHref, entry.mediaType);
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
  const pageProgressionDirection = normalizePageProgressionDirection(
    spineNode ? spineNode.getAttribute("page-progression-direction") : ""
  );

  return { title, manifest, spine, navPath, ncxPath, mediaTypeByPath, pageProgressionDirection };
}

function detectChapterWritingMode(chapterText, chapterDoc) {
  const textHint = detectWritingModeFromText(chapterText);
  if (textHint) return textHint;

  const roots = [chapterDoc.documentElement, chapterDoc.body].filter(Boolean);
  for (const root of roots) {
    const attrHint = detectWritingModeFromElement(root);
    if (attrHint) return attrHint;
  }

  return null;
}

function detectWritingModeFromText(text) {
  const source = String(text || "");
  if (!source) return null;

  let vertical = 0;
  let horizontal = 0;
  const pattern = /(writing-mode|-\w+-writing-mode)\s*:\s*([^;"'}\s]+)/gi;
  let match;

  while ((match = pattern.exec(source))) {
    const hint = mapWritingModeValue(match[2]);
    if (hint === "vertical") vertical += 1;
    if (hint === "horizontal") horizontal += 1;
  }

  if (vertical === horizontal) return null;
  return vertical > horizontal ? "vertical" : "horizontal";
}

function detectWritingModeFromElement(el) {
  if (!el) return null;

  const styleAttr = el.getAttribute("style") || "";
  const fromStyle = detectWritingModeFromText(styleAttr);
  if (fromStyle) return fromStyle;

  const dir = String(el.getAttribute("dir") || "").toLowerCase();
  if (dir === "rtl") return "vertical";
  if (dir === "ltr") return "horizontal";
  return null;
}

function mapWritingModeValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes("vertical") ||
    normalized === "tb-rl" ||
    normalized === "tb-lr" ||
    normalized === "rl-tb"
  ) {
    return "vertical";
  }

  if (
    normalized.includes("horizontal") ||
    normalized === "lr-tb"
  ) {
    return "horizontal";
  }

  return null;
}

function normalizePageProgressionDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "rtl" || normalized === "ltr") return normalized;
  return "";
}

function resolveEpubWritingModePreference(chapterHints, pageProgressionDirection) {
  const verticalCount = chapterHints.filter((hint) => hint === "vertical").length;
  const horizontalCount = chapterHints.filter((hint) => hint === "horizontal").length;

  if (verticalCount > horizontalCount) return "vertical";
  if (horizontalCount > verticalCount) return "horizontal";

  if (pageProgressionDirection === "rtl") return "vertical";
  if (pageProgressionDirection === "ltr") return "horizontal";
  return null;
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

async function rewriteChapterAssets(doc, chapterPath, zip, mediaTypeByPath, blobUrlCache) {
  const body = doc.body || doc.documentElement;
  if (!body) return;

  const replaceAttr = async (el, attrName) => {
    const raw = (el.getAttribute(attrName) || "").trim();
    if (!raw) return;
    const rewritten = await toBlobUrl(raw, chapterPath, zip, mediaTypeByPath, blobUrlCache);
    if (rewritten) {
      el.setAttribute(attrName, rewritten);
    }
  };

  const replaceSrcset = async (el) => {
    const raw = (el.getAttribute("srcset") || "").trim();
    if (!raw) return;
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const out = [];
    for (const part of parts) {
      const [urlToken, descriptor = ""] = part.split(/\s+/, 2);
      const rewritten = await toBlobUrl(urlToken, chapterPath, zip, mediaTypeByPath, blobUrlCache);
      if (!rewritten) continue;
      out.push(descriptor ? `${rewritten} ${descriptor}` : rewritten);
    }
    if (out.length > 0) {
      el.setAttribute("srcset", out.join(", "));
    } else {
      el.removeAttribute("srcset");
    }
  };

  for (const img of Array.from(body.querySelectorAll("img[src]"))) {
    await replaceAttr(img, "src");
  }

  for (const source of Array.from(body.querySelectorAll("source[src]"))) {
    await replaceAttr(source, "src");
  }

  for (const source of Array.from(body.querySelectorAll("source[srcset]"))) {
    await replaceSrcset(source);
  }

  for (const image of Array.from(body.querySelectorAll("image[href], image[xlink\\:href]"))) {
    await replaceAttr(image, "href");
    await replaceAttr(image, "xlink:href");
  }
}

async function toBlobUrl(rawUrl, chapterPath, zip, mediaTypeByPath, blobUrlCache) {
  const raw = String(rawUrl || "").trim();
  if (!raw || raw.startsWith("#")) return null;
  if (raw.startsWith("data:")) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return null;

  const pathOnly = raw.split("#")[0].split("?")[0];
  if (!pathOnly) return null;
  const resolved = normalizePath(resolvePath(dirname(chapterPath), pathOnly));
  const found = findZipEntryPath(zip, resolved);
  if (!found) return null;

  if (blobUrlCache.has(resolved)) return blobUrlCache.get(resolved);

  const file = zip.file(found);
  if (!file) return null;
  const blob = await file.async("blob");
  const knownType = mediaTypeByPath?.get(resolved) || guessMimeType(resolved);
  const typedBlob = blob.type || !knownType ? blob : new Blob([blob], { type: knownType });
  const blobUrl = URL.createObjectURL(typedBlob);
  blobUrlCache.set(resolved, blobUrl);
  return blobUrl;
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

function buildTocFromHeadings(chapters) {
  const toc = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const chapter = chapters[i];
    const heading = chapter.section.querySelector("h1, h2");
    const title = safeText(heading?.textContent || chapter.title || "", `章${i + 1}`);
    toc.push({ title, chapterId: chapter.id });
  }
  return dedupeToc(toc);
}

function guessMimeType(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "avif") return "image/avif";
  if (ext === "bmp") return "image/bmp";
  return "";
}
