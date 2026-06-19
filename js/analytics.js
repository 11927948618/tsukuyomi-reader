const READER_ID_KEY = "tsukiyomi:analyticsReaderId";
const DEFAULT_ENDPOINT = "/api/analytics/event";
const PROGRESS_THRESHOLDS = [25, 50, 75];
const VIEWER_PROFILE_SCHEMA = 1;

let analyticsConfig = normalizeAnalyticsConfig(null);
let activeSession = null;

export function configureAnalytics(siteConfig) {
  analyticsConfig = normalizeAnalyticsConfig(siteConfig);
}

export function applyAnalyticsNotice(siteConfig) {
  const config = normalizeAnalyticsConfig(siteConfig);
  const visible = config.enabled && Boolean(config.notice);
  document.querySelectorAll("[data-analytics-notice]").forEach((el) => {
    el.textContent = visible ? config.notice : "";
    el.hidden = !visible;
  });
}

export function startAnalyticsSession(book, siteConfig, viewerProfile = null) {
  configureAnalytics(siteConfig);
  const bookId = getAnalyticsBookId(book);
  if (!canTrack(book, bookId)) {
    activeSession = null;
    return;
  }

  activeSession = {
    bookId,
    sourceType: getSourceType(book),
    sessionId: createId(),
    viewerProfile: normalizeViewerProfile(viewerProfile),
    sentProgress: new Set(),
    finishSent: false
  };

  sendAnalyticsEvent("open", { progressPercent: 0, chapterId: "", viewerProfile: activeSession.viewerProfile });
}

export function trackAnalyticsProgress(book, progress) {
  if (!activeSession || activeSession.bookId !== getAnalyticsBookId(book)) return;
  if (!analyticsConfig.enabled || shouldSkipForDoNotTrack()) return;

  const percent = normalizePercent(progress?.progressPercent);
  if (percent == null) return;
  const viewerProfile = normalizeViewerProfile(progress?.viewerProfile) || activeSession.viewerProfile;

  for (const threshold of PROGRESS_THRESHOLDS) {
    if (percent >= threshold && !activeSession.sentProgress.has(threshold)) {
      activeSession.sentProgress.add(threshold);
      sendAnalyticsEvent("progress", {
        progressPercent: threshold,
        chapterId: progress?.chapterId || "",
        viewerProfile
      });
    }
  }

  if (percent >= 95 && !activeSession.finishSent) {
    activeSession.finishSent = true;
    sendAnalyticsEvent("finish", {
      progressPercent: 100,
      chapterId: progress?.chapterId || "",
      viewerProfile
    });
  }
}

function sendAnalyticsEvent(eventType, detail = {}) {
  if (!activeSession || !analyticsConfig.enabled || shouldSkipForDoNotTrack()) return;

  const readerId = getOrCreateReaderId();
  if (!readerId) return;

  const payload = {
    eventType,
    bookId: activeSession.bookId,
    readerId,
    sessionId: activeSession.sessionId,
    sourceType: activeSession.sourceType,
    progressPercent: detail.progressPercent ?? null,
    chapterId: detail.chapterId || "",
    viewerProfile: normalizeViewerProfile(detail.viewerProfile) || activeSession.viewerProfile || null
  };
  const body = JSON.stringify(payload);

  try {
    const endpoint = analyticsConfig.endpoint;
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    }).catch(() => {});
  } catch (err) {
    // Analytics must never interrupt reading.
  }
}

function normalizeViewerProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  // Keep this compact: it is attached only to existing analytics events.
  return compactProfile({
    v: VIEWER_PROFILE_SCHEMA,
    app: normalizeProfileText(profile.app ?? profile.appVersion, 16),
    mode: normalizeProfileText(profile.mode ?? profile.displayMode, 8),
    wm: normalizeProfileText(profile.wm ?? profile.writingMode, 8),
    fs: normalizeProfileNumber(profile.fs ?? profile.fontSize),
    fpx: normalizeProfileNumber(profile.fpx ?? profile.fontPx),
    lh: normalizeProfileNumber(profile.lh ?? profile.lineHeight),
    lhpx: normalizeProfileNumber(profile.lhpx ?? profile.lineHeightPx),
    ls: normalizeProfileNumber(profile.ls ?? profile.letterSpacing),
    ww: normalizeProfileNumber(profile.ww ?? profile.wrapWidthPercent),
    font: normalizeProfileText(profile.font ?? profile.fontFamilyPreference, 16),
    cols: profile.cols === true || profile.pageColumns === true,
    nums: profile.nums === true || profile.lineNumbers === true,
    vw: normalizeProfileInteger(profile.vw ?? profile.viewportWidth),
    vh: normalizeProfileInteger(profile.vh ?? profile.viewportHeight),
    svw: normalizeProfileInteger(profile.svw ?? profile.screenWidth),
    svh: normalizeProfileInteger(profile.svh ?? profile.screenHeight),
    page: normalizeProfileInteger(profile.page ?? profile.pageIndex),
    pages: normalizeProfileInteger(profile.pages ?? profile.pageCount),
    cpl: normalizeProfileInteger(profile.cpl ?? profile.charsPerLine),
    lpp: normalizeProfileInteger(profile.lpp ?? profile.linesPerPage)
  });
}

function compactProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== null && value !== "" && value !== false)
  );
}

function normalizeProfileText(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
}

function normalizeProfileNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function normalizeProfileInteger(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}

function normalizeAnalyticsConfig(siteConfig) {
  const rawEndpoint = String(siteConfig?.analyticsEndpoint || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
  return {
    enabled: siteConfig?.analyticsEnabled === true,
    endpoint: new URL(rawEndpoint, window.location.href).toString(),
    notice: String(siteConfig?.analyticsNotice || "").trim(),
    respectDoNotTrack: siteConfig?.analyticsRespectDoNotTrack !== false
  };
}

function canTrack(book, bookId) {
  if (!analyticsConfig.enabled || !bookId || shouldSkipForDoNotTrack()) return false;
  const sourceType = getSourceType(book);
  return sourceType === "manifest" || sourceType === "bundled";
}

function shouldSkipForDoNotTrack() {
  if (!analyticsConfig.respectDoNotTrack) return false;
  return navigator.doNotTrack === "1" || window.doNotTrack === "1";
}

function getAnalyticsBookId(book) {
  const sourceData = book?.meta?.sourceData && typeof book.meta.sourceData === "object"
    ? book.meta.sourceData
    : {};
  return String(sourceData.id || sourceData.path || book?.title || "").trim().slice(0, 128);
}

function getSourceType(book) {
  return String(book?.meta?.sourceType || "").trim();
}

function getOrCreateReaderId() {
  try {
    const current = localStorage.getItem(READER_ID_KEY);
    if (current) return current;
    const next = createId();
    localStorage.setItem(READER_ID_KEY, next);
    return next;
  } catch (err) {
    return "";
  }
}

function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePercent(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}
