import { initLibrary } from "./library.js";
import { initReader } from "./reader.js";
import { exportZipFromBook } from "./storage.js";
import { qs, loadJSON, saveJSON } from "./utils.js";
import { APP_VERSION, BUILD_TIME, COMMIT } from "./version.js";

const LIGHT_EDITION_BUNDLED_ONLY = true;

const DEFAULT_SETTINGS = {
  fontSize: 100,
  lineHeight: 1.8,
  letterSpacing: 0,
  wrapWidthPercent: 100,
  theme: "light",
  displayMode: "paged",
  tapInScroll: false,
  wheelPaging: false,
  writingModePreference: "vertical"
};

const DEFAULT_PROGRESS = {
  chapterId: null,
  scrollLeft: 0,
  scrollTop: 0,
  pageIndex: 0
};
const BUNDLED_BOOK_MANIFEST_PATH = "./book/manifest.json";

const appRoot = qs("#appRoot");
const appState = {
  currentBook: null,
  currentBookId: null,
  settings: { ...DEFAULT_SETTINGS },
  progress: { ...DEFAULT_PROGRESS },
  openSettingsOnReader: false
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
      getCurrentBook: () => appState.currentBook,
      onOpenReaderSettings: () => {
        if (!appState.currentBook) {
          const status = qs("#statusMessage");
          if (status) {
            status.textContent = "先に本を読み込んでください";
            status.className = "status error";
          }
          return;
        }
        appState.openSettingsOnReader = true;
        render("reader");
      }
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
      openSettingsOnStart: Boolean(appState.openSettingsOnReader),
      onBack: () => render("library"),
      onExport: () => exportCurrentBook(),
      onUpdateSettings: (nextSettings) => {
        appState.settings = { ...appState.settings, ...nextSettings };
        applyTheme(appState.settings.theme);
      },
      onSaveSettings: (nextSettings) => {
        appState.settings = { ...appState.settings, ...nextSettings };
        saveSettings(appState.currentBookId, appState.settings);
      },
      onUpdateProgress: (nextProgress) => {
        appState.progress = { ...appState.progress, ...nextProgress };
        saveProgress(appState.currentBookId, appState.progress);
      }
    });
    appState.openSettingsOnReader = false;
    persistLastOpened();
    queueVersionBadge();
  }
}

