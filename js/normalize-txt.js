import { escapeHtml, safeText } from "./utils.js";
import { normalizeAozoraInlineHtml } from "./normalize-aozora.js";

export function normalizeTxtToBook(text, filename = "", options = {}) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const autoDetectStructure = options.autoDetectStructure !== false;
  const chapters = [];
  let current = null;
  let chapterIndex = 0;
  let pendingBlankLines = 0;
  const normalizeLineHtml = (line) => normalizeAozoraInlineHtml(line);

  const startChapter = (title) => {
    pendingBlankLines = 0;
    chapterIndex += 1;
    current = {
      title: safeText(title, `章${chapterIndex}`),
      blocks: []
    };
    chapters.push(current);
  };

  for (const line of lines) {
    const heading = autoDetectStructure ? detectChapterHeading(line) : null;
    if (line.startsWith("# ") || heading) {
      const title = line.startsWith("# ") ? line.slice(2) : heading;
      startChapter(title);
      continue;
    }

    if (!current) {
      startChapter("本文");
    }

    if (line.trim() === "") {
      if (current.blocks.length > 0) {
        pendingBlankLines += 1;
      }
      continue;
    }

    if (pendingBlankLines > 0 && current.blocks.length > 0) {
      current.blocks.push({ type: "gap", count: pendingBlankLines });
      pendingBlankLines = 0;
    }

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

  return {
    title: safeText(filename.replace(/\.[^.]+$/, ""), "Untitled"),
    html,
    toc,
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
    /^(序章|終章|最終章|プロローグ|エピローグ|あとがき|まえがき|前書き|後書き)$/,
    /^(chapter|chap\.?|section|part)\s+[0-9ivxlcdm]+[\s:：.\-]*(.*)$/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(raw)) return raw;
  }

  return null;
}
