import { escapeHtml, safeText } from "./utils.js";

export function normalizeTxtToBook(text, filename = "") {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const chapters = [];
  let current = null;
  let chapterIndex = 0;
  let pendingBlankLines = 0;
  const normalizeLineHtml = (line) => {
    const escaped = escapeHtml(line);
    return escaped.replace(/｜(.+?)《(.+?)》/g, "<ruby>$1<rt>$2</rt></ruby>");
  };

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
    if (line.startsWith("# ")) {
      const title = line.slice(2);
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
    meta: null
  };
}
