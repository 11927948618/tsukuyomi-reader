import { error, getBucket, json } from "../../_shared/books.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";
import {
  analyticsErrorResponse,
  getAccessAnalyticsEmail,
  getAnalyticsDb,
  normalizeAnalyticsText,
  normalizeProgressPercent,
  sha256Hex
} from "../../_shared/analytics.js";
import { recordLiteAnalytics } from "../../_shared/analytics-lite.js";
import {
  getReviewAuthAnalyticsEmail,
  recordReviewSessionActivity,
  requireReviewPasswordAuth,
  reviewPasswordAuthEnabled
} from "../../_shared/review-auth.js";

const EVENT_TYPES = new Set(["open", "progress", "finish"]);

export async function onRequestPost(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "analytics");
  if (rateLimited) return rateLimited;

  const db = getAnalyticsDb(context.env);
  const bucket = getBucket(context.env);
  if (!db && !bucket) return new Response(null, { status: 204 });
  if (!bucket && reviewPasswordAuthEnabled(context.env)) return error("R2 bucket binding が未設定です", 500);

  if (!isSameOriginRequest(context.request)) {
    return error("許可されていない送信元です", 403);
  }

  const reviewAuth = bucket
    ? await requireReviewPasswordAuth(context.request, bucket, context.env)
    : { ok: true, email: "" };
  if (!reviewAuth.ok) return reviewAuth.response;
  if (bucket) await recordReviewSessionActivity(bucket, context.request, reviewAuth, context.env, "analytics");

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
  const accessEmail =
    getAccessAnalyticsEmail(context.request, context.env) ||
    getReviewAuthAnalyticsEmail(reviewAuth, context.env);
  const readerIdHash = await sha256Hex(`${salt}:reader:${readerId}`);
  const userAgentHash = userAgent ? await sha256Hex(`${salt}:ua:${userAgent}`) : "";
  const accessEmailHash = accessEmail ? await sha256Hex(`${salt}:access-email:${accessEmail}`) : "";
  const now = new Date().toISOString();
  const progressPercent = normalizeProgressPercent(payload?.progressPercent ?? payload?.progress_percent);
  const chapterId = normalizeAnalyticsText(payload?.chapterId || payload?.chapter_id, 128);
  const sourceType = normalizeAnalyticsText(payload?.sourceType || payload?.source_type, 32);
  const country = normalizeAnalyticsText(context.request.cf?.country, 8);
  const viewerProfileJson = normalizeViewerProfileJson(payload?.viewerProfile || payload?.viewer_profile);

  if (db) {
    const eventId = crypto.randomUUID();
    const baseValues = [
      eventId,
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
    ];
    try {
      await insertD1Event(db, baseValues, accessEmail, accessEmailHash, viewerProfileJson);
    } catch (err) {
      if (viewerProfileJson && /no such column|has no column|viewer_profile_json/i.test(String(err?.message || err))) {
        try {
          await insertD1Event(db, baseValues, accessEmail, accessEmailHash, "");
          return json({ ok: true, source: "d1", viewerProfile: false, viewerProfileSkipped: "migration-required" });
        } catch (fallbackErr) {
          return analyticsErrorResponse(fallbackErr);
        }
      }
      if (accessEmail && /no such column|has no column|access_email/i.test(String(err?.message || err))) {
        try {
          await insertD1Event(db, baseValues, "", "", viewerProfileJson);
          return json({ ok: true, source: "d1", accessIdentity: false, accessIdentitySkipped: "migration-required" });
        } catch (fallbackErr) {
          if (viewerProfileJson && /no such column|has no column|viewer_profile_json/i.test(String(fallbackErr?.message || fallbackErr))) {
            try {
              await insertD1Event(db, baseValues, "", "", "");
              return json({
                ok: true,
                source: "d1",
                accessIdentity: false,
                accessIdentitySkipped: "migration-required",
                viewerProfile: false,
                viewerProfileSkipped: "migration-required"
              });
            } catch (legacyErr) {
              return analyticsErrorResponse(legacyErr);
            }
          }
          return analyticsErrorResponse(fallbackErr);
        }
      }
      return analyticsErrorResponse(err);
    }

    return json({ ok: true, source: "d1", accessIdentity: Boolean(accessEmail) });
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
      country,
      accessEmail,
      accessEmailHash,
      viewerProfileJson
    });
  } catch (err) {
    return new Response(null, { status: 204 });
  }

  return json({ ok: true, source: "r2-lite" });
}

function insertD1Event(db, baseValues, accessEmail, accessEmailHash, viewerProfileJson = "") {
  if (accessEmail && viewerProfileJson) {
    return db
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
          referer_path,
          access_email,
          access_email_hash,
          viewer_profile_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(...baseValues, accessEmail, accessEmailHash, viewerProfileJson)
      .run();
  }

  if (accessEmail) {
    return db
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
          referer_path,
          access_email,
          access_email_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(...baseValues, accessEmail, accessEmailHash)
      .run();
  }

  if (viewerProfileJson) {
    return db
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
          referer_path,
          viewer_profile_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(...baseValues, viewerProfileJson)
      .run();
  }

  return db
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
    .bind(...baseValues)
    .run();
}

function normalizeViewerProfileJson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const compact = compactViewerProfile({
    v: normalizeViewerInteger(value.v),
    app: normalizeAnalyticsText(value.app, 16),
    mode: normalizeAnalyticsText(value.mode, 8),
    wm: normalizeAnalyticsText(value.wm, 8),
    fs: normalizeViewerNumber(value.fs),
    fpx: normalizeViewerNumber(value.fpx),
    lh: normalizeViewerNumber(value.lh),
    lhpx: normalizeViewerNumber(value.lhpx),
    ls: normalizeViewerNumber(value.ls),
    ww: normalizeViewerNumber(value.ww),
    font: normalizeAnalyticsText(value.font, 16),
    cols: value.cols === true,
    nums: value.nums === true,
    vw: normalizeViewerInteger(value.vw),
    vh: normalizeViewerInteger(value.vh),
    svw: normalizeViewerInteger(value.svw),
    svh: normalizeViewerInteger(value.svh),
    page: normalizeViewerInteger(value.page),
    pages: normalizeViewerInteger(value.pages),
    cpl: normalizeViewerInteger(value.cpl),
    lpp: normalizeViewerInteger(value.lpp)
  });
  return JSON.stringify(compact).slice(0, 768);
}

function compactViewerProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== null && value !== "" && value !== false)
  );
}

function normalizeViewerNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function normalizeViewerInteger(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
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
