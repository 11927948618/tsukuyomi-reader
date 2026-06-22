import { initLibrary } from "./library.js";
import { initReader } from "./reader.js";
import {
  applyAnalyticsNotice,
  configureAnalytics,
  startAnalyticsSession,
  trackAnalyticsProgress
} from "./analytics.js";
import { exportZipFromBook } from "./storage.js";
import { qs, loadJSON, saveJSON } from "./utils.js";
import { APP_VERSION, BUILD_TIME, COMMIT } from "./version.js";

const DEFAULT_SITE_CONFIG = {
  mode: "development",
  siteName: "TsukuyomiReader Dev",
  allowLocalImport: true,
  allowExport: true,
  disableCopy: false,
  showVersion: true,
  showCopyright: true,
  copyright: "© 2026 hal the juggernaut. All rights reserved.",
  booksManifest: "./books/manifest.json",
  reviewAuthStatusEndpoint: "/api/review-auth/status",
  reviewAuthSessionEndpoint: "/api/review-auth/session",
  analyticsEnabled: false,
  analyticsEndpoint: "/api/analytics/event",
  analyticsRespectDoNotTrack: true,
  analyticsNotice: "",
  measuredPagerV2: false
};

const DEFAULT_SETTINGS = {
  fontSize: 100,
  fontFamilyPreference: "system",
  lineHeight: 1.8,
  letterSpacing: 0,
  wrapWidthPercent: 100,
  theme: "light",
  displayMode: "paged",
  tapInScroll: false,
  wheelPaging: false,
  writingModePreference: "vertical",
  structureAutoDetect: true,
  pageColumns: false,
  lineNumbers: false,
  pageTurnEffect: "none"
};

const DEFAULT_PROGRESS = {
  chapterId: null,
  scrollLeft: 0,
  scrollTop: 0,
  pageIndex: 0
};

const appRoot = qs("#appRoot");
const appState = {
  currentBook: null,
  currentBookId: null,
  settings: { ...DEFAULT_SETTINGS },
  progress: { ...DEFAULT_PROGRESS },
  siteConfig: { ...DEFAULT_SITE_CONFIG },
  reviewAuth: { authRequired: false, authenticated: true },
  openSettingsOnReader: false,
  helpReturnScreen: "library"
};

let distributionGuardsBound = false;

async function loadTemplate(name) {
  const res = await fetch(`./templates/${name}.html`);
  if (!res.ok) throw new Error("テンプレート読み込みに失敗しました");
  const html = await res.text();
  appRoot.innerHTML = html;
}

