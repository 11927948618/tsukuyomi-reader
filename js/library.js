import { qs, readFileAsText, safeText } from "./utils.js";
import { normalizeTxtToBook } from "./normalize-txt.js";
import { normalizeEpub } from "./normalize-epub.js";
import { importZipToBook } from "./storage.js";

// Light edition uses only books bundled under ./book/.
// Set this to false when restoring the generic library importer for the full edition.
const LIGHT_EDITION_BUNDLED_ONLY = true;
const BUNDLED_BOOK_MANIFEST_PATH = "./book/manifest.json";

export function initLibrary({ onOpenBook, onExport, getCurrentBook, onOpenReaderSettings }) {
  const txtInput = qs("#txtInput");
  const txtEncoding = qs("#txtEncoding");
  const htmlInput = qs("#htmlInput");
  const zipInput = qs("#zipInput");
  const bundledBooksStatus = qs("#bundledBooksStatus");
  const bundledBooksList = qs("#bundledBooksList");
  const exportBtn = qs("#exportBtn");
  const openReaderSettingsBtn = qs("#openReaderSettingsBtn");
  const libraryReloadBtn = qs("#libraryReloadBtn");
  const libraryHardReloadBtn = qs("#libraryHardReloadBtn");
  const statusMessage = qs("#statusMessage");
  const debugDecode = qs("#debugDecode");
  const manualImportCards = Array.from(document.querySelectorAll("[data-manual-import]"));

  const setStatus = (message, type = "") => {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`.trim();
  };
  const setDebug = (text = "") => {
    if (!debugDecode) return;
    debugDecode.textContent = text;
    debugDecode.hidden = !text;
  };

  exportBtn.disabled = !getCurrentBook();
  setStatus(LIGHT_EDITION_BUNDLED_ONLY ? "同梱書籍を選んでください" : "待機中");

  if (LIGHT_EDITION_BUNDLED_ONLY) {
    manualImportCards.forEach((card) => {
      card.hidden = true;
    });
  }

  openReaderSettingsBtn?.addEventListener("click", () => {
    onOpenReaderSettings?.();
  });

  libraryReloadBtn?.addEventListener("click", () => location.reload());
  libraryHardReloadBtn?.addEventListener("click", async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        const targets = keys.filter((key) => /tsukuyomi|tsukuyomireader/i.test(key));
        await Promise.all(targets.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } finally {
      location.reload();
    }
  });

  exportBtn.addEventListener("click", () => {
    const book = getCurrentBook();
    if (!book) {
      setStatus("保存する本がありません", "error");
      return;
    }
    onExport();
  });

  txtInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    const isEpub = name.endsWith(".epub") || file.type === "application/epub+zip";

    if (isEpub) {
      setStatus("EPUB読み込み中...");
      try {
        const book = await normalizeEpub(file);
        setDebug("");
        setStatus("EPUB読み込み完了", "ok");
        onOpenBook(book);
      } catch (err) {
        setStatus(err.message || "読み込みに失敗しました", "error");
      }
      return;
    }

    setStatus("TXT読み込み中...");
    try {
      const mode = txtEncoding ? txtEncoding.value : "auto";
      const { text, encoding, debug } = await decodeTxtAuto(file, mode);
      setDebug(debug);
      console.log("[TXT decode] pick:", encoding);
      const book = normalizeTxtToBook(text, file.name);
      setStatus("TXT読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  htmlInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("HTML読み込み中...");
    try {
      const htmlText = await readFileAsText(file);
      setDebug("");
      const book = normalizeHtmlToBook(htmlText, file.name);
      setStatus("HTML読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  zipInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setStatus("バックアップZIP読み込み中...");
    try {
      setDebug("");
      const book = await importZipToBook(file);
      setStatus("バックアップZIP読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  void initBundledBooksShelf({
    bundledBooksStatus,
    bundledBooksList,
    txtEncoding,
    setDebug,
    setStatus,
    onOpenBook
  });
}

function countReplacement(text) {
  let n = 0;
  for (const ch of text) {
    if (ch === "\uFFFD") n += 1;
  }
  return n;
}

async function decodeTxtAuto(file, mode = "auto") {
  const buffer = await file.arrayBuffer();
  return decodeTxtBuffer(buffer, mode);
}

function decodeTxtBuffer(buffer, mode = "auto") {

  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const utf8 = utf8Text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const utf8Score = countReplacement(utf8);

  let shiftJis = null;
  let sjScore = Number.POSITIVE_INFINITY;

  try {
    const sjText = new TextDecoder("shift_jis", { fatal: false }).decode(buffer);
    shiftJis = sjText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    sjScore = countReplacement(shiftJis);
  } catch (err) {
    shiftJis = null;
    sjScore = Number.POSITIVE_INFINITY;
  }

  if (mode === "utf-8") {
    return { text: utf8, encoding: "utf-8", debug: formatDebug("utf-8", utf8Score, sjScore, utf8) };
  }
  if (mode === "shift_jis" && shiftJis) {
    return { text: shiftJis, encoding: "shift_jis", debug: formatDebug("shift_jis", utf8Score, sjScore, shiftJis) };
  }

  const picked = shiftJis && sjScore < utf8Score ? "shift_jis" : "utf-8";
  const chosen = picked === "shift_jis" ? shiftJis : utf8;
  const head = (chosen || "").slice(0, 200);

  const debug = [
    `picked: ${picked}`,
    `score utf: ${utf8Score} / sjis: ${sjScore === Number.POSITIVE_INFINITY ? "N/A" : sjScore}`,
    `head: ${head}`
  ].join("\n");

  return { text: chosen, encoding: picked, debug };
}

function formatDebug(picked, utf8Score, sjScore, text) {
  const head = (text || "").slice(0, 200);
  return [
    `picked: ${picked}`,
    `score utf: ${utf8Score} / sjis: ${sjScore === Number.POSITIVE_INFINITY ? "N/A" : sjScore}`,
    `head: ${head}`
  ].join("\n");
}

function normalizeHtmlToBook(htmlText, filename = "") {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  doc.querySelectorAll("script").forEach((el) => el.remove());

  let chapters = Array.from(doc.querySelectorAll("section.chapter"));

  if (chapters.length === 0) {
    const section = doc.createElement("section");
    section.className = "chapter";
    const h1 = doc.createElement("h1");
    h1.textContent = safeText(filename.replace(/\.[^.]+$/, ""), "本文");
    section.appendChild(h1);

    const wrapper = doc.createElement("div");
    wrapper.innerHTML = doc.body.innerHTML;
    Array.from(wrapper.childNodes).forEach((node) => section.appendChild(node));

    doc.body.innerHTML = "";
    doc.body.appendChild(section);
    chapters = [section];
  }

  const toc = chapters.map((chapter, index) => {
    const chapterId = chapter.getAttribute("id") || `chapter-${String(index + 1).padStart(3, "0")}`;
    chapter.setAttribute("id", chapterId);
    chapter.setAttribute("data-chapter", chapterId);

    let title = "";
    const h1 = chapter.querySelector("h1");
    if (h1) {
      title = h1.textContent || "";
    } else {
      title = `章${index + 1}`;
      const newH1 = doc.createElement("h1");
      newH1.textContent = title;
      chapter.prepend(newH1);
    }

    return { chapterId, title: safeText(title, `章${index + 1}`) };
  });

  const html = chapters.map((chapter) => chapter.outerHTML).join("\n");

  return {
    title: safeText(filename.replace(/\.[^.]+$/, ""), "Untitled"),
    html,
    toc,
    meta: null
  };
}

async function initBundledBooksShelf({
  bundledBooksStatus,
  bundledBooksList,
  txtEncoding,
  setDebug,
  setStatus,
  onOpenBook
}) {
  if (!bundledBooksStatus || !bundledBooksList) return;

  try {
    const manifest = await loadBundledBookManifest();
    const books = Array.isArray(manifest.books) ? manifest.books : [];

    if (books.length === 0) {
      bundledBooksStatus.textContent = "book/manifest.json に本が登録されていません";
      bundledBooksStatus.className = "status error";
      return;
    }

    bundledBooksStatus.textContent = `${books.length}冊の同梱書籍を利用できます`;
    bundledBooksStatus.className = "status ok";
    bundledBooksList.innerHTML = "";

    books.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button ghost bundled-book-button";

      const meta = document.createElement("span");
      meta.className = "bundled-book-meta";

      const title = document.createElement("span");
      title.className = "bundled-book-title";
      title.textContent = safeText(entry.title, entry.filename || "Untitled");

      const note = document.createElement("span");
      note.className = "bundled-book-note";
      note.textContent = buildBundledBookNote(entry);

      meta.appendChild(title);
      meta.appendChild(note);
      button.appendChild(meta);

      button.addEventListener("click", async () => {
        bundledBooksStatus.textContent = `${title.textContent} を読み込み中...`;
        bundledBooksStatus.className = "status";
        setStatus(`${title.textContent} を読み込み中...`);
        try {
          const book = await openBundledBook(entry, txtEncoding?.value || "auto", setDebug);
          bundledBooksStatus.textContent = `${title.textContent} を開きました`;
          bundledBooksStatus.className = "status ok";
          setStatus("同梱書籍を開きました", "ok");
          onOpenBook(book);
        } catch (err) {
          bundledBooksStatus.textContent = err.message || "同梱書籍の読み込みに失敗しました";
          bundledBooksStatus.className = "status error";
          setStatus(err.message || "同梱書籍の読み込みに失敗しました", "error");
        }
      });

      bundledBooksList.appendChild(button);
    });
  } catch (err) {
    bundledBooksStatus.textContent = err.message || "同梱書籍の一覧取得に失敗しました";
    bundledBooksStatus.className = "status error";
  }
}

async function loadBundledBookManifest() {
  const res = await fetch(BUNDLED_BOOK_MANIFEST_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("book/manifest.json を読み込めません");
  }
  const manifest = await res.json();
  if (Number(manifest?.formatVersion) !== 1) {
    throw new Error("book/manifest.json の formatVersion が未対応です");
  }
  return manifest;
}

async function openBundledBook(entry, txtMode = "auto", setDebug) {
  const relativePath = safeText(entry?.path || entry?.filename, "");
  if (!relativePath) {
    throw new Error("book/manifest.json の path または filename が不足しています");
  }

  const filename = relativePath.split("/").pop() || relativePath;
  const sourceUrl = buildBundledBookUrl(relativePath);
  const kind = normalizeBundledBookKind(entry?.kind, filename);

  if (kind === "epub") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`同梱EPUBを読み込めません: ${filename}`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/epub+zip" });
    setDebug?.("");
    return normalizeEpub(file);
  }

  if (kind === "txt") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`同梱TXTを読み込めません: ${filename}`);
    const buffer = await res.arrayBuffer();
    const { text, debug } = decodeTxtBuffer(buffer, txtMode);
    setDebug?.(debug);
    return normalizeTxtToBook(text, filename);
  }

  if (kind === "html") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`同梱HTMLを読み込めません: ${filename}`);
    const htmlText = await res.text();
    setDebug?.("");
    return normalizeHtmlToBook(htmlText, filename);
  }

  if (kind === "zip") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`同梱ZIPを読み込めません: ${filename}`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/zip" });
    setDebug?.("");
    return importZipToBook(file);
  }

  throw new Error(`未対応の同梱書籍形式です: ${filename}`);
}

function buildBundledBookUrl(relativePath) {
  const normalized = String(relativePath).replace(/^\.?\/+/, "");
  return `./book/${normalized.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function normalizeBundledBookKind(kind, filename) {
  const hinted = String(kind || "").toLowerCase();
  if (hinted === "txt" || hinted === "epub" || hinted === "html" || hinted === "zip") return hinted;

  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".epub")) return "epub";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".zip")) return "zip";
  return "txt";
}

function buildBundledBookNote(entry) {
  const parts = [];
  const kind = normalizeBundledBookKind(entry?.kind, entry?.filename || "");
  parts.push(kind.toUpperCase());

  if (entry?.description) {
    parts.push(String(entry.description));
  } else if (entry?.filename) {
    parts.push(String(entry.filename));
  }

  return parts.join(" / ");
}
