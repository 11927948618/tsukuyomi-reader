import { readFileAsArrayBuffer, safeText, textWithoutRuby } from "./utils.js";

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
    bookmark: meta.bookmark || meta.progress || null,
    progress: meta.progress || meta.bookmark || null
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
    fontFamilyPreference: "system",
    lineHeight: 1.8,
    letterSpacing: 0,
    theme: "light"
  };

  const bookmark = options.bookmark || options.progress || {
    chapterId: "chapter-001",
    scrollTop: 0
  };

  const bookmarkPayload = {
    chapterId: bookmark.chapterId || "chapter-001",
    scrollLeft: Number.isFinite(bookmark.scrollLeft) ? bookmark.scrollLeft : 0,
    scrollTop: Number.isFinite(bookmark.scrollTop) ? bookmark.scrollTop : 0,
    pageIndex: Number.isFinite(bookmark.pageIndex) ? bookmark.pageIndex : 0,
    progressPercent: Number.isFinite(bookmark.progressPercent) ? bookmark.progressPercent : 0
  };
  const spreadView = settings.spreadView === true || settings.pageColumns === true;
  const stackedView = !spreadView && (settings.stackedView === true || settings.twoTierView === true);

  const meta = {
    formatVersion: 1,
    title: book.title || "Untitled",
    createdAt: new Date().toISOString(),
    bookmark: bookmarkPayload,
    progress: bookmarkPayload,
    settings: {
      fontSize: Number(settings.fontSize) || 100,
      fontFamilyPreference: settings.fontFamilyPreference || "system",
      lineHeight: Number(settings.lineHeight) || 1.8,
      letterSpacing: Number(settings.letterSpacing) || 0,
      pageMarginPercent: normalizeExportPageMargin(settings.pageMarginPercent, settings.wrapWidthPercent),
      wrapWidthPercent: pageMarginToWrapWidthPercent(settings.pageMarginPercent, settings.wrapWidthPercent),
      theme: settings.theme || "light",
      displayMode: settings.displayMode || "paged",
      tapInScroll: Boolean(settings.tapInScroll),
      wheelPaging: Boolean(settings.wheelPaging),
      writingModePreference: settings.writingModePreference || "vertical",
      spreadView,
      pageColumns: spreadView,
      stackedView,
      twoTierView: stackedView,
      lineNumbers: settings.lineNumbers === true,
      debugLayout: settings.debugLayout === true,
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

function normalizeExportPageMargin(value, legacyWrapWidth = null) {
  const raw = Number(value);
  if (Number.isFinite(raw)) return Math.max(0, Math.min(30, Math.round(raw)));
  const wrap = Number(legacyWrapWidth);
  if (!Number.isFinite(wrap)) return 3;
  return Math.max(0, Math.min(30, Math.round((100 - Math.min(100, wrap)) / 2)));
}

function pageMarginToWrapWidthPercent(value, legacyWrapWidth = null) {
  const margin = normalizeExportPageMargin(value, legacyWrapWidth);
  return Math.max(40, Math.min(100, 100 - margin * 2));
}

function generateTocFromHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");
  const chapters = Array.from(doc.querySelectorAll("section.chapter"));

  return chapters.map((chapter, index) => {
    const chapterId = chapter.getAttribute("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    const h1 = chapter.querySelector("h1");
    const title = h1 ? textWithoutRuby(h1) : `章${index + 1}`;
    return { chapterId, title: safeText(title, `章${index + 1}`) };
  });
}