async function render(screen) {
  if (screen === "auth") {
    await loadTemplate("auth");
    applyTheme(appState.settings.theme);
    applySiteChrome();
    initReviewAuthScreen();
    return;
  }

  if (screen === "library") {
    await loadTemplate("library");
    applyTheme(appState.settings.theme);
    applySiteChrome();
    document.getElementById("openHelpBtn")?.addEventListener("click", () => openHelp("library"));
    initLibrary({
      siteConfig: appState.siteConfig,
      onOpenBook: async (book) => {
        await applyBook(book);
        await render("reader");
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
    bindReviewAuthControls();
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
    applySiteChrome();
    document.getElementById("helpBtn")?.addEventListener("click", () => openHelp("reader"));
    initReader({
      book: appState.currentBook,
      settings: appState.settings,
      progress: appState.progress,
      siteConfig: appState.siteConfig,
      openSettingsOnStart: Boolean(appState.openSettingsOnReader),
      onBack: () => render("library"),
      onExport: () => exportCurrentBook(),
      onUpdateSettings: (nextSettings) => {
        appState.settings = { ...appState.settings, ...nextSettings };
        applyTheme(appState.settings.theme);
        saveGlobalSettings(appState.settings);
      },
      onSaveSettings: (nextSettings) => {
        appState.settings = { ...appState.settings, ...nextSettings };
        saveSettings(appState.currentBookId, appState.settings);
      },
      onUpdateProgress: (nextProgress) => {
        appState.progress = { ...appState.progress, ...nextProgress };
        saveProgress(appState.currentBookId, appState.progress);
        trackAnalyticsProgress(appState.currentBook, appState.progress);
      }
    });
    appState.openSettingsOnReader = false;
    persistLastOpened();
    queueVersionBadge();
    return;
  }

  if (screen === "help") {
    await loadTemplate("help");
    applyTheme(appState.settings.theme);
    applySiteChrome();
    initHelpScreen();
  }
}

function openHelp(returnScreen = "library") {
  appState.helpReturnScreen = returnScreen === "reader" ? "reader" : "library";
  if (appState.helpReturnScreen === "reader") {
    appState.progress = {
      ...appState.progress,
      ...captureCurrentReaderProgress()
    };
    saveProgress(appState.currentBookId, appState.progress);
  }
  render("help");
}

function initHelpScreen() {
  const helpBackBtn = document.getElementById("helpBackBtn");
  if (!helpBackBtn) return;

  const returnScreen = appState.helpReturnScreen === "reader" ? "reader" : "library";
  helpBackBtn.textContent = returnScreen === "reader" ? "Reader に戻る" : "Library に戻る";
  helpBackBtn.addEventListener("click", () => {
    render(returnScreen);
  });
}

function initReviewAuthScreen() {
  const form = document.getElementById("reviewAuthForm");
  const identifierInput = document.getElementById("reviewAuthIdentifier");
  const passwordInput = document.getElementById("reviewAuthPassword");
  const submitBtn = document.getElementById("reviewAuthSubmitBtn");
  const status = document.getElementById("reviewAuthStatus");
  if (!form || !identifierInput || !passwordInput) return;

  const setAuthStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.className = `status ${type}`.trim();
  };

  if (appState.reviewAuth?.error) {
    setAuthStatus(appState.reviewAuth.error, "error");
  } else {
    setAuthStatus("メールアドレスまたは仮IDとパスワードを入力してください");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = String(identifierInput.value || "").trim().toLowerCase();
    const password = String(passwordInput.value || "");
    if (!identifier || !password) {
      setAuthStatus("メールアドレスまたは仮IDとパスワードを入力してください", "error");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setAuthStatus("認証中...");
    try {
      const endpoint = appState.siteConfig?.reviewAuthSessionEndpoint || DEFAULT_SITE_CONFIG.reviewAuthSessionEndpoint;
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });
      const payload = await readResponseJson(res);
      if (!res.ok) throw new Error(payload?.error || "認証に失敗しました");

      appState.reviewAuth = {
        authRequired: payload?.authRequired === true,
        authenticated: true,
        email: payload?.email || "",
        reviewerId: payload?.reviewerId || "",
        expiresAt: payload?.expiresAt || ""
      };
      passwordInput.value = "";
      await render("library");
    } catch (err) {
      setAuthStatus(err.message || "認証に失敗しました", "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function bindReviewAuthControls() {
  const logoutBtn = document.getElementById("reviewLogoutBtn");
  if (!logoutBtn) return;

  logoutBtn.hidden = appState.reviewAuth?.authRequired !== true;
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      const endpoint = appState.siteConfig?.reviewAuthSessionEndpoint || DEFAULT_SITE_CONFIG.reviewAuthSessionEndpoint;
      await fetch(endpoint, {
        method: "DELETE",
        credentials: "same-origin"
      }).catch(() => {});
    } finally {
      appState.currentBook = null;
      appState.currentBookId = null;
      clearCachedBookData();
      appState.reviewAuth = { authRequired: true, authenticated: false };
      await render("auth");
    }
  });
}

async function applyBook(book) {
  appState.currentBook = book;
  appState.currentBookId = buildBookId(book);
  const savedSettings = loadSettings(appState.currentBookId);
  const globalSettings = loadGlobalSettings() || {};
  const bookSettings = book.settings || book.meta?.settings || {};
  appState.settings = {
    ...getRecommendedDefaultSettings(),
    ...bookSettings,
    ...(savedSettings || {}),
    ...globalSettings
  };
  const bookmark = getBookmarkCandidate(appState.currentBookId, book);
  const hasBookmark = isReadableProgress(bookmark);
  const resumeFromBookmark = hasBookmark
    ? await chooseBookmarkStart(book)
    : false;
  appState.progress = {
    ...DEFAULT_PROGRESS,
    ...(resumeFromBookmark ? bookmark : {})
  };
  startAnalyticsSession(appState.currentBook, appState.siteConfig, buildAppViewerProfile());
}

function chooseBookmarkStart(book) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "bookmark-choice-overlay";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = "bookmark-choice-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "bookmarkChoiceTitle");

    const label = document.createElement("p");
    label.className = "label";
    label.textContent = "栞";

    const title = document.createElement("h2");
    title.id = "bookmarkChoiceTitle";
    title.textContent = "栞が見つかりました";

    const copy = document.createElement("p");
    copy.className = "bookmark-choice-copy";
    copy.textContent = `${book?.title || "この本"} を栞から読むか、最初から読むかを選んでください。`;

    const actions = document.createElement("div");
    actions.className = "bookmark-choice-actions";

    const fromBookmark = document.createElement("button");
    fromBookmark.className = "button";
    fromBookmark.type = "button";
    fromBookmark.textContent = "栞から読む";

    const fromStart = document.createElement("button");
    fromStart.className = "button ghost";
    fromStart.type = "button";
    fromStart.textContent = "最初から読む";

    const finish = (value) => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };

    fromBookmark.addEventListener("click", () => finish(true));
    fromStart.addEventListener("click", () => finish(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener("keydown", onKeydown);

    actions.appendChild(fromBookmark);
    actions.appendChild(fromStart);
    dialog.appendChild(label);
    dialog.appendChild(title);
    dialog.appendChild(copy);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => fromBookmark.focus());
  });
}

