export const ANALYTICS_LITE_KEY = "_tsukuyomi/analytics-lite.json";

const DEFAULT_ANALYTICS_LITE = {
  updatedAt: "",
  source: "r2-lite",
  books: {},
  reviewers: {},
  recent: []
};

const DEFAULT_RECENT_LIMIT = 30;
const DEFAULT_READER_LIMIT_PER_BOOK = 1000;

export async function recordLiteAnalytics(bucket, event, options = {}) {
  if (!bucket || !event?.bookId) return null;

  const stats = await readLiteAnalytics(bucket);
  const now = event.createdAt || new Date().toISOString();
  const books = normalizeMap(stats.books);
  const book = normalizeBookStats(books[event.bookId]);
  const progress = normalizeProgress(event.progressPercent);

  book.events += 1;
  book.lastEventAt = now;
  if (event.eventType === "open") book.opens += 1;
  if (event.eventType === "finish") book.finishes += 1;
  if (event.eventType === "progress") book.progressEvents += 1;

  if (event.readerIdHash) {
    const readerLimit = Number(options.readerLimitPerBook) || DEFAULT_READER_LIMIT_PER_BOOK;
    const readerProgress = normalizeMap(book.readerProgress);
    const readerExists = Object.prototype.hasOwnProperty.call(readerProgress, event.readerIdHash);
    if (readerExists || Object.keys(readerProgress).length < readerLimit) {
      readerProgress[event.readerIdHash] = Math.max(Number(readerProgress[event.readerIdHash]) || 0, progress || 0);
    } else {
      book.readerProgressTruncated = true;
    }
    book.readerProgress = readerProgress;
  }

  const reviewers = normalizeMap(stats.reviewers);
  if (event.accessEmail) {
    const reviewer = normalizeReviewerStats(reviewers[event.accessEmail]);
    const reviewerBook = normalizeReviewerBookStats(reviewer.books[event.bookId]);
    reviewer.email = event.accessEmail;
    reviewer.emailHash = event.accessEmailHash || reviewer.emailHash || "";
    reviewer.lastEventAt = now;
    reviewerBook.events += 1;
    reviewerBook.lastEventAt = now;
    reviewerBook.maxProgress = Math.max(Number(reviewerBook.maxProgress) || 0, progress || 0);
    if (event.eventType === "open") reviewerBook.opens += 1;
    if (event.eventType === "finish") reviewerBook.finishes += 1;
    reviewer.books[event.bookId] = reviewerBook;
    reviewers[event.accessEmail] = reviewer;
  }

  books[event.bookId] = book;
  const recentLimit = Number(options.recentLimit) || DEFAULT_RECENT_LIMIT;
  const recent = [
    {
      createdAt: now,
      eventType: event.eventType || "",
      bookId: event.bookId || "",
      progressPercent: progress,
      chapterId: event.chapterId || "",
      country: event.country || "",
      accessEmail: event.accessEmail || ""
    },
    ...normalizeRecent(stats.recent)
  ].slice(0, recentLimit);

  const next = {
    ...DEFAULT_ANALYTICS_LITE,
    updatedAt: now,
    books,
    reviewers,
    recent
  };

  await bucket.put(ANALYTICS_LITE_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });

  return next;
}

export async function readLiteAnalytics(bucket) {
  if (!bucket) return { ...DEFAULT_ANALYTICS_LITE };
  try {
    const object = await bucket.get(ANALYTICS_LITE_KEY);
    if (!object) return { ...DEFAULT_ANALYTICS_LITE };
    const parsed = JSON.parse(await object.text());
    return normalizeLiteAnalytics(parsed);
  } catch (err) {
    return { ...DEFAULT_ANALYTICS_LITE };
  }
}

