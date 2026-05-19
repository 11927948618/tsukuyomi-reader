import { getBucket, json, error, requireAdmin, safeText } from "../../../_shared/books.js";

const REVIEW_ACCESS_KEY = "_tsukuyomi/review-access-list.json";
const ALLOWED_STATUSES = new Set(["pending", "applied", "revoked"]);

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const list = await readReviewAccessList(bucket);
  return json(list);
}

export async function onRequestPut(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return error("JSON body が必要です");

  const entries = sanitizeEntries(payload.entries);
  const next = {
    entries,
    updatedAt: new Date().toISOString()
  };
  await bucket.put(REVIEW_ACCESS_KEY, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return json({ ok: true, ...next });
}

async function readReviewAccessList(bucket) {
  const object = await bucket.get(REVIEW_ACCESS_KEY);
  if (!object) return { entries: [], updatedAt: "" };

  try {
    const parsed = JSON.parse(await object.text());
    return {
      entries: sanitizeEntries(parsed.entries),
      updatedAt: safeText(parsed.updatedAt, "")
    };
  } catch (err) {
    return { entries: [], updatedAt: "" };
  }
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      const email = normalizeEmail(entry?.email);
      const name = safeText(entry?.name, "").slice(0, 80);
      const note = safeText(entry?.note, "").slice(0, 500);
      const status = normalizeStatus(entry?.status);
      const addedAt = normalizeDateTime(entry?.addedAt) || new Date().toISOString();
      const appliedAt = normalizeDateTime(entry?.appliedAt);
      const revokedAt = normalizeDateTime(entry?.revokedAt);

      if (!email && !name) return null;
      return { id: makeEntryId(email, name, addedAt), name, email, status, note, addedAt, appliedAt, revokedAt };
    })
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeEmail(value) {
  const email = safeText(value, "").toLowerCase().slice(0, 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeStatus(value) {
  const status = safeText(value, "pending").toLowerCase();
  return ALLOWED_STATUSES.has(status) ? status : "pending";
}

function normalizeDateTime(value) {
  const raw = safeText(value, "");
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function makeEntryId(email, name, addedAt) {
  const source = email || name || addedAt || `${Date.now()}`;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `reviewer-${Date.now()}`;
}