function exportCurrentBook() {
  if (appState.siteConfig?.allowExport === false) return;
  exportZipFromBook(appState.currentBook, {
    settings: appState.settings,
    progress: appState.progress
  }).catch(() => {});
}

function buildBookId(book) {
  const meta = book?.meta && typeof book.meta === "object" ? book.meta : {};
  const sourceData = meta.sourceData && typeof meta.sourceData === "object" ? meta.sourceData : {};
  const stableSourceId = [
    meta.sourceType || "",
    sourceData.manifestPath || "",
    sourceData.id || "",
    sourceData.path || "",
    sourceData.filename || ""
  ].filter(Boolean).join("::");
  if (stableSourceId) return stableSourceId;

  const title = book?.title || "Untitled";
  const tocLength = Array.isArray(book?.toc) ? book.toc.length : 0;
  const htmlLength = (book?.html || "").length;
  return `${title}::${tocLength}::${htmlLength}`;
}

function persistLastOpened() {
  if (!appState.currentBook || !appState.currentBookId) return;
  if (appState.reviewAuth?.authRequired === true) {
    clearCachedBookData();
    return;
  }

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
    progressPercent: Number(progress.progressPercent) || 0,
    chapterId: progress.chapterId || null,
    viewerProfile: normalizeStoredViewerProfile(progress.viewerProfile || buildAppViewerProfile()),
    updatedAt: new Date().toISOString()
  };
  const ok = saveJSON(`tsukiyomi:bookmark:${bookId}`, payload);
  saveJSON(`tsukiyomi:progress:${bookId}`, payload);
  if (!ok) {
    appState.startupMessage = "栞の保存に失敗しました（容量不足の可能性）";
  }
}

