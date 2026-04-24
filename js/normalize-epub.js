import { safeText } from "./utils.js";

import { hasAozoraInlineMarkup, normalizeAozoraInlineHtml } from "./normalize-aozora.js";

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
  "link[rel~='stylesheet']"
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
    const aozoraLike = detectAozoraLikeChapter(chapterText, chapterDoc);
    const chapterWritingMode = detectChapterWritingMode(chapterText, chapterDoc);
    const chapterCss = await buildChapterCss(
      chapterDoc,
      chapterPath,
      `chapter-${String(chapters.length + 1).padStart(3, "0")}`,
      zip,
      opfInfo.mediaTypeByPath,
      blobUrlCache
    );
    if (chapterWritingMode) {
      chapterWritingModeHints.push(chapterWritingMode);
    }
    sanitizeChapter(chapterDoc);
    await rewriteChapterAssets(chapterDoc, chapterPath, zip, opfInfo.mediaTypeByPath, blobUrlCache);
    normalizeAozoraTextNodes(chapterDoc.body || chapterDoc.documentElement, chapterDoc);
    if (aozoraLike) {
      normalizeAozoraLikeChapter(chapterDoc);
    }

    const chapterId = `chapter-${String(chapters.length + 1).padStart(3, "0")}`;
    const fallbackTitle = filenameStem(item.href) || `章${chapters.length + 1}`;
    const chapterTitle = safeText(extractChapterTitle(chapterDoc), fallbackTitle);

    const section = document.createElement("section");
    section.className = "chapter epub-html";
    section.setAttribute("id", chapterId);
    section.setAttribute("data-chapter", chapterId);
    section.setAttribute("data-epub-scope", chapterId);

    const h1 = document.createElement("h1");
    h1.textContent = chapterTitle;
    copyPresentationAttributes(chapterDoc.documentElement, section);

    if (chapterCss) {
      const styleEl = document.createElement("style");
      styleEl.setAttribute("data-epub-style", chapterId);
      styleEl.textContent = chapterCss;
      section.appendChild(styleEl);
    }

    section.appendChild(h1);

    const body = chapterDoc.body || chapterDoc.documentElement;
    const contentRoot = document.createElement("div");
    contentRoot.className = "epub-body";
    copyPresentationAttributes(body, contentRoot);

    if (body) {
      while (body.firstChild) {
        contentRoot.appendChild(body.firstChild);
      }
    }
    section.appendChild(contentRoot);

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

function detectAozoraLikeChapter(chapterText, chapterDoc) {
  const source = String(chapterText || "");
  if (!source) return false;

  let score = 0;
  if (/青空文庫|【テキスト中に現れる記号について】|［＃|底本：|入力：|校正：/u.test(source)) {
    score += 3;
  }
  if ((source.match(/《/g) || []).length >= 3) {
    score += 2;
  }
  if ((source.match(/<br\s*\/?>/gi) || []).length >= 10) {
    score += 1;
  }

  const body = chapterDoc.body || chapterDoc.documentElement;
  const denseBreakParagraph = Array.from(body?.querySelectorAll("p") || []).some(
    (p) => Array.from(p.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR").length >= 2
  );
  if (denseBreakParagraph) {
    score += 1;
  }

  return score >= 3;
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

function normalizeAozoraTextNodes(root, doc) {
  if (!root || !doc) return;

  const nodes = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const tagName = parent?.tagName?.toLowerCase() || "";
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["ruby", "rt", "rp", "script", "style"].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return hasAozoraInlineMarkup(node.nodeValue, { includeEllipsis: true, includeDash: true })
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    const template = doc.createElement("template");
    template.innerHTML = normalizeAozoraInlineHtml(node.nodeValue || "", { wrapEllipsis: true, wrapDash: true });
    node.replaceWith(...Array.from(template.content.childNodes));
  }
}

function normalizeAozoraLikeChapter(doc) {
  const body = doc.body || doc.documentElement;
  if (!body) return;

  removeAozoraGuideParagraphs(body);
  stripAozoraEditorialNotes(body, doc);
  splitBrHeavyParagraphs(body, doc);
  markAozoraColophon(body);
}

function removeAozoraGuideParagraphs(root) {
  for (const p of Array.from(root.querySelectorAll("p"))) {
    const text = compactText(p.textContent);
    if (!text) continue;
    if (/【テキスト中に現れる記号について】/u.test(text)) {
      p.remove();
      continue;
    }
    if (/^《》：ルビ/u.test(text) || /^｜：ルビ/u.test(text) || /^［＃］：入力者注/u.test(text)) {
      p.remove();
      continue;
    }
    if (/^[\-\u2014\u2015]{20,}$/u.test(text)) {
      p.remove();
    }
  }
}

function stripAozoraEditorialNotes(root, doc) {
  const nodes = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      const tagName = parent?.tagName?.toLowerCase() || "";
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["ruby", "rt", "rp", "script", "style"].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return /［＃[^］]+］|〔[^〕]*(?:空白|原稿|なし)[^〕]*〕/u.test(node.nodeValue || "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    const nextValue = String(node.nodeValue || "")
      .replace(/［＃[^］]+］/gu, "")
      .replace(/〔[^〕]*(?:空白|原稿|なし)[^〕]*〕/gu, "");
    if (nextValue === node.nodeValue) continue;
    node.nodeValue = nextValue;
  }
}

function splitBrHeavyParagraphs(root, doc) {
  const paragraphs = Array.from(root.querySelectorAll("p"));

  for (const p of paragraphs) {
    const children = Array.from(p.childNodes);
    const breakCount = children.filter((node) => node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR").length;
    if (breakCount === 0) continue;

    const fragments = [];
    let current = [];
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE && child.nodeName === "BR") {
        fragments.push(current);
        current = [];
        continue;
      }
      current.push(child);
    }
    fragments.push(current);

    const replacement = doc.createDocumentFragment();
    for (const part of fragments) {
      const nextP = doc.createElement("p");
      for (const attr of Array.from(p.attributes || [])) {
        nextP.setAttribute(attr.name, attr.value);
      }
      for (const node of part) {
        nextP.appendChild(node);
      }

      if (!compactText(nextP.textContent) && !nextP.querySelector("img, svg, ruby, span")) {
        continue;
      }
      replacement.appendChild(nextP);
    }

    if (replacement.childNodes.length > 0) {
      p.replaceWith(replacement);
    } else {
      p.remove();
    }
  }
}

