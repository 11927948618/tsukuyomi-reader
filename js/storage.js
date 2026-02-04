import { readFileAsArrayBuffer, safeText } from "./utils.js";

const VERTICAL_CSS = `
.vertical-root {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  line-height: var(--line-height);
  letter-spacing: var(--letter-spacing);
}

.vertical-root h1,
.vertical-root h2,
.vertical-root h3 {
  margin: 0 0 1.5rem 0;
}

.vertical-root p {
  margin: 0 0 1.5rem 0;
}
`;

export async function importZipToBook(file) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZipが読み込まれていません。");
  }

  const buffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);

  const metaEntry = zip.file("meta.json");
  const htmlEntry = zip.file("book.html");

  if (!metaEntry || !htmlEntry) {
    throw new Error("meta.json または book.html が見つかりません。");
  }

  const metaText = await metaEntry.async("string");
  const meta = JSON.parse(metaText);

  if (meta.formatVersion !== 1) {
    throw new Error("対応していないフォーマットです。");
  }

  const html = await htmlEntry.async("string");
  const toc = Array.isArray(meta.toc) && meta.toc.length > 0 ? meta.toc : generateTocFromHtml(html);

  return {
    title: safeText(meta.title, "Untitled"),
    html,
    toc,
    meta,
    settings: meta.settings || null,
    progress: meta.progress || null
  };
}

export async function exportZipFromBook(book, options = {}) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZipが読み込まれていません。");
  }

  if (!book) {
    throw new Error("書き出す本がありません。");
  }

  const settings = options.settings || {
    fontSize: 100,
    lineHeight: 1.8,
    letterSpacing: 0,
    theme: "light"
  };

  const progress = options.progress || {
    chapterId: "chapter-001",
    scrollTop: 0
  };

  const meta = {
    formatVersion: 1,
    title: book.title || "Untitled",
    createdAt: new Date().toISOString(),
    progress: {
      chapterId: progress.chapterId || "chapter-001",
      scrollTop: Number.isFinite(progress.scrollTop) ? progress.scrollTop : 0
    },
    settings: {
      fontSize: Number(settings.fontSize) || 100,
      lineHeight: Number(settings.lineHeight) || 1.8,
      letterSpacing: Number(settings.letterSpacing) || 0,
      theme: settings.theme || "light"
    },
    toc: Array.isArray(book.toc) ? book.toc : []
  };

  const zip = new JSZip();
  zip.file("book.html", book.html || "");
  zip.file("style.css", VERTICAL_CSS.trim());
  zip.file("meta.json", JSON.stringify(meta, null, 2));
  zip.folder("assets");

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "book-reader-data.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateTocFromHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const chapters = Array.from(doc.querySelectorAll("section.chapter"));

  return chapters.map((chapter, index) => {
    const chapterId = chapter.getAttribute("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    const h1 = chapter.querySelector("h1");
    const title = h1 ? h1.textContent : `章${index + 1}`;
    return { chapterId, title: safeText(title, `章${index + 1}`) };
  });
}