export function liteAnalyticsToAdminPayload(stats) {
  const normalized = normalizeLiteAnalytics(stats);
  const summary = Object.entries(normalized.books).map(([bookId, value]) => {
    const book = normalizeBookStats(value);
    const readerValues = Object.values(normalizeMap(book.readerProgress))
      .map((progress) => Number(progress) || 0);
    const readers = readerValues.length;
    const avgProgress = readers > 0
      ? Math.round((readerValues.reduce((sum, value) => sum + value, 0) / readers) * 10) / 10
      : 0;
    return {
      bookId,
      events: book.events,
      opens: book.opens,
      finishes: book.finishes,
      readers,
      lastEventAt: book.lastEventAt || "",
      avgProgress,
      truncated: book.readerProgressTruncated === true
    };
  }).sort((a, b) => String(b.lastEventAt || "").localeCompare(String(a.lastEventAt || "")));

  return {
    enabled: true,
    source: "r2-lite",
    updatedAt: normalized.updatedAt || "",
    summary,
    recent: normalizeRecent(normalized.recent),
    reviewers: reviewersToAdminRows(normalized.reviewers)
  };
}

function normalizeLiteAnalytics(value) {
  const stats = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_ANALYTICS_LITE,
    updatedAt: typeof stats.updatedAt === "string" ? stats.updatedAt : "",
    books: normalizeMap(stats.books),
    reviewers: normalizeReviewers(stats.reviewers),
    recent: normalizeRecent(stats.recent)
  };
}

function normalizeBookStats(value) {
  const book = value && typeof value === "object" ? value : {};
  return {
    events: Number(book.events) || 0,
    opens: Number(book.opens) || 0,
    finishes: Number(book.finishes) || 0,
    progressEvents: Number(book.progressEvents) || 0,
    lastEventAt: typeof book.lastEventAt === "string" ? book.lastEventAt : "",
    readerProgress: normalizeMap(book.readerProgress),
    readerProgressTruncated: book.readerProgressTruncated === true
  };
}

function normalizeReviewers(value) {
  const reviewers = normalizeMap(value);
  return Object.fromEntries(
    Object.entries(reviewers).map(([email, reviewer]) => [email, normalizeReviewerStats(reviewer)])
  );
}

function normalizeReviewerStats(value) {
  const reviewer = value && typeof value === "object" ? value : {};
  return {
    email: typeof reviewer.email === "string" ? reviewer.email : "",
    emailHash: typeof reviewer.emailHash === "string" ? reviewer.emailHash : "",
    lastEventAt: typeof reviewer.lastEventAt === "string" ? reviewer.lastEventAt : "",
    books: Object.fromEntries(
      Object.entries(normalizeMap(reviewer.books)).map(([bookId, book]) => [bookId, normalizeReviewerBookStats(book)])
    )
  };
}

function normalizeReviewerBookStats(value) {
  const book = value && typeof value === "object" ? value : {};
  return {
    events: Number(book.events) || 0,
    opens: Number(book.opens) || 0,
    finishes: Number(book.finishes) || 0,
    maxProgress: Number(book.maxProgress) || 0,
    lastEventAt: typeof book.lastEventAt === "string" ? book.lastEventAt : ""
  };
}

function reviewersToAdminRows(reviewers) {
  return Object.values(normalizeReviewers(reviewers))
    .flatMap((reviewer) =>
      Object.entries(reviewer.books).map(([bookId, book]) => ({
        reviewerEmail: reviewer.email || "",
        bookId,
        events: book.events,
        opens: book.opens,
        finishes: book.finishes,
        maxProgress: book.maxProgress,
        lastEventAt: book.lastEventAt || reviewer.lastEventAt || ""
      }))
    )
    .sort((a, b) => String(b.lastEventAt || "").localeCompare(String(a.lastEventAt || "")))
    .slice(0, 200);
}

function normalizeMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function normalizeRecent(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    createdAt: typeof row?.createdAt === "string" ? row.createdAt : "",
    eventType: typeof row?.eventType === "string" ? row.eventType : "",
    bookId: typeof row?.bookId === "string" ? row.bookId : "",
    progressPercent: normalizeProgress(row?.progressPercent),
    chapterId: typeof row?.chapterId === "string" ? row.chapterId : "",
    country: typeof row?.country === "string" ? row.country : "",
    accessEmail: typeof row?.accessEmail === "string" ? row.accessEmail : ""
  }));
}

function normalizeProgress(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}
