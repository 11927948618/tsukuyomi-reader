import { escapeHtml, safeText } from "./utils.js";
import { normalizeAozoraInlineHtml } from "./normalize-aozora.js";
import { buildTxtDocumentModel, countCodePoints } from "./document-model.js";

// Markdown 原稿の初期対応範囲: # / ## / ### 見出し、段落、空行、引用(>)、区切り線(---)。
// 表・脚注・HTML混在・リンクカードは対象外。内部的には TXT として扱う（meta.format = "txt"）。

const HEADING_RE = /^(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const HR_RE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^[ \t]{0,3}>[ \t]?(.*)$/;

export function normalizeMdToBook(text, filename = "", options = {}) {
  const normalizedText = String(text || "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const chapters = [];
  let current = null;
  let chapterIndex = 0;
  let pendingBlankLines = 0;

  const startChapter = (title, level, headingBlock = null) => {
    pendingBlankLines = 0;
    chapterIndex += 1;
    current = {
      title: safeText(title, `見出し${chapterIndex}`),
      level: Math.max(1, Math.min(3, Number(level) || 1)),
      blocks: [],
      modelBlocks: headingBlock ? [headingBlock] : []
    };
    chapters.push(current);
  };

  const flushGap = () => {
    if (pendingBlankLines > 0 && current && current.blocks.length > 0) {
      current.blocks.push({ type: "gap", count: pendingBlankLines });
    }
    pendingBlankLines = 0;
  };

  let sourceOffset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const sourceStart = sourceOffset;
    const sourceEnd = sourceStart + countCodePoints(line);
    sourceOffset = sourceEnd + (lineIndex < lines.length - 1 ? 1 : 0);
    const sourceBlock = { sourceStart, sourceEnd, logicalLine: lineIndex + 1, text: line };

    const heading = line.match(HEADING_RE);
    if (heading) {
      startChapter(heading[2], heading[1].length, { ...sourceBlock, kind: "heading" });
      continue;
    }

    if (!current) startChapter("本文", 1);

    if (line.trim() === "") {
      current.modelBlocks.push({ ...sourceBlock, kind: "blank" });
      if (current.blocks.length > 0) pendingBlankLines += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      flushGap();
      current.modelBlocks.push({ ...sourceBlock, kind: "paragraph" });
      current.blocks.push({ type: "rule" });
      continue;
    }

    const quote = line.match(QUOTE_RE);
    if (quote) {
      flushGap();
      current.modelBlocks.push({ ...sourceBlock, kind: "paragraph" });
      current.blocks.push({ type: "quote", html: normalizeMdLineHtml(quote[1]) });
      continue;
    }

    flushGap();
    current.modelBlocks.push({ ...sourceBlock, kind: "paragraph" });
    current.blocks.push({ type: "line", html: normalizeMdLineHtml(line) });
  }

  if (chapters.length === 0) startChapter("本文", 1);

  const toc = chapters.map((chapter, index) => ({
    chapterId: `chapter-${String(index + 1).padStart(3, "0")}`,
    title: chapter.title,
    level: chapter.level
  }));

  const html = chapters.map((chapter, index) => {
    const chapterId = `chapter-${String(index + 1).padStart(3, "0")}`;
    const tag = chapter.level === 3 ? "h3" : chapter.level === 2 ? "h2" : "h1";
    const body = chapter.blocks.map((block) => {
      if (block.type === "gap") {
        return `<div class="txt-gap" aria-hidden="true" style="--gap-lines:${Math.max(1, Number(block.count) || 1)}"></div>`;
      }
      if (block.type === "rule") {
        return `<div class="txt-line md-rule" aria-hidden="true">＊　　＊　　＊</div>`;
      }
      if (block.type === "quote") {
        return `<div class="txt-line md-quote">${block.html}</div>`;
      }
      return `<div class="txt-line">${block.html}</div>`;
    }).join("\n");
    return `\n<section class="chapter" data-chapter="${chapterId}" id="${chapterId}">\n  <${tag}>${escapeHtml(chapter.title)}</${tag}>\n  ${body || ""}\n</section>`;
  }).join("\n");

  const documentModel = buildTxtDocumentModel(normalizedText, chapters.map((chapter, index) => ({
    chapterId: `chapter-${String(index + 1).padStart(3, "0")}`,
    title: chapter.title,
    modelBlocks: chapter.modelBlocks
  })));

  return {
    title: safeText(filename.replace(/\.[^.]+$/, ""), "Untitled"),
    html,
    toc,
    documentModel,
    meta: {
      format: "txt",
      sourceFormat: "md",
      textStructureAutoDetected: false
    }
  };
}

// 行内: まず青空記法（HTMLエスケープ + ルビ等）、その上で誤検出の少ない
// **強調** と `コード` だけを追加で処理する。* 単独（傍点・箇条書き記号と衝突）は扱わない。
function normalizeMdLineHtml(line) {
  return normalizeAozoraInlineHtml(line)
    .replace(/\*\*(?!\s)([^*<>]+?)(?<!\s)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<![`\w])`([^`<>\n]+?)`(?![`\w])/g, "<code>$1</code>");
}