function applyBook(book) {
  appState.currentBook = book;
  appState.currentBookId = buildBookId(book);
  const savedSettings = loadSettings(appState.currentBookId);
  appState.settings = {
    ...DEFAULT_SETTINGS,
    ...(book.settings || book.meta?.settings || {}),
    ...(savedSettings || {})
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
  const source = getBookSource(appState.currentBook);

  const lastOpened = {
    bookId: appState.currentBookId,
    title: appState.currentBook.title || "Untitled",
    sourceType: source.sourceType,
    sourceData: source.sourceData,
    savedAt: new Date().toISOString()
  };

  const cache = {
    bookId: appState.currentBookId,
    title: appState.currentBook.title || "Untitled",
    html: appState.currentBook.html || "",
    toc: Array.isArray(appState.currentBook.toc) ? appState.currentBook.toc : [],
    sourceType: source.sourceType,
    sourceData: source.sourceData,
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
    scrollTop: Number(progress.scrollTop) || 0,
    pageIndex: Number(progress.pageIndex) || 0,
    chapterId: progress.chapterId || null,
    updatedAt: new Date().toISOString()
  };
  const ok = saveJSON(`tsukiyomi:progress:${bookId}`, payload);
  if (!ok) {
    appState.startupMessage = "進捗保存に失敗しました（容量不足の可能性）";
  }
}

async function tryRestoreLastBook() {
  const cached = loadJSON("tsukiyomi:lastBookCache", null);
  if (!cached || !cached.html || !Array.isArray(cached.toc)) return false;

  const restoreSourceType = await resolveRestoreSourceType(cached);
  if (LIGHT_EDITION_BUNDLED_ONLY && restoreSourceType !== "bundled") {
    appState.startupMessage = "ライト版では外部書籍の自動復元を無効にしています";
    return false;
  }

  const book = {
    title: cached.title || "Untitled",
    html: cached.html,
    toc: Array.isArray(cached.toc) ? cached.toc : [],
    meta: {
      sourceType: restoreSourceType || cached.sourceType || "cache",
      sourceData: cached.sourceData || null
    }
  };

  applyBook(book);

  const progress = loadJSON(`tsukiyomi:progress:${appState.currentBookId}`, null);
  if (progress) {
    appState.progress = { ...DEFAULT_PROGRESS, ...progress };
  }

  await render("reader");
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

function saveSettings(bookId, settings) {
  if (!bookId) return;
  const payload = {
    fontSize: Number(settings.fontSize) || 100,
    lineHeight: Number(settings.lineHeight) || 1.8,
    letterSpacing: Number(settings.letterSpacing) || 0,
    wrapWidthPercent: Number(settings.wrapWidthPercent) || 100,
    theme: settings.theme || "light",
    displayMode: settings.displayMode || "paged",
    tapInScroll: Boolean(settings.tapInScroll),
    wheelPaging: Boolean(settings.wheelPaging),
    writingModePreference: settings.writingModePreference || "vertical",
    updatedAt: new Date().toISOString()
  };
  const ok = saveJSON(`tsukiyomi:settings:${bookId}`, payload);
  if (!ok) {
    appState.startupMessage = "設定保存に失敗しました（容量不足の可能性）";
  }
}

function loadSettings(bookId) {
  if (!bookId) return null;
  return loadJSON(`tsukiyomi:settings:${bookId}`, null);
}

function applyVersionBadge() {
  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = `v${APP_VERSION}`;

  const settingsVersion = document.getElementById("settingsVersion");
  if (settingsVersion) settingsVersion.textContent = `v${APP_VERSION}`;

  const settingsBuild = document.getElementById("settingsBuildTime");
  if (settingsBuild) settingsBuild.textContent = BUILD_TIME;

  const settingsCommit = document.getElementById("settingsCommit");
  if (settingsCommit) settingsCommit.textContent = COMMIT;
}

function queueVersionBadge() {
  requestAnimationFrame(() => requestAnimationFrame(applyVersionBadge));
}

function getBookSource(book) {
  const meta = book?.meta && typeof book.meta === "object" ? book.meta : null;
  return {
    sourceType: typeof meta?.sourceType === "string" ? meta.sourceType : "cache",
    sourceData: meta?.sourceData && typeof meta.sourceData === "object" ? meta.sourceData : null
  };
}

async function resolveRestoreSourceType(cached) {
  const sourceType = typeof cached?.sourceType === "string" ? cached.sourceType : "";
  if (!LIGHT_EDITION_BUNDLED_ONLY) {
    return sourceType || "cache";
  }

  if (sourceType === "bundled") {
    return "bundled";
  }

  // Compatibility path for caches created before sourceType/sourceData were stored.
  // If the cached title still matches a bundled title, migrate it back into bundled restore flow.
  if (!sourceType || sourceType === "cache") {
    const bundledTitles = await loadBundledBookTitles();
    if (bundledTitles.has(String(cached?.title || "").trim())) {
      return "bundled";
    }
  }

  return sourceType || "cache";
}

async function loadBundledBookTitles() {
  try {
    const res = await fetch(BUNDLED_BOOK_MANIFEST_PATH, { cache: "no-store" });
    if (!res.ok) return new Set();
    const manifest = await res.json();
    const books = Array.isArray(manifest?.books) ? manifest.books : [];
    return new Set(
      books
        .map((entry) => String(entry?.title || "").trim())
        .filter(Boolean)
    );
  } catch (err) {
    return new Set();
  }
}

registerServiceWorker();
tryRestoreLastBook().then((restored) => {
  if (!restored) {
    render("library");
  }
});