function buildAppViewerProfile() {
  return normalizeStoredViewerProfile({
    appVersion: APP_VERSION,
    displayMode: appState.settings.displayMode,
    writingMode: appState.settings.writingModePreference,
    fontSize: appState.settings.fontSize,
    lineHeight: appState.settings.lineHeight,
    letterSpacing: appState.settings.letterSpacing,
    wrapWidthPercent: appState.settings.wrapWidthPercent,
    fontFamilyPreference: appState.settings.fontFamilyPreference,
    pageColumns: appState.settings.pageColumns,
    lineNumbers: appState.settings.lineNumbers,
    viewportWidth: window.innerWidth || 0,
    viewportHeight: window.innerHeight || 0,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0
  });
}

function normalizeStoredViewerProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  return {
    appVersion: String(profile.appVersion || APP_VERSION).slice(0, 32),
    displayMode: normalizeStoredDisplayMode(profile.displayMode),
    writingMode: String(profile.writingMode || profile.writingModePreference || "vertical").slice(0, 16),
    fontSize: finiteNumber(profile.fontSize, 100),
    fontPx: finiteNumber(profile.fontPx, null),
    lineHeight: finiteNumber(profile.lineHeight, 1.8),
    lineHeightPx: finiteNumber(profile.lineHeightPx, null),
    letterSpacing: finiteNumber(profile.letterSpacing, 0),
    wrapWidthPercent: finiteNumber(profile.wrapWidthPercent, 100),
    fontFamilyPreference: String(profile.fontFamilyPreference || "system").slice(0, 32),
    pageColumns: profile.pageColumns === true,
    lineNumbers: profile.lineNumbers === true,
    viewportWidth: finiteInteger(profile.viewportWidth, 0),
    viewportHeight: finiteInteger(profile.viewportHeight, 0),
    screenWidth: finiteInteger(profile.screenWidth, 0),
    screenHeight: finiteInteger(profile.screenHeight, 0),
    pageIndex: finiteInteger(profile.pageIndex, null),
    pageCount: finiteInteger(profile.pageCount, null),
    charsPerLine: finiteInteger(profile.charsPerLine, null),
    linesPerPage: finiteInteger(profile.linesPerPage, null)
  };
}

function finiteNumber(value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 100) / 100;
}

function finiteInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function loadBookmark(bookId) {
  if (!bookId) return null;
  return loadJSON(`tsukiyomi:bookmark:${bookId}`, null) || loadJSON(`tsukiyomi:progress:${bookId}`, null);
}

function getBookmarkCandidate(bookId, book) {
  const savedBookmark = loadBookmark(bookId);
  if (isReadableProgress(savedBookmark)) return savedBookmark;

  const embeddedBookmark = book?.bookmark || book?.meta?.bookmark || book?.progress || book?.meta?.progress || null;
  if (isReadableProgress(embeddedBookmark)) return embeddedBookmark;

  return null;
}

function isReadableProgress(progress) {
  if (!progress || typeof progress !== "object") return false;
  if (Number(progress.progressPercent) > 0) return true;
  if (Number(progress.scrollTop) > 0) return true;
  if (Number(progress.scrollLeft) > 0) return true;
  if (Number(progress.pageIndex) > 0) return true;
  const chapterId = String(progress.chapterId || "").trim();
  return Boolean(chapterId && chapterId !== "chapter-001");
}

function captureCurrentReaderProgress() {
  const viewport = document.getElementById("readerViewport");
  if (!viewport) return {};
  const content = document.getElementById("bookContent");
  const mode = appState.settings?.displayMode || "paged";
  const progress = {};
  if (mode === "scroll" || mode === "scrolly") {
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    progress.scrollTop = viewport.scrollTop;
    progress.pageIndex = Math.round(viewport.scrollTop / Math.max(1, viewport.clientHeight));
    progress.progressPercent = maxTop > 0 ? Math.round((viewport.scrollTop / maxTop) * 100) : 100;
  } else {
    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const direction = content?.classList.contains("force-vertical") ? "rtl" : "ltr";
    const logicalLeft = direction === "rtl" ? Math.max(0, maxLeft - viewport.scrollLeft) : viewport.scrollLeft;
    progress.scrollLeft = logicalLeft;
    progress.pageIndex = Math.round(logicalLeft / Math.max(1, viewport.clientWidth));
    progress.progressPercent = maxLeft > 0 ? Math.round((logicalLeft / maxLeft) * 100) : 100;
  }
  return progress;
}

