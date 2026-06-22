import { escapeHtml, safeText } from "./utils.js";
import { normalizeAozoraInlineHtml } from "./normalize-aozora.js";
import { buildTxtDocumentModel, countCodePoints } from "./document-model.js";

export function normalizeTxtToBook(text, filename = "", options = {}) {
  const normalizedText = String(text || "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const autoDetectStructure = options.autoDetectStructure !== false;
  const chapters = [];
  let current = null;
  let chapterIndex = 0;
  let pendingBlankLines = 0;
  const normalizeLineHtml = (line) => normalizeAozoraInlineHtml(line);

  const startChapter = (title, headingBlock = null) => {
    pendingBlankLines = 0;
    chapterIndex += 1;
    current = {
      title: safeText(title, `章${chapterIndex}`),
      blocks: [],
      modelBlocks: headingBlock ? [headingBlock] : []
    };
    chapters.push(current);
  };

  let sourceOffset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const sourceStart = sourceOffset;
    const sourceEnd = sourceStart + countCodePoints(line);
    sourceOffset = sourceEnd + (lineIndex < lines.length - 1 ? 1 : 0);
    const sourceBlock = {
      sourceStart,
      sourceEnd,
      logicalLine: lineIndex + 1,
      text: line
    };
    const heading = autoDetectStructure ? detectChapterHeading(line) : null;
    if (line.startsWith("# ") || heading) {
      const title = line.startsWith("# ") ? line.slice(2) : heading;
      startChapter(title, { ...sourceBlock, kind: "heading" });
      continue;
    }

    if (!current) {
      startChapter("本文");
    }

    if (line.trim() === "") {
      current.modelBlocks.push({ ...sourceBlock, kind: "blank" });
      if (current.blocks.length > 0) {
        pendingBlankLines += 1;
      }
      continue;
    }

    if (pendingBlankLines > 0 && current.blocks.length > 0) {
      current.blocks.push({ type: "gap", count: pendingBlankLines });
      pendingBlankLines = 0;
    }

    current.modelBlocks.push({ ...sourceBlock, kind: "paragraph" });
    current.blocks.push({ type: "line", html: normalizeLineHtml(line) });
  }

  if (chapters.length === 0) {
    startChapter("本文");
  }

  const toc = chapters.map((ch, idx) => {
    const chapterId = `chapter-${String(idx + 1).padStart(3, "0")}`;
    return { chapterId, title: ch.title };
  });

  const html = chapters.map((ch, idx) => {
    const chapterId = `chapter-${String(idx + 1).padStart(3, "0")}`;
    const body = ch.blocks.map((block) => {
      if (block.type === "gap") {
        return `<div class="txt-gap" aria-hidden="true" style="--gap-lines:${Math.max(1, Number(block.count) || 1)}"></div>`;
      }
      return `<div class="txt-line">${block.html}</div>`;
    }).join("\n");
    return `\n<section class=\"chapter\" data-chapter=\"${chapterId}\" id=\"${chapterId}\">\n  <h1>${escapeHtml(ch.title)}</h1>\n  ${body || ""}\n</section>`;
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
      textStructureAutoDetected: autoDetectStructure
    }
  };
}

function detectChapterHeading(line) {
  const raw = String(line || "").trim();
  if (!raw || raw.length > 42) return null;
  if (/^[\s\-_=*＊・]+$/.test(raw)) return null;

  const marker = "[\\s　]*[■□◆◇●○◎★☆▲△▼▽＊*#＃▶▷・･-]*[\\s　]*";
  const number = "[0-9０-９一二三四五六七八九十百千万〇零壱弐参IVXLCDMivxlcdmⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]+";
  const unit = "(?:章|話|節|部|編|幕|回|項|段)";
  const sep = "[\\s　:：、。．.・･\\-－–—]*";
  const patterns = [
    new RegExp(`^${marker}第[\\s　]*${number}[\\s　]*${unit}${sep}(.*)$`, "u"),
    new RegExp(`^${marker}${number}[\\s　]*${unit}${sep}(.*)$`, "u"),
    new RegExp(`^${marker}${number}[\\s　]*[、。，，．.,][\\s　]*(.*)$`, "u"),
    new RegExp(`^${marker}${number}[\\s　]+(.{1,36})$`, "u"),
    new RegExp(`^${marker}(?:序章|終章|最終章|プロローグ|幕間|エピローグ|あとがき|まえがき|前書き|後書き)(?:${sep}.{1,36})?$`, "u"),
    /^(chapter|chap\.?|section|part)\s+[0-9ivxlcdm]+[\s:：.\-]*(.*)$/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(raw)) return raw;
  }

  return null;
}