function markAozoraColophon(root) {
  let inColophon = false;
  for (const p of Array.from(root.querySelectorAll("p"))) {
    const text = compactText(p.textContent);
    if (!text) continue;
    if (/^(底本：|親本：|入力：|校正：|青空文庫作成ファイル：)/u.test(text)) {
      inColophon = true;
    }
    if (inColophon) {
      p.classList.add("epub-colophon");
    }
  }
}

function compactText(value) {
  return String(value || "").replace(/\s+/gu, "");
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

async function buildChapterCss(doc, chapterPath, chapterId, zip, mediaTypeByPath, blobUrlCache) {
  const scopeSelector = `[data-epub-scope="${cssEscape(chapterId)}"]`;
  const blocks = [];

  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    const rawCss = String(styleEl.textContent || "");
    if (!rawCss.trim()) continue;
    const rewritten = await rewriteCssText(rawCss, chapterPath, zip, mediaTypeByPath, blobUrlCache, new Set([normalizePath(chapterPath)]));
    const scoped = scopeCssText(rewritten, scopeSelector);
    if (scoped.trim()) blocks.push(scoped);
  }

  for (const linkEl of Array.from(doc.querySelectorAll("link[rel~='stylesheet'][href]"))) {
    const href = String(linkEl.getAttribute("href") || "").trim();
    if (!href) continue;
    const cssText = await loadCssAssetText(href, chapterPath, zip, mediaTypeByPath, blobUrlCache, new Set());
    const scoped = scopeCssText(cssText, scopeSelector);
    if (scoped.trim()) blocks.push(scoped);
  }

  return blocks.join("\n\n");
}

async function loadCssAssetText(rawHref, basePath, zip, mediaTypeByPath, blobUrlCache, visited) {
  const raw = String(rawHref || "").trim();
  if (!raw || raw.startsWith("#")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "";

  const pathOnly = raw.split("#")[0].split("?")[0];
  if (!pathOnly) return "";
  const resolved = normalizePath(resolvePath(dirname(basePath), pathOnly));
  if (!resolved || visited.has(resolved)) return "";
  visited.add(resolved);

  const found = findZipEntryPath(zip, resolved);
  if (!found) return "";

  const cssText = await zip.file(found).async("string");
  return rewriteCssText(cssText, resolved, zip, mediaTypeByPath, blobUrlCache, visited);
}

async function rewriteCssText(cssText, cssBasePath, zip, mediaTypeByPath, blobUrlCache, visited) {
  let output = String(cssText || "");
  output = await inlineCssImports(output, cssBasePath, zip, mediaTypeByPath, blobUrlCache, visited);
  output = await rewriteCssUrls(output, cssBasePath, zip, mediaTypeByPath, blobUrlCache);
  return output;
}

async function inlineCssImports(cssText, cssBasePath, zip, mediaTypeByPath, blobUrlCache, visited) {
  const source = String(cssText || "");
  const pattern = /@import\s+(?:url\(\s*)?["']?([^"'()]+)["']?\s*\)?[^;]*;/gi;
  let out = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    out += source.slice(lastIndex, match.index);
    const importHref = String(match[1] || "").trim();
    const importedCss = await loadCssAssetText(importHref, cssBasePath, zip, mediaTypeByPath, blobUrlCache, visited);
    out += importedCss ? `${importedCss}\n` : "";
    lastIndex = pattern.lastIndex;
  }

  out += source.slice(lastIndex);
  return out;
}

