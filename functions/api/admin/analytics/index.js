import { error, getBucket, json, requireAdmin } from "../../../_shared/books.js";
import { analyticsDisabled, analyticsErrorResponse, getAnalyticsDb } from "../../../_shared/analytics.js";
import { liteAnalyticsToAdminPayload, readLiteAnalytics } from "../../../_shared/analytics-lite.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const db = getAnalyticsDb(context.env);
  if (!db) {
    const bucket = getBucket(context.env);
    if (!bucket) return analyticsDisabled("D1 analytics binding and R2 bucket binding are not configured.");
    const stats = await readLiteAnalytics(bucket);
    return json(liteAnalyticsToAdminPayload(stats));
  }

  try {
    const summary = await db
      .prepare(
        `WITH per_reader AS (
          SELECT
            book_id,
            reader_id_hash,
            MAX(COALESCE(progress_percent, 0)) AS max_progress
          FROM reader_events
          GROUP BY book_id, reader_id_hash
        ),
        progress AS (
          SELECT
            book_id,
            ROUND(AVG(max_progress), 1) AS avg_progress
          FROM per_reader
          GROUP BY book_id
        )
        SELECT
          e.book_id AS bookId,
          COUNT(*) AS events,
          SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END) AS opens,
          SUM(CASE WHEN e.event_type = 'finish' THEN 1 ELSE 0 END) AS finishes,
          COUNT(DISTINCT e.reader_id_hash) AS readers,
          MAX(e.created_at) AS lastEventAt,
          COALESCE(p.avg_progress, 0) AS avgProgress
        FROM reader_events e
        LEFT JOIN progress p ON p.book_id = e.book_id
        GROUP BY e.book_id
        ORDER BY lastEventAt DESC
        LIMIT 100`
      )
      .all();

    const recent = await db
      .prepare(
        `SELECT
          created_at AS createdAt,
          event_type AS eventType,
          book_id AS bookId,
          progress_percent AS progressPercent,
          chapter_id AS chapterId,
          country
        FROM reader_events
        ORDER BY created_at DESC
        LIMIT 30`
      )
      .all();

    const reviewers = await readAccessReviewers(db);

    return json({
      enabled: true,
      source: "d1",
      summary: Array.isArray(summary.results) ? summary.results : [],
      recent: Array.isArray(recent.results) ? recent.results : [],
      reviewers
    });
  } catch (err) {
    return analyticsErrorResponse(err);
  }
}

async function readAccessReviewers(db) {
  try {
    const result = await db
      .prepare(
        `SELECT
          access_email AS reviewerEmail,
          book_id AS bookId,
          COUNT(*) AS events,
          SUM(CASE WHEN event_type = 'open' THEN 1 ELSE 0 END) AS opens,
          SUM(CASE WHEN event_type = 'finish' THEN 1 ELSE 0 END) AS finishes,
          MAX(COALESCE(progress_percent, 0)) AS maxProgress,
          MAX(created_at) AS lastEventAt
        FROM reader_events
        WHERE access_email IS NOT NULL AND access_email != ''
        GROUP BY access_email, book_id
        ORDER BY lastEventAt DESC
        LIMIT 200`
      )
      .all();
    return Array.isArray(result.results) ? result.results : [];
  } catch (err) {
    return [];
  }
}
