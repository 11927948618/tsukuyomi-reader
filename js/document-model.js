export const DOCUMENT_MODEL_VERSION = 1;

export function createTextSourceRevision(text, format = "text") {
  const source = String(text || "");
  let hash = 0x811c9dc5;

  for (const char of source) {
    const codePoint = char.codePointAt(0) || 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const length = countCodePoints(source);
  return `${sanitizeRevisionPart(format)}-fnv1a32-${hash.toString(16).padStart(8, "0")}-${length}`;
}

export function buildTxtDocumentModel(sourceText, sourceChapters = []) {
  const normalizedSource = normalizeSourceText(sourceText);
  const chapters = sourceChapters.map((chapter, chapterIndex) => {
    const chapterId = chapter.chapterId || `chapter-${String(chapterIndex + 1).padStart(3, "0")}`;
    const blocks = (Array.isArray(chapter.modelBlocks) ? chapter.modelBlocks : []).map((block, blockIndex) => ({
      blockId: block.blockId || `${chapterId}-block-${String(blockIndex + 1).padStart(4, "0")}`,
      kind: normalizeBlockKind(block.kind),
      sourceStart: nonNegativeInteger(block.sourceStart),
      sourceEnd: nonNegativeInteger(block.sourceEnd),
      logicalLine: positiveInteger(block.logicalLine, blockIndex + 1),
      text: String(block.text || "")
    }));

    return {
      chapterId,
      title: String(chapter.title || ""),
      blocks
    };
  });

  return {
    version: DOCUMENT_MODEL_VERSION,
    format: "txt",
    sourceRevision: createTextSourceRevision(normalizedSource, "txt"),
    sourceLength: countCodePoints(normalizedSource),
    chapters
  };
}

export function buildStructuredDocumentModel(sourceRevisionSource, sourceChapters = [], format = "html") {
  const normalizedFormat = sanitizeRevisionPart(format);
  let sourceOffset = 0;
  const chapters = sourceChapters.map((chapter, chapterIndex) => {
    const chapterId = chapter.chapterId || `chapter-${String(chapterIndex + 1).padStart(3, "0")}`;
    const blocks = (Array.isArray(chapter.blocks) ? chapter.blocks : []).map((block, blockIndex) => {
      const text = String(block.text || "");
      const sourceStart = sourceOffset;
      const sourceEnd = sourceStart + countCodePoints(text);
      sourceOffset = sourceEnd + 1;
      return {
        blockId: block.blockId || `${chapterId}-block-${String(blockIndex + 1).padStart(4, "0")}`,
        kind: normalizeBlockKind(block.kind),
        sourceStart,
        sourceEnd,
        logicalLine: positiveInteger(block.logicalLine, blockIndex + 1),
        text
      };
    });
    return {
      chapterId,
      title: String(chapter.title || ""),
      blocks
    };
  });

  return {
    version: DOCUMENT_MODEL_VERSION,
    format: normalizedFormat,
    sourceRevision: createTextSourceRevision(sourceRevisionSource, normalizedFormat),
    sourceLength: Math.max(0, sourceOffset - 1),
    chapters
  };
}

export function buildHtmlDocumentModel(sourceHtml, sourceChapters = [], format = "html") {
  const chapterDescriptors = sourceChapters.map((chapter, chapterIndex) => {
    const chapterId = chapter.chapterId || chapter.id || `chapter-${String(chapterIndex + 1).padStart(3, "0")}`;
    const elements = collectHtmlBlockElements(chapter.section || chapter.root);
    const blocks = elements.map((element, blockIndex) => {
      const blockId = element.getAttribute?.("data-document-block-id")
        || `${chapterId}-block-${String(blockIndex + 1).padStart(4, "0")}`;
      element.setAttribute?.("data-document-block-id", blockId);
      return {
        blockId,
        kind: classifyHtmlBlock(element),
        text: extractHtmlBlockText(element),
        logicalLine: blockIndex + 1
      };
    });
    return {
      chapterId,
      title: String(chapter.title || ""),
      blocks
    };
  });
  return buildStructuredDocumentModel(sourceHtml, chapterDescriptors, format);
}

export function createReaderLocator(model, options = {}) {
  const located = findBlock(model, options.chapterId, options.blockId);
  if (!located) return null;

  return {
    sourceRevision: String(model.sourceRevision || ""),
    chapterId: located.chapter.chapterId,
    blockId: located.block.blockId,
    textOffset: clampInteger(options.textOffset, 0, countCodePoints(located.block.text)),
    affinity: options.affinity === "after" ? "after" : "before"
  };
}

export function compareReaderLocators(model, left, right) {
  const leftPosition = locatorPosition(model, left);
  const rightPosition = locatorPosition(model, right);
  if (!leftPosition || !rightPosition) return null;
  if (leftPosition.blockOrder !== rightPosition.blockOrder) {
    return leftPosition.blockOrder < rightPosition.blockOrder ? -1 : 1;
  }
  if (leftPosition.textOffset === rightPosition.textOffset) return 0;
  return leftPosition.textOffset < rightPosition.textOffset ? -1 : 1;
}

export function validateDocumentModel(model) {
  const errors = [];
  const sourceLength = nonNegativeInteger(model?.sourceLength);
  let previousStart = -1;
  let previousEnd = -1;
  const blockIds = new Set();

  if (Number(model?.version) !== DOCUMENT_MODEL_VERSION) {
    errors.push("unsupported model version");
  }
  if (!String(model?.sourceRevision || "")) {
    errors.push("sourceRevision is required");
  }

  for (const chapter of Array.isArray(model?.chapters) ? model.chapters : []) {
    if (!String(chapter?.chapterId || "")) errors.push("chapterId is required");
    for (const block of Array.isArray(chapter?.blocks) ? chapter.blocks : []) {
      const blockId = String(block?.blockId || "");
      const start = nonNegativeInteger(block?.sourceStart);
      const end = nonNegativeInteger(block?.sourceEnd);

      if (!blockId) errors.push("blockId is required");
      if (blockIds.has(blockId)) errors.push(`duplicate blockId: ${blockId}`);
      blockIds.add(blockId);
      if (end < start) errors.push(`source range is reversed: ${blockId}`);
      if (start < previousStart || end < previousEnd) errors.push(`source range is not monotonic: ${blockId}`);
      if (end > sourceLength) errors.push(`source range exceeds sourceLength: ${blockId}`);

      previousStart = start;
      previousEnd = end;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function countCodePoints(value) {
  return Array.from(String(value || "")).length;
}

function normalizeSourceText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function normalizeBlockKind(value) {
  const kind = String(value || "paragraph");
  if (kind === "heading" || kind === "blank" || kind === "forced-page-break" || kind === "image") return kind;
  return "paragraph";
}

function collectHtmlBlockElements(root) {
  if (!root?.querySelectorAll) return [];
  const selectors = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figure,hr,div.epub-blank-line";
  return Array.from(root.querySelectorAll(selectors)).filter((element) => {
    if (element.matches?.("div.epub-blank-line")) return true;
    return !element.parentElement?.closest?.("p,li,blockquote,pre,figure");
  });
}

function classifyHtmlBlock(element) {
  const tag = String(element?.tagName || "").toLowerCase();
  const className = String(element?.getAttribute?.("class") || "").toLowerCase();
  const style = String(element?.getAttribute?.("style") || "").toLowerCase();
  const epubType = String(element?.getAttribute?.("epub:type") || "").toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "figure" && element?.querySelector?.("img,svg")) return "image";
  if (className.includes("epub-blank-line") || (!extractHtmlBlockText(element) && tag !== "hr")) return "blank";
  if (tag === "hr" || /(^|\s)(pagebreak|page-break)(\s|$)/.test(epubType)
    || /(break-before\s*:\s*page|page-break-before\s*:\s*always)/.test(style)
    || /(^|[-_\s])(pagebreak|page-break)([-_\s]|$)/.test(className)) {
    return "forced-page-break";
  }
  return "paragraph";
}

function extractHtmlBlockText(element) {
  if (!element?.cloneNode) return String(element?.textContent || "").trim();
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.("rt,rp,script,style").forEach((node) => node.remove());
  const text = String(clone.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text;
  const alt = clone.querySelector?.("img[alt]")?.getAttribute?.("alt");
  return String(alt || "").trim();
}

function findBlock(model, chapterId, blockId) {
  const chapters = Array.isArray(model?.chapters) ? model.chapters : [];
  const requestedChapter = String(chapterId || "");
  const requestedBlock = String(blockId || "");

  for (const chapter of chapters) {
    if (requestedChapter && chapter.chapterId !== requestedChapter) continue;
    const blocks = Array.isArray(chapter.blocks) ? chapter.blocks : [];
    const block = requestedBlock
      ? blocks.find((candidate) => candidate.blockId === requestedBlock)
      : blocks[0];
    if (block) return { chapter, block };
  }
  return null;
}

function locatorPosition(model, locator) {
  if (!locator || String(locator.sourceRevision || "") !== String(model?.sourceRevision || "")) return null;
  let blockOrder = 0;
  for (const chapter of Array.isArray(model?.chapters) ? model.chapters : []) {
    for (const block of Array.isArray(chapter?.blocks) ? chapter.blocks : []) {
      if (chapter.chapterId === locator.chapterId && block.blockId === locator.blockId) {
        return {
          blockOrder,
          textOffset: clampInteger(locator.textOffset, 0, countCodePoints(block.text))
        };
      }
      blockOrder += 1;
    }
  }
  return null;
}

function sanitizeRevisionPart(value) {
  return String(value || "text").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "text";
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? number : fallback;
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));
}
