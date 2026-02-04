import { escapeHtml, safeText } from "./utils.js";

export function normalizeTxtToBook(text, filename = "") {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const chapters = [];
  let current = null;
  let paragraphLines = [];
  let chapterIndex = 0;

  const flushParagraph = () => {
    if (!current) return;
    if (paragraphLines.length === 0) return;
    const raw = paragraphLines.join("\n");
    const escaped = escapeHtml(raw);
    const rubyApplied = escaped.replace(/｜(.+?)《(.+?)》/g, "<ruby>$1<rt>$2</rt></ruby>");
    const withBreaks = rubyApplied.replace(/\n/g, "<br>");
    current.paragraphs.push(withBreaks);
    paragraphLines = [];
  };

  const startChapter = (title) => {
    flushParagraph();
    chapterIndex += 1;
    current = {
      title: safeText(title, `章${chapterIndex}`),
      paragraphs: []
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
      flushParagraph();
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  if (chapters.length === 0) {
    startChapter("本文");
  }

  const toc = chapters.map((ch, idx) => {
    const chapterId = `chapter-${String(idx + 1).padStart(3, "0")}`;
    return { chapterId, title: ch.title };
  });

  const html = chapters.map((ch, idx) => {
    const chapterId = `chapter-${String(idx + 1).padStart(3, "0")}`;
    const body = ch.paragraphs.map((p) => `<p>${p}</p>`).join("\n");
    return `\n<section class=\"chapter\" data-chapter=\"${chapterId}\" id=\"${chapterId}\">\n  <h1>${escapeHtml(ch.title)}</h1>\n  ${body || ""}\n</section>`;
  }).join("\n");

  return {
    title: safeText(filename.replace(/\.[^.]+$/, ""), "Untitled"),
    html,
    toc,
    meta: null
  };
}
