import { error, json, safeText } from "./books.js";

export const REVIEW_ACCESS_KEY = "_tsukuyomi/review-access-list.json";
export const REVIEW_ACCESS_STATUSES = new Set(["pending", "applied", "muted", "revoked"]);

export async function readReviewAccessList(bucket) {
  const object = await bucket.get(REVIEW_ACCESS_KEY);
  if (!object) return { entries: [], updatedAt: "" };

  try {
    const parsed = JSON.parse(await object.text());
    return {
      entries: sanitizeReviewAccessEntries(parsed.entries),
      updatedAt: safeText(parsed.updatedAt, "")
    };
  } catch (err) {
    return { entries: [], updatedAt: "" };
  }
}

export async function writeReviewAccessList(bucket, entries) {
  const next = {
    entries: sanitizeReviewAccessEntries(entries),
    updatedAt: new Date().toISOString()
  };
  await bucket.put(REVIEW_ACCESS_KEY, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return next;
}

export async function getReviewAccessDecision(request, bucket, env) {
  if (!reviewAccessSoftBlockEnabled(env)) return { blocked: false, email: "", status: "" };

  const email = getAccessIdentityEmail(request);
  if (!email) return { blocked: false, email: "", status: "" };

  const list = await readReviewAccessList(bucket);
  const entry = list.entries.find((item) => item.email === email);
  const status = entry?.status || "";
  return {
    blocked: status === "muted" || status === "revoked",
    email,
    status
  };
}

export function reviewManifestSoftBlockedResponse() {
  return json([]);
}

export function reviewAssetSoftBlockedResponse() {
  return error("作品が見つかりません", 404);
}

export function sanitizeReviewAccessEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      const email = normalizeEmail(entry?.email);
      const name = safeText(entry?.name, "").slice(0, 80);
      const note = safeText(entry?.note, "").slice(0, 500);
      const status = normalizeReviewAccessStatus(entry?.status);
      const addedAt = normalizeDateTime(entry?.addedAt) || new Date().toISOString();
      const appliedAt = normalizeDateTime(entry?.appliedAt);
      const mutedAt = normalizeDateTime(entry?.mutedAt);
      const revokedAt = normalizeDateTime(entry?.revokedAt);

      if (!email && !name) return null;
      return { id: makeEntryId(email, name, addedAt), name, email, status, note, addedAt, appliedAt, mutedAt, revokedAt };
    })
    .filter(Boolean)
    .slice(0, 200);
}

export function normalizeReviewAccessStatus(value) {
  const status = safeText(value, "pending").toLowerCase();
  return REVIEW_ACCESS_STATUSES.has(status) ? status : "pending";
}

export function getAccessIdentityEmail(request) {
  const email = safeText(
    request.headers.get("cf-access-authenticated-user-email") ||
      request.headers.get("cf-access-user"),
    ""
  ).toLowerCase().slice(0, 160);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function reviewAccessSoftBlockEnabled(env) {
  return truthy(env?.TSUKUYOMI_REVIEW_ACCESS_SOFT_BLOCK || env?.REVIEW_ACCESS_SOFT_BLOCK);
}

function normalizeEmail(value) {
  const email = safeText(value, "").toLowerCase().slice(0, 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
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

function truthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
