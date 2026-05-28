export const ADMIN_OPERATION_LOG_KEY = "_tsukuyomi/admin-operation-log.json";

const DEFAULT_LOG_LIMIT = 300;

export async function readAdminOperationLog(bucket) {
  if (!bucket) return { events: [], updatedAt: "" };
  try {
    const object = await bucket.get(ADMIN_OPERATION_LOG_KEY);
    if (!object) return { events: [], updatedAt: "" };
    const parsed = JSON.parse(await object.text());
    return {
      events: sanitizeAdminOperationEvents(parsed?.events),
      updatedAt: safeText(parsed?.updatedAt, "")
    };
  } catch (err) {
    return { events: [], updatedAt: "" };
  }
}

export async function recordAdminOperationEvent(bucket, event) {
  if (!bucket) return null;
  try {
    const current = await readAdminOperationLog(bucket);
    const now = new Date().toISOString();
    const next = {
      events: sanitizeAdminOperationEvents([
        {
          createdAt: now,
          type: event?.type || "",
          result: event?.result || "ok",
          actor: safeText(event?.actor, "").slice(0, 160),
          bookId: safeText(event?.bookId, "").slice(0, 100),
          title: safeText(event?.title, "").slice(0, 160),
          reason: safeText(event?.reason, "").slice(0, 120),
          details: sanitizeDetails(event?.details)
        },
        ...current.events
      ]).slice(0, DEFAULT_LOG_LIMIT),
      updatedAt: now
    };
    await bucket.put(ADMIN_OPERATION_LOG_KEY, JSON.stringify(next, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
    return next;
  } catch (err) {
    return null;
  }
}

export function adminOperationActor(auth) {
  return safeText(auth?.email || auth?.actor || "", "") || "admin-token";
}

function sanitizeAdminOperationEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      const createdAt = normalizeDateTime(event?.createdAt);
      const type = safeText(event?.type, "").slice(0, 60);
      const result = safeText(event?.result, "").slice(0, 20);
      const actor = safeText(event?.actor, "").slice(0, 160);
      const bookId = safeText(event?.bookId, "").slice(0, 100);
      const title = safeText(event?.title, "").slice(0, 160);
      const reason = safeText(event?.reason, "").slice(0, 120);
      const details = sanitizeDetails(event?.details);
      if (!createdAt || !type) return null;
      return { createdAt, type, result, actor, bookId, title, reason, details };
    })
    .filter(Boolean)
    .slice(0, DEFAULT_LOG_LIMIT);
}

function sanitizeDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const details = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    const safeKey = safeText(key, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40);
    if (!safeKey) continue;
    if (typeof raw === "boolean") {
      details[safeKey] = raw;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      details[safeKey] = raw;
    } else {
      details[safeKey] = safeText(raw, "").slice(0, 160);
    }
  }
  return details;
}

function normalizeDateTime(value) {
  const raw = safeText(value, "");
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}