function clearCachedBookData() {
  try {
    localStorage.removeItem("tsukiyomi:lastOpened");
    localStorage.removeItem("tsukiyomi:lastBookCache");
  } catch (err) {
    // Cache cleanup is best-effort.
  }
}

async function tryRestoreLastBook() {
  const cached = loadJSON("tsukiyomi:lastBookCache", null);
  if (!cached || !cached.html || !Array.isArray(cached.toc)) return false;

  const restoreSourceType = await resolveRestoreSourceType(cached);
  if (!(await canRestoreCachedSource(restoreSourceType, cached))) {
    appState.startupMessage = "立ち読み用では外部書籍の自動復元を無効にしています";
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

  await applyBook(book);

  await render("reader");
  return true;
}

function applyTheme(theme) {
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
}

async function loadSiteConfig() {
  try {
    const res = await fetch("./config/site-config.json", { cache: "no-store" });
    if (!res.ok) return { ...DEFAULT_SITE_CONFIG };
    const config = await res.json();
    return normalizeSiteConfig(config);
  } catch (err) {
    return { ...DEFAULT_SITE_CONFIG };
  }
}

function normalizeSiteConfig(config) {
  return {
    ...DEFAULT_SITE_CONFIG,
    ...(config && typeof config === "object" ? config : {})
  };
}

function applySiteConfig(config) {
  appState.siteConfig = normalizeSiteConfig(config);
  configureAnalytics(appState.siteConfig);
  updateDocumentTitle();
  document.body.classList.toggle("site-mode-distribution", appState.siteConfig.mode === "distribution");
  document.body.classList.toggle("site-mode-development", appState.siteConfig.mode !== "distribution");
  applyDistributionGuards(appState.siteConfig);
}

async function loadReviewAuthStatus() {
  const endpoint = appState.siteConfig?.reviewAuthStatusEndpoint || DEFAULT_SITE_CONFIG.reviewAuthStatusEndpoint;
  try {
    const res = await fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin"
    });
    const payload = await readResponseJson(res);
    if (res.status === 404) {
      return { authRequired: false, authenticated: true };
    }
    if (!res.ok) {
      return {
        authRequired: true,
        authenticated: false,
        error: payload?.error || `認証状態を確認できません（HTTP ${res.status}）`
      };
    }

    const authRequired = payload?.authRequired === true;
    return {
      authRequired,
      authenticated: authRequired ? payload?.authenticated === true : true,
      email: payload?.email || "",
      status: payload?.status || "",
      expiresAt: payload?.expiresAt || ""
    };
  } catch (err) {
    return { authRequired: false, authenticated: true };
  }
}

function applySiteChrome() {
  const config = appState.siteConfig || DEFAULT_SITE_CONFIG;
  const siteName = document.getElementById("librarySiteName");
  if (siteName && config.siteName) siteName.textContent = config.siteName;
  const reviewAuthSiteName = document.getElementById("reviewAuthSiteName");
  if (reviewAuthSiteName && config.siteName) reviewAuthSiteName.textContent = config.siteName;

  updateDocumentTitle();
  applyReviewAuthBadge();
  applyCopyright(config);
  applyAnalyticsNotice(config);
  queueVersionBadge();
}

function updateDocumentTitle() {
  const baseTitle = appState.siteConfig?.siteName || DEFAULT_SITE_CONFIG.siteName;
  if (appState.reviewAuth?.authRequired === true) {
    const suffix = appState.reviewAuth?.authenticated === true ? "限定レビュー・認証中" : "限定レビュー";
    document.title = `${baseTitle} - ${suffix}`;
    return;
  }
  document.title = baseTitle;
}

