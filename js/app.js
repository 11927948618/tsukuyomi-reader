import { initLibrary } from "./library.js";
import { initReader } from "./reader.js";
import { exportZipFromBook } from "./storage.js";
import { qs, loadJSON, saveJSON } from "./utils.js";

const DEFAULT_SETTINGS = {
  fontSize: 100,
  lineHeight: 1.8,
  letterSpacing: 0,
  theme: "light"
};

const DEFAULT_PROGRESS = {
  chapterId: null,
  scrollLeft: 0,
  pageIndex: 0
};

const appRoot = qs("#appRoot");
const appState = {
  currentBook: null,
  currentBookId: null,
  settings: { ...DEFAULT_SETTINGS },
  progress: { ...DEFAULT_PROGRESS }
};

async function loadTemplate(name) {
  const res = await fetch(`./templates/${name}.html`);
  if (!res.ok) throw new Error("テンプレート読み込みに失敗しました");
  const html = await res.text();
  appRoot.innerHTML = html;
}

async function render(screen) {
  if (screen === "library") {
    await loadTemplate("library");
    applyTheme(appState.settings.theme);
    initLibrary({
      onOpenBook: (book) => {
        applyBook(book);
        render("reader");
      },
      onExport: () => exportCurrentBook(),
      getCurrentBook: () => appState.currentBook
    });
    if (appState.startupMessage) {
      const status = qs("#statusMessage");
      if (status) {
        status.textContent = appState.startupMessage;
        status.className = "status error";
      }
      appState.startupMessage = "";
    }
    return;
  }

  if (screen === "reader") {
    await loadTemplate("reader");
    applyTheme(appState.settings.theme);
    initReader({
      book: appState.currentBook,
      settings: appState.settings,
      progress: appState.progress,
      onBack: () => render("library"),
      onExport: () => exportCurrentBook(),
      onUpdateSettings: (nextSettings) => {
        appState.settings = { ...appState.settings, ...nextSettings };
        applyTheme(appState.settings.theme);
      },
      onUpdateProgress: (nextProgress) => {
        appState.progress = { ...appState.progress, ...nextProgress };
        saveProgress(appState.currentBookId, appState.progress);
      }
    });
    persistLastOpened();
  }
}

function applyBook(book) {
  appState.currentBook = book;
  appState.currentBookId = buildBookId(book);
  appState.settings = {
    ...DEFAULT_SETTINGS,
    ...(book.settings || book.meta?.settings || {})
  };
  appState.progress = {
    ...DEFAULT_PROGRESS,
    ...(book.progress || book.meta?.progress || {})
  };
}

function exportCurrentBook() {
  exportZipFromBook(appState.currentBook, {
    settings: appState.settings,
    progress: appState.progress
  }).catch(() => {});
}

function buildBookId(book) {
  const title = book?.title || "Untitled";
  const tocLength = Array.isArray(book?.toc) ? book.toc.length : 0;
  const htmlLength = (book?.html || "").length;
  return `${title}::${tocLength}::${htmlLength}`;
}

function persistLastOpened() {
  if (!appState.currentBook || !appState.currentBookId) return;

  const lastOpened = {
    bookId: appState.currentBookId,
    title: appState.currentBook.title || "Untitled",
    sourceType: "cache",
    sourceData: null,
    savedAt: new Date().toISOString()
  };

  const cache = {
    bookId: appState.currentBookId,
    title: appState.currentBook.title || "Untitled",
    html: appState.currentBook.html || "",
    toc: Array.isArray(appState.currentBook.toc) ? appState.currentBook.toc : [],
    cachedAt: new Date().toISOString()
  };

  const ok1 = saveJSON("tsukiyomi:lastOpened", lastOpened);
  const ok2 = saveJSON("tsukiyomi:lastBookCache", cache);

  if (!ok1 || !ok2) {
    appState.startupMessage = "キャッシュ保存に失敗しました（容量不足の可能性）";
  }
}

function saveProgress(bookId, progress) {
  if (!bookId) return;
  const payload = {
    scrollLeft: Number(progress.scrollLeft) || 0,
    pageIndex: Number(progress.pageIndex) || 0,
    chapterId: progress.chapterId || null,
    updatedAt: new Date().toISOString()
  };
  const ok = saveJSON(`tsukiyomi:progress:${bookId}`, payload);
  if (!ok) {
    appState.startupMessage = "進捗保存に失敗しました（容量不足の可能性）";
  }
}

function tryRestoreLastBook() {
  const cached = loadJSON("tsukiyomi:lastBookCache", null);
  if (!cached || !cached.html || !cached.toc) return false;

  const book = {
    title: cached.title || "Untitled",
    html: cached.html,
    toc: Array.isArray(cached.toc) ? cached.toc : [],
    meta: null
  };

  applyBook(book);

  const progress = loadJSON(`tsukiyomi:progress:${appState.currentBookId}`, null);
  if (progress) {
    appState.progress = { ...DEFAULT_PROGRESS, ...progress };
  }

  render("reader");
  return true;
}

function applyTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

registerServiceWorker();
if (!tryRestoreLastBook()) {
  render("library");
}