async function rewriteCssUrls(cssText, cssBasePath, zip, mediaTypeByPath, blobUrlCache) {
  const source = String(cssText || "");
  const pattern = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
  let out = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    out += source.slice(lastIndex, match.index);
    const quote = match[1] || "";
    const rawUrl = String(match[2] || "").trim();

    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("#")) {
      out += match[0];
    } else {
      const rewritten = await toBlobUrl(rawUrl, cssBasePath, zip, mediaTypeByPath, blobUrlCache);
      out += rewritten ? `url(${quote}${rewritten}${quote})` : match[0];
    }

    lastIndex = pattern.lastIndex;
  }

  out += source.slice(lastIndex);
  return out;
}

function scopeCssText(cssText, scopeSelector) {
  return transformCssRules(String(cssText || ""), scopeSelector);
}

function transformCssRules(cssText, scopeSelector) {
  let out = "";
  let cursor = 0;

  while (cursor < cssText.length) {
    const nextBrace = findNextTopLevelBrace(cssText, cursor);
    if (nextBrace < 0) {
      out += cssText.slice(cursor);
      break;
    }

    const rawSelector = cssText.slice(cursor, nextBrace);
    const closeBrace = findMatchingBrace(cssText, nextBrace);
    if (closeBrace < 0) {
      out += cssText.slice(cursor);
      break;
    }

    const selectorText = rawSelector.trim();
    const blockText = cssText.slice(nextBrace + 1, closeBrace);
    const leading = rawSelector.slice(0, rawSelector.indexOf(selectorText));

    if (!selectorText) {
      out += cssText.slice(cursor, closeBrace + 1);
      cursor = closeBrace + 1;
      continue;
    }

    if (selectorText.startsWith("@")) {
      if (/^@(media|supports|document|layer)\b/i.test(selectorText)) {
        out += `${leading}${selectorText}{${transformCssRules(blockText, scopeSelector)}}`;
      } else {
        out += `${leading}${selectorText}{${blockText}}`;
      }
    } else {
      out += `${leading}${scopeSelectorList(selectorText, scopeSelector)}{${blockText}}`;
    }

    cursor = closeBrace + 1;
  }

  return out;
}

function findNextTopLevelBrace(text, startIndex) {
  let depth = 0;
  let quote = "";
  let inComment = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (!quote && char === "/" && next === "*") {
      inComment = true;
      i += 1;
      continue;
    }

    if (quote) {
      if (char === "\\" && next) {
        i += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "[") {
      depth += 1;
      continue;
    }

    if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
      continue;
    }

    if (char === "{" && depth === 0) return i;
  }

  return -1;
}

function findMatchingBrace(text, openIndex) {
  let depth = 1;
  let quote = "";
  let inComment = false;

  for (let i = openIndex + 1; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }

    if (!quote && char === "/" && next === "*") {
      inComment = true;
      i += 1;
      continue;
    }

    if (quote) {
      if (char === "\\" && next) {
        i += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function scopeSelectorList(selectorText, scopeSelector) {
  return splitCssSelectors(selectorText)
    .map((selector) => {
      const trimmed = selector.trim();
      if (!trimmed) return "";
      const normalized = trimmed
        .replace(/\bhtml\b/gi, ".epub-html")
        .replace(/\bbody\b/gi, ".epub-body")
        .replace(/\:root\b/gi, ".epub-html");
      return `${scopeSelector} ${normalized}`;
    })
    .filter(Boolean)
    .join(", ");
}

function splitCssSelectors(selectorText) {
  const selectors = [];
  let depth = 0;
  let quote = "";
  let current = "";

  for (let i = 0; i < selectorText.length; i += 1) {
    const char = selectorText[i];
    const next = selectorText[i + 1];

    if (quote) {
      current += char;
      if (char === "\\" && next) {
        current += next;
        i += 1;
        continue;
      }
      if (char === quote) quote = "";
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(" || char === "[") {
      depth += 1;
      current += char;
      continue;
    }

    if ((char === ")" || char === "]") && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) selectors.push(current);
  return selectors;
}

function copyPresentationAttributes(fromEl, toEl) {
  if (!fromEl || !toEl) return;

  const classNames = String(fromEl.getAttribute("class") || "")
    .split(/\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (classNames.length > 0) {
    toEl.classList.add(...classNames);
  }

  for (const attrName of ["dir", "lang", "xml:lang"]) {
    const value = fromEl.getAttribute(attrName);
    if (value) toEl.setAttribute(attrName, value);
  }
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value || ""));
  }
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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
  if (ext === "woff") return "font/woff";
  if (ext === "woff2") return "font/woff2";
  if (ext === "ttf") return "font/ttf";
  if (ext === "otf") return "font/otf";
  if (ext === "eot") return "application/vnd.ms-fontobject";
  return "";
}
