import { qs, readFileAsText, safeText } from "./utils.js";
import { normalizeTxtToBook } from "./normalize-txt.js";
import { normalizeEpub } from "./normalize-epub.js";
import { importZipToBook } from "./storage.js";

const DEFAULT_SITE_CONFIG = {
  mode: "development",
  siteName: "TsukuyomiReader Dev",
  allowLocalImport: true,
  allowExport: true,
  booksManifest: "./books/manifest.json"
};

export function initLibrary({ siteConfig = null, onOpenBook, onExport, getCurrentBook, onOpenReaderSettings }) {
  const config = normalizeSiteConfig(siteConfig);
  const allowLocalImport = config.allowLocalImport !== false;
  const allowExport = config.allowExport !== false;
  const txtInput = qs("#txtInput");
  const txtEncoding = qs("#txtEncoding");
  const htmlInput = qs("#htmlInput");
  const zipInput = qs("#zipInput");
  const bundledBooksStatus = qs("#bundledBooksStatus");
  const bundledBooksList = qs("#bundledBooksList");
  const bundledBooksToggleBtn = qs("#bundledBooksToggleBtn");
  const exportBtn = qs("#exportBtn");
  const openReaderSettingsBtn = qs("#openReaderSettingsBtn");
  const libraryReloadBtn = qs("#libraryReloadBtn");
  const libraryHardReloadBtn = qs("#libraryHardReloadBtn");
  const statusMessage = qs("#statusMessage");
  const debugDecode = qs("#debugDecode");
  const manualImportCards = Array.from(document.querySelectorAll("[data-manual-import]"));
  const exportControls = Array.from(document.querySelectorAll("[data-export-control]"));
  let bundledBooksOpen = false;

  const setStatus = (message, type = "") => {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`.trim();
  };
  const setDebug = (text = "") => {
    if (!debugDecode) return;
    debugDecode.textContent = text;
    debugDecode.hidden = !text;
  };

  if (exportBtn) exportBtn.disabled = !allowExport || !getCurrentBook();
  setStatus("作品を選んでください");
  setBundledBooksOpen(config.mode === "distribution");

  if (!allowLocalImport) {
    manualImportCards.forEach((card) => {
      card.hidden = true;
    });
  }
  exportControls.forEach((el) => {
    el.hidden = !allowExport;
  });

  bundledBooksToggleBtn?.addEventListener("click", () => {
    setBundledBooksOpen(!bundledBooksOpen);
  });

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
      localStorage.removeItem("tsukiyomi:lastOpened");
      localStorage.removeItem("tsukiyomi:lastBookCache");
    } finally {
      location.reload();
    }
  });

  exportBtn?.addEventListener("click", () => {
    if (!allowExport) return;
    const book = getCurrentBook();
    if (!book) {
      setStatus("保存する本がありません", "error");
      return;
    }
    onExport();
  });

  txtInput?.addEventListener("change", async (event) => {
    if (!allowLocalImport) {
      setStatus("立ち読み用ではローカルファイル読込を無効にしています", "error");
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    const isEpub = name.endsWith(".epub") || file.type === "application/epub+zip";
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";

    if (isEpub) {
      setStatus("EPUB読み込み中...");
      try {
        const book = attachBookSource(await normalizeEpub(file), "file-import", {
          kind: "epub",
          filename: file.name || ""
        });
        setDebug("");
        setStatus("EPUB読み込み完了", "ok");
        onOpenBook(book);
      } catch (err) {
        setStatus(err.message || "読み込みに失敗しました", "error");
      }
      return;
    }

    if (isPdf) {
      setStatus("PDF読み込み中...");
      try {
        const pdfUrl = URL.createObjectURL(file);
        const book = attachBookSource(createPdfBook({
          title: file.name || "PDF作品",
          filename: file.name || "",
          pdfUrl
        }), "file-import", {
          kind: "pdf",
          filename: file.name || ""
        });
        setDebug("");
        setStatus("PDF読み込み完了", "ok");
        onOpenBook(book);
      } catch (err) {
        setStatus(err.message || "PDFの読み込みに失敗しました", "error");
      }
      return;
    }

    setStatus("TXT読み込み中...");
    try {
      const mode = txtEncoding ? txtEncoding.value : "auto";
      const { text, encoding, debug } = await decodeTxtAuto(file, mode);
      setDebug(debug);
      console.log("[TXT decode] pick:", encoding);
      const book = attachBookSource(normalizeTxtToBook(text, file.name, {
        autoDetectStructure: loadTxtStructureAutoDetectPreference()
      }), "file-import", {
        kind: "txt",
        filename: file.name || "",
        encoding
      });
      setStatus("TXT読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  htmlInput?.addEventListener("change", async (event) => {
    if (!allowLocalImport) {
      setStatus("立ち読み用ではローカルファイル読込を無効にしています", "error");
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    setStatus("HTML読み込み中...");
    try {
      const htmlText = await readFileAsText(file);
      setDebug("");
      const book = attachBookSource(normalizeHtmlToBook(htmlText, file.name), "file-import", {
        kind: "html",
        filename: file.name || ""
      });
      setStatus("HTML読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  zipInput?.addEventListener("change", async (event) => {
    if (!allowLocalImport) {
      setStatus("立ち読み用ではバックアップZIP読込を無効にしています", "error");
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    setStatus("バックアップZIP読み込み中...");
    try {
      setDebug("");
      const book = attachBookSource(await importZipToBook(file), "backup-zip", {
        kind: "zip",
        filename: file.name || ""
      });
      setStatus("バックアップZIP読み込み完了", "ok");
      onOpenBook(book);
    } catch (err) {
      setStatus(err.message || "読み込みに失敗しました", "error");
    }
  });

  void initBundledBooksShelf({
    bundledBooksStatus,
    bundledBooksList,
    bundledBooksToggleBtn,
    txtEncoding,
    siteConfig: config,
    setDebug,
    setStatus,
    onOpenBook,
    onAfterOpenBook: () => setBundledBooksOpen(config.mode !== "distribution")
  });

  function setBundledBooksOpen(open) {
    bundledBooksOpen = Boolean(open);
    if (bundledBooksList) bundledBooksList.hidden = !bundledBooksOpen;
    if (bundledBooksToggleBtn) {
      bundledBooksToggleBtn.setAttribute("aria-expanded", bundledBooksOpen ? "true" : "false");
      bundledBooksToggleBtn.textContent = bundledBooksOpen ? "閉じる" : "開く";
    }
  }
}

function normalizeSiteConfig(config) {
  return {
    ...DEFAULT_SITE_CONFIG,
    ...(config && typeof config === "object" ? config : {})
  };
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
  bundledBooksToggleBtn,
  txtEncoding,
  siteConfig,
  setDebug,
  setStatus,
  onOpenBook,
  onAfterOpenBook
}) {
  if (!bundledBooksStatus || !bundledBooksList) return;
  const config = normalizeSiteConfig(siteConfig);
  const manifestPath = config.booksManifest || DEFAULT_SITE_CONFIG.booksManifest;

  try {
    const manifest = await loadBundledBookManifest(manifestPath);
    const books = normalizeBookManifestEntries(manifest).filter((entry) => entry?.published === true);

    if (books.length === 0) {
      bundledBooksStatus.textContent = `${manifestPath} に公開中の作品が登録されていません`;
      bundledBooksStatus.className = "status error";
      if (bundledBooksToggleBtn) bundledBooksToggleBtn.disabled = true;
      return;
    }

    bundledBooksStatus.textContent = `${books.length}作品`;
    bundledBooksStatus.className = "status ok";
    if (bundledBooksToggleBtn) bundledBooksToggleBtn.disabled = false;
    bundledBooksList.innerHTML = "";

    books.forEach((entry) => {
      const kind = normalizeBundledBookKind(entry?.format || entry?.kind, entry?.path || entry?.filename || "");
      const displayTitle = safeText(entry.title, entry.filename || entry.path || "Untitled");
      const article = document.createElement("article");
      article.className = "book-card";

      const cover = document.createElement("div");
      cover.className = "book-cover";
      if (entry.cover) {
        const img = document.createElement("img");
        img.src = buildManifestAssetUrl(entry.cover, manifestPath);
        img.alt = `${displayTitle} 表紙`;
        img.loading = "lazy";
        img.draggable = false;
        img.addEventListener("error", () => {
          cover.innerHTML = "";
          const fallback = document.createElement("span");
          fallback.className = "book-cover-placeholder";
          fallback.textContent = "No cover";
          cover.appendChild(fallback);
        });
        cover.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "book-cover-placeholder";
        fallback.textContent = "No cover";
        cover.appendChild(fallback);
      }

      const info = document.createElement("div");
      info.className = "book-info";

      const title = document.createElement("h2");
      title.className = "book-title";
      title.textContent = displayTitle;

      const author = document.createElement("p");
      author.className = "book-author";
      author.textContent = safeText(entry.author, "作者未設定");

      const desc = document.createElement("p");
      desc.className = "book-description";
      desc.textContent = safeText(entry?.description, defaultDescription(kind));

      const updated = document.createElement("p");
      updated.className = "book-updated";
      updated.textContent = entry.updatedAt ? `更新日: ${entry.updatedAt}` : "";
      updated.hidden = !entry.updatedAt;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "button book-read-button";
      button.textContent = "読む";
      button.setAttribute("aria-label", `${displayTitle} を読む`);

      info.appendChild(title);
      info.appendChild(author);
      info.appendChild(desc);
      info.appendChild(updated);
      info.appendChild(button);
      article.appendChild(cover);
      article.appendChild(info);

      button.addEventListener("click", async () => {
        bundledBooksStatus.textContent = `${title.textContent} を読み込み中...`;
        bundledBooksStatus.className = "status";
        setStatus(`${title.textContent} を読み込み中...`);
        try {
          const book = await openBundledBook(entry, txtEncoding?.value || "auto", setDebug, manifestPath);
          bundledBooksStatus.textContent = `${title.textContent} を開きました`;
          bundledBooksStatus.className = "status ok";
          setStatus("作品を開きました", "ok");
          onOpenBook(book);
          onAfterOpenBook?.();
        } catch (err) {
          bundledBooksStatus.textContent = err.message || "作品の読み込みに失敗しました";
          bundledBooksStatus.className = "status error";
          setStatus(err.message || "作品の読み込みに失敗しました", "error");
        }
      });

      bundledBooksList.appendChild(article);
    });
  } catch (err) {
    bundledBooksStatus.textContent = err.message || "作品一覧の取得に失敗しました";
    bundledBooksStatus.className = "status error";
    if (bundledBooksToggleBtn) bundledBooksToggleBtn.disabled = true;
  }
}

async function loadBundledBookManifest(manifestPath) {
  let res;
  try {
    res = await fetch(manifestPath, { cache: "no-store" });
  } catch (err) {
    throw new Error(`${manifestPath} に接続できません: ${err?.message || "network error"}`);
  }

  if (res.status === 404 && manifestPath !== DEFAULT_SITE_CONFIG.booksManifest) {
    return loadBundledBookManifest(DEFAULT_SITE_CONFIG.booksManifest);
  }

  if (!res.ok) {
    const detail = await readErrorResponse(res);
    throw new Error(`${manifestPath} を読み込めません（HTTP ${res.status}${detail ? `: ${detail}` : ""}）`);
  }

  const manifest = await res.json();
  if (!Array.isArray(manifest) && !Array.isArray(manifest?.books)) {
    throw new Error(`${manifestPath} の形式が未対応です`);
  }
  return manifest;
}

async function readErrorResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = await res.json();
      return safeText(payload?.error || payload?.message, "").slice(0, 160);
    }
    return safeText(await res.text(), "").replace(/\s+/g, " ").slice(0, 160);
  } catch (err) {
    return "";
  }
}

function normalizeBookManifestEntries(manifest) {
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest?.books)) return manifest.books;
  return [];
}

async function openBundledBook(entry, txtMode = "auto", setDebug, manifestPath = DEFAULT_SITE_CONFIG.booksManifest) {
  const relativePath = safeText(entry?.path || entry?.filename, "");
  if (!relativePath) {
    throw new Error(`${manifestPath} の path または filename が不足しています`);
  }

  const filename = relativePath.split("/").pop() || relativePath;
  const sourceUrl = buildManifestAssetUrl(relativePath, manifestPath);
  const kind = normalizeBundledBookKind(entry?.format || entry?.kind, filename);
  const sourceData = {
    id: entry?.id || null,
    path: relativePath,
    manifestPath,
    kind
  };

  if (kind === "epub") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`EPUBを読み込めません: ${filename}`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/epub+zip" });
    setDebug?.("");
    return attachBookSource(await normalizeEpub(file), "manifest", sourceData);
  }

  if (kind === "txt") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`TXTを読み込めません: ${filename}`);
    const buffer = await res.arrayBuffer();
    const { text, debug } = decodeTxtBuffer(buffer, txtMode);
    setDebug?.(debug);
    return attachBookSource(normalizeTxtToBook(text, filename, {
      autoDetectStructure: loadTxtStructureAutoDetectPreference()
    }), "manifest", sourceData);
  }

  if (kind === "html") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`HTMLを読み込めません: ${filename}`);
    const htmlText = await res.text();
    setDebug?.("");
    return attachBookSource(normalizeHtmlToBook(htmlText, filename), "manifest", sourceData);
  }

  if (kind === "pdf") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`PDFを読み込めません: ${filename}`);
    const blob = await res.blob();
    const pdfUrl = URL.createObjectURL(blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" }));
    setDebug?.("");
    return attachBookSource(createPdfBook({
      title: safeText(entry?.title, filename),
      filename,
      pdfUrl
    }), "manifest", sourceData);
  }

  if (kind === "zip") {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`ZIPを読み込めません: ${filename}`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/zip" });
    setDebug?.("");
    return attachBookSource(await importZipToBook(file), "manifest", sourceData);
  }

  throw new Error(`未対応の作品形式です: ${filename}`);
}

function loadTxtStructureAutoDetectPreference() {
  try {
    const raw = localStorage.getItem("tsukiyomi:txtStructureAutoDetect");
    if (raw == null) return true;
    return JSON.parse(raw) !== false;
  } catch (err) {
    return true;
  }
}

function buildManifestAssetUrl(relativePath, manifestPath = DEFAULT_SITE_CONFIG.booksManifest) {
  const raw = String(relativePath || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return raw;
  if (raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/")) {
    return encodeRelativeUrl(raw);
  }

  const base = String(manifestPath || "")
    .split(/[?#]/, 1)[0]
    .replace(/\/[^/]*$/, "");
  const joined = base ? `${base}/${raw}` : raw;
  return encodeRelativeUrl(joined);
}

function encodeRelativeUrl(url) {
  const [pathAndQuery, hash = ""] = String(url).split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const encodedPath = path
    .split("/")
    .map((part) => {
      if (!part || part === "." || part === "..") return part;
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch (err) {
        return encodeURIComponent(part);
      }
    })
    .join("/");
  return `${encodedPath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

function attachBookSource(book, sourceType, sourceData = null) {
  return {
    ...book,
    meta: {
      ...(book?.meta && typeof book.meta === "object" ? book.meta : {}),
      sourceType,
      sourceData
    }
  };
}

function normalizeBundledBookKind(kind, filename) {
  const hinted = String(kind || "").toLowerCase();
  if (hinted === "txt" || hinted === "epub" || hinted === "html" || hinted === "pdf" || hinted === "zip") return hinted;

  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".epub")) return "epub";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".zip")) return "zip";
  return "txt";
}

function defaultDescription(kind) {
  if (kind === "epub") return "EPUB作品";
  if (kind === "html") return "HTML作品";
  if (kind === "pdf") return "PDF作品";
  if (kind === "zip") return "バックアップZIP";
  return "TXT作品";
}

function createPdfBook({ title, filename = "", pdfUrl }) {
  return {
    title: safeText(title, filename || "PDF作品"),
    html: "",
    toc: [{ title: "PDF", chapterId: "pdf-viewer-root" }],
    meta: {
      format: "pdf",
      filename,
      pdfUrl
    }
  };
}
