import { error, getBucket, json } from "../../_shared/books.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";
import {
  analyticsErrorResponse,
  getAnalyticsDb,
  normalizeAnalyticsText,
  normalizeProgressPercent,
  sha256Hex
} from "../../_shared/analytics.js";
import { recordLiteAnalytics } from "../../_shared/analytics-lite.js";

const EVENT_TYPES = new Set(["open", "progress", "finish"]);

export async function onRequestPost(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "analytics");
  if (rateLimited) return rateLimited;

  const db = getAnalyticsDb(context.env);
  const bucket = getBucket(context.env);
  if (!db && !bucket) return new Response(null, { status: 204 });

  if (!isSameOriginRequest(context.request)) {
    return error("許可されていない送信元です", 403);
  }

  let payload = null;
  try {
    payload = await context.request.json();
  } catch (err) {
    return error("JSON body が必要です", 400);
  }

  const eventType = normalizeAnalyticsText(payload?.eventType || payload?.event_type, 24);
  if (!EVENT_TYPES.has(eventType)) return error("未対応の読書ログ種別です", 400);

  const bookId = normalizeAnalyticsText(payload?.bookId || payload?.book_id, 128);
  const readerId = normalizeAnalyticsText(payload?.readerId || payload?.reader_id, 128);
  const sessionId = normalizeAnalyticsText(payload?.sessionId || payload?.session_id, 128);
  if (!bookId || !readerId || !sessionId) {
    return error("bookId / readerId / sessionId が必要です", 400);
  }

  const salt = normalizeAnalyticsText(context.env?.TSUKUYOMI_ANALYTICS_SALT || context.env?.ANALYTICS_SALT, 256);
  const userAgent = normalizeAnalyticsText(context.request.headers.get("user-agent"), 512);
  const readerIdHash = await sha256Hex(`${salt}:reader:${readerId}`);
  const userAgentHash = userAgent ? await sha256Hex(`${salt}:ua:${userAgent}`) : "";
  const now = new Date().toISOString();
  const progressPercent = normalizeProgressPercent(payload?.progressPercent ?? payload?.progress_percent);
  const chapterId = normalizeAnalyticsText(payload?.chapterId || payload?.chapter_id, 128);
  const sourceType = normalizeAnalyticsText(payload?.sourceType || payload?.source_type, 32);
  const country = normalizeAnalyticsText(context.request.cf?.country, 8);

  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO reader_events (
            id,
            created_at,
            event_type,
            book_id,
            reader_id_hash,
            session_id,
            progress_percent,
            chapter_id,
            source_type,
            user_agent_hash,
            country,
            referer_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          now,
          eventType,
          bookId,
          readerIdHash,
          sessionId,
          progressPercent,
          chapterId,
          sourceType,
          userAgentHash,
          country,
          refererPath(context.request)
        )
        .run();
    } catch (err) {
      return analyticsErrorResponse(err);
    }

    return json({ ok: true, source: "d1" });
  }

  try {
    await recordLiteAnalytics(bucket, {
      createdAt: now,
      eventType,
      bookId,
      readerIdHash,
      progressPercent,
      chapterId,
      sourceType,
      country
    });
  } catch (err) {
    return new Response(null, { status: 204 });
  }

  return json({ ok: true, source: "r2-lite" });
}

function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (err) {
    return false;
  }
}

function refererPath(request) {
  const referer = request.headers.get("referer");
  if (!referer) return "";
  try {
    const url = new URL(referer);
    return normalizeAnalyticsText(`${url.pathname}${url.search}`, 256);
  } catch (err) {
    return "";
  }
}
