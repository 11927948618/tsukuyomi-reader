const READER_ID_KEY = "tsukiyomi:analyticsReaderId";
const DEFAULT_ENDPOINT = "/api/analytics/event";
const PROGRESS_THRESHOLDS = [25, 50, 75];

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

export function startAnalyticsSession(book, siteConfig) {
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
    sentProgress: new Set(),
    finishSent: false
  };

  sendAnalyticsEvent("open", { progressPercent: 0, chapterId: "" });
}

export function trackAnalyticsProgress(book, progress) {
  if (!activeSession || activeSession.bookId !== getAnalyticsBookId(book)) return;
  if (!analyticsConfig.enabled || shouldSkipForDoNotTrack()) return;

  const percent = normalizePercent(progress?.progressPercent);
  if (percent == null) return;

  for (const threshold of PROGRESS_THRESHOLDS) {
    if (percent >= threshold && !activeSession.sentProgress.has(threshold)) {
      activeSession.sentProgress.add(threshold);
      sendAnalyticsEvent("progress", {
        progressPercent: threshold,
        chapterId: progress?.chapterId || ""
      });
    }
  }

  if (percent >= 95 && !activeSession.finishSent) {
    activeSession.finishSent = true;
    sendAnalyticsEvent("finish", {
      progressPercent: 100,
      chapterId: progress?.chapterId || ""
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
    chapterId: detail.chapterId || ""
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