function applyReviewAuthBadge() {
  const authRequired = appState.reviewAuth?.authRequired === true;
  const authenticated = appState.reviewAuth?.authenticated === true;
  const label = authenticated ? "限定レビュー・認証中" : "限定レビュー";
  document.querySelectorAll("[data-review-auth-badge]").forEach((badge) => {
    badge.hidden = !authRequired;
    badge.textContent = label;
  });
}

function applyCopyright(config) {
  const visible = config?.showCopyright !== false;
  const text = config?.copyright || DEFAULT_SITE_CONFIG.copyright;
  document.querySelectorAll("#copyrightFooter, .copyright-footer").forEach((el) => {
    el.textContent = visible ? text : "";
    el.hidden = !visible;
  });
}

function applyDistributionGuards(config) {
  const guardEnabled = config?.mode === "distribution" && config?.disableCopy === true;
  document.body.classList.toggle("distribution-mode", guardEnabled);
  if (distributionGuardsBound) return;

  const preventWhenDistribution = (event) => {
    const current = appState.siteConfig || DEFAULT_SITE_CONFIG;
    if (current.mode !== "distribution" || current.disableCopy !== true) return;
    event.preventDefault();
  };

  document.addEventListener("copy", preventWhenDistribution);
  document.addEventListener("contextmenu", preventWhenDistribution);
  document.addEventListener("dragstart", preventWhenDistribution);
  distributionGuardsBound = true;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function getRecommendedDefaultSettings() {
  return {
    ...DEFAULT_SETTINGS,
    displayMode: isMobileReadingDevice() ? "paged" : "scroll"
  };
}

function isMobileReadingDevice() {
  const width = Number(window.innerWidth) || 0;
  const height = Number(window.innerHeight) || 0;
  const shortSide = Math.min(width || Infinity, height || Infinity);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches || false;
  const narrowViewport = shortSide <= 640;
  return coarsePointer || narrowViewport;
}
function saveSettings(bookId, settings) {
  if (!bookId) return;
  const payload = buildSettingsPayload(settings);
  const ok = saveJSON(`tsukiyomi:settings:${bookId}`, payload);
  saveGlobalSettings(settings);
  if (!ok) {
    appState.startupMessage = "設定保存に失敗しました（容量不足の可能性）";
  }
}

function buildSettingsPayload(settings) {
  return {
    fontSize: Number(settings.fontSize) || 100,
    fontFamilyPreference: settings.fontFamilyPreference || "system",
    lineHeight: Number(settings.lineHeight) || 1.8,
    letterSpacing: Number(settings.letterSpacing) || 0,
    wrapWidthPercent: Number(settings.wrapWidthPercent) || 100,
    theme: settings.theme || "light",
    displayMode: normalizeStoredDisplayMode(settings.displayMode),
    tapInScroll: Boolean(settings.tapInScroll),
    wheelPaging: Boolean(settings.wheelPaging),
    writingModePreference: settings.writingModePreference || "vertical",
    structureAutoDetect: settings.structureAutoDetect !== false,
    pageColumns: settings.pageColumns === true,
    lineNumbers: settings.lineNumbers === true,
    pageTurnEffect: normalizePageTurnEffect(settings.pageTurnEffect),
    updatedAt: new Date().toISOString()
  };
}

function normalizeStoredDisplayMode(mode) {
  const raw = String(mode || "paged").toLowerCase();
  if (raw === "scroll" || raw === "scrollx" || raw === "scroll-x" || raw === "scrolly" || raw === "scroll-y") {
    return "scroll";
  }
  return "paged";
}

function saveGlobalSettings(settings) {
  const payload = buildSettingsPayload(settings);
  saveJSON("tsukiyomi:settings:global", payload);
  saveJSON("tsukiyomi:txtStructureAutoDetect", payload.structureAutoDetect);
}

function loadSettings(bookId) {
  if (!bookId) return null;
  return loadJSON(`tsukiyomi:settings:${bookId}`, null);
}

function loadGlobalSettings() {
  return loadJSON("tsukiyomi:settings:global", null);
}

function applyVersionBadge() {
  const showVersion = appState.siteConfig?.showVersion !== false;
  document.querySelectorAll("[data-version-info], .build-info").forEach((el) => {
    el.hidden = !showVersion;
  });

  const badge = document.getElementById("versionBadge");
  if (badge) badge.textContent = showVersion ? `v${APP_VERSION}` : "";

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
  if (sourceType === "manifest" || sourceType === "bundled") {
    return sourceType;
  }

  if (appState.siteConfig?.allowLocalImport !== false) {
    return sourceType || "cache";
  }

  // Compatibility path for caches created before sourceType/sourceData were stored.
  // If the cached title still matches a published manifest title, treat it as manifest-backed.
  if (!sourceType || sourceType === "cache") {
    const manifestTitles = await loadManifestBookTitles();
    if (manifestTitles.has(String(cached?.title || "").trim())) {
      return "manifest";
    }
  }

  return sourceType || "cache";
}

async function canRestoreCachedSource(sourceType, cached) {
  if (appState.siteConfig?.allowLocalImport !== false) return true;
  if (sourceType !== "manifest" && sourceType !== "bundled") return false;
  return isCachedBookStillPublished(cached);
}

async function loadManifestBookTitles() {
  const books = await loadPublishedManifestBooks();
  return new Set(
    books
      .map((entry) => String(entry?.title || "").trim())
      .filter(Boolean)
  );
}

async function isCachedBookStillPublished(cached) {
  const books = await loadPublishedManifestBooks();
  if (books.length === 0) return false;

  const sourceData = cached?.sourceData && typeof cached.sourceData === "object" ? cached.sourceData : {};
  const cachedId = String(sourceData.id || "").trim();
  const cachedPath = normalizeManifestPath(sourceData.path || "");
  const cachedTitle = String(cached?.title || "").trim();

  return books.some((entry) => {
    const entryId = String(entry?.id || "").trim();
    if (cachedId && entryId && cachedId === entryId) return true;

    const entryPath = normalizeManifestPath(entry?.path || "");
    if (cachedPath && entryPath && cachedPath === entryPath) return true;

    const entryTitle = String(entry?.title || "").trim();
    return Boolean(cachedTitle && entryTitle && cachedTitle === entryTitle);
  });
}

async function loadPublishedManifestBooks() {
  try {
    const manifestPath = appState.siteConfig?.booksManifest || DEFAULT_SITE_CONFIG.booksManifest;
    let res = await fetch(manifestPath, { cache: "no-store" });
    if (res.status === 404 && manifestPath !== DEFAULT_SITE_CONFIG.booksManifest) {
      res = await fetch(DEFAULT_SITE_CONFIG.booksManifest, { cache: "no-store" });
    }
    if (!res.ok) return [];
    const manifest = await res.json();
    const books = Array.isArray(manifest) ? manifest : Array.isArray(manifest?.books) ? manifest.books : [];
    return books.filter((entry) => entry?.published === true);
  } catch (err) {
    return [];
  }
}

function normalizeManifestPath(path) {
  return String(path || "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\.?\//, "/")
    .replace(/\/+/g, "/");
}

async function readResponseJson(res) {
  try {
    return await res.json();
  } catch (err) {
    return null;
  }
}

function normalizePageTurnEffect(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "flash" || raw === "slide" || raw === "shadow") return raw;
  return "none";
}

async function bootstrap() {
  applySiteConfig(await loadSiteConfig());
  appState.reviewAuth = await loadReviewAuthStatus();
  updateDocumentTitle();
  if (appState.reviewAuth.authRequired && !appState.reviewAuth.authenticated) {
    clearCachedBookData();
    await render("auth");
    return;
  }
  registerServiceWorker();
  if (appState.reviewAuth.authRequired) {
    clearCachedBookData();
    await render("library");
    return;
  }
  const restored = await tryRestoreLastBook();
  if (!restored) {
    render("library");
  }
}

bootstrap();
