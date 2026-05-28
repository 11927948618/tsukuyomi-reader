import { error, json, safeText } from "./books.js";

export const REVIEW_ACCESS_KEY = "_tsukuyomi/review-access-list.json";
export const REVIEW_ACCESS_STATUSES = new Set(["pending", "applied", "muted", "revoked"]);

const SERVER_AUTH_FIELDS = [
  "passwordHash",
  "passwordIssuedAt",
  "passwordExpiresAt",
  "passwordRevokedAt",
  "lastLoginAt",
  "lastFailedAt",
  "lastAuthAt",
  "loginLockedUntil",
  "failedLoginCount"
];

export async function readReviewAccessList(bucket, options = {}) {
  const object = await bucket.get(REVIEW_ACCESS_KEY);
  if (!object) {
    const empty = { entries: [], updatedAt: "" };
    return options.includeSecrets ? empty : publicReviewAccessList(empty);
  }

  try {
    const parsed = JSON.parse(await object.text());
    const list = {
      entries: sanitizeReviewAccessEntries(parsed.entries, { includeSecrets: true }),
      updatedAt: safeText(parsed.updatedAt, "")
    };
    return options.includeSecrets ? list : publicReviewAccessList(list);
  } catch (err) {
    const empty = { entries: [], updatedAt: "" };
    return options.includeSecrets ? empty : publicReviewAccessList(empty);
  }
}

export async function writeReviewAccessList(bucket, entries, options = {}) {
  let nextEntries = sanitizeReviewAccessEntries(entries, { includeSecrets: true });

  if (options.preserveAuthFields) {
    const current = await readReviewAccessList(bucket, { includeSecrets: true });
    nextEntries = mergeReviewAccessAuthFields(nextEntries, current.entries);
  }

  const next = {
    entries: nextEntries,
    updatedAt: new Date().toISOString()
  };
  await bucket.put(REVIEW_ACCESS_KEY, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" }
  });
  return options.includeSecrets ? next : publicReviewAccessList(next);
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

export function sanitizeReviewAccessEntries(entries, options = {}) {
  if (!Array.isArray(entries)) return [];

  const includeSecrets = options.includeSecrets === true;
  return entries
    .map((entry) => {
      const email = normalizeReviewAccessEmail(entry?.email);
      const name = safeText(entry?.name, "").slice(0, 80);
      const note = safeText(entry?.note, "").slice(0, 500);
      const status = normalizeReviewAccessStatus(entry?.status);
      const addedAt = normalizeDateTime(entry?.addedAt) || new Date().toISOString();
      const reviewerId = normalizeReviewAccessReviewerId(entry?.reviewerId) || (email || name ? makeReviewerId(email, name, addedAt) : "");
      const appliedAt = normalizeDateTime(entry?.appliedAt);
      const mutedAt = normalizeDateTime(entry?.mutedAt);
      const revokedAt = normalizeDateTime(entry?.revokedAt);
      const passwordHash = normalizePasswordHash(entry?.passwordHash);
      const passwordIssuedAt = normalizeDateTime(entry?.passwordIssuedAt);
      const passwordExpiresAt = normalizeDateTime(entry?.passwordExpiresAt);
      const passwordRevokedAt = normalizeDateTime(entry?.passwordRevokedAt);
      const lastLoginAt = normalizeDateTime(entry?.lastLoginAt);
      const lastFailedAt = normalizeDateTime(entry?.lastFailedAt);
      const lastAuthAt = normalizeDateTime(entry?.lastAuthAt);
      const loginLockedUntil = normalizeDateTime(entry?.loginLockedUntil);
      const failedLoginCount = normalizeCount(entry?.failedLoginCount);

      if (!email && !name && !reviewerId) return null;

      const base = {
        id: makeEntryId(email, name, addedAt),
        reviewerId,
        name,
        email,
        status,
        note,
        addedAt,
        appliedAt,
        mutedAt,
        revokedAt,
        passwordIssuedAt,
        passwordExpiresAt,
        passwordRevokedAt,
        lastLoginAt,
        lastFailedAt,
        lastAuthAt,
        loginLockedUntil,
        failedLoginCount
      };

      if (includeSecrets) {
        return { ...base, passwordHash };
      }

      return { ...base, hasPassword: Boolean(passwordHash) };
    })
    .filter(Boolean)
    .slice(0, 200);
}

export function publicReviewAccessList(list) {
  return {
    entries: sanitizeReviewAccessEntries(list?.entries, { includeSecrets: false }),
    updatedAt: safeText(list?.updatedAt, "")
  };
}

export function mergeReviewAccessAuthFields(entries, existingEntries) {
  const existing = sanitizeReviewAccessEntries(existingEntries, { includeSecrets: true });
  const byEmail = new Map(existing.filter((entry) => entry.email).map((entry) => [entry.email, entry]));
  const byReviewerId = new Map(existing.filter((entry) => entry.reviewerId).map((entry) => [entry.reviewerId, entry]));
  const byId = new Map(existing.filter((entry) => entry.id).map((entry) => [entry.id, entry]));

  return sanitizeReviewAccessEntries(entries, { includeSecrets: true }).map((entry) => {
    const current =
      (entry.email && byEmail.get(entry.email)) ||
      (entry.reviewerId && byReviewerId.get(entry.reviewerId)) ||
      (entry.id && byId.get(entry.id)) ||
      null;
    if (!current) return entry;

    const next = { ...entry };
    for (const field of SERVER_AUTH_FIELDS) {
      next[field] = current[field] || (field === "failedLoginCount" ? 0 : "");
    }
    return next;
  });
}

export function normalizeReviewAccessStatus(value) {
  const status = safeText(value, "pending").toLowerCase();
  return REVIEW_ACCESS_STATUSES.has(status) ? status : "pending";
}

export function normalizeReviewAccessEmail(value) {
  const email = safeText(value, "").toLowerCase().slice(0, 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeReviewAccessReviewerId(value) {
  const id = safeText(value, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return id || "";
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

function normalizePasswordHash(value) {
  const text = safeText(value, "").slice(0, 512);
  if (!text) return "";
  return /^pbkdf2-sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

function normalizeDateTime(value) {
  const raw = safeText(value, "");
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(9999, Math.floor(number)));
}

function makeEntryId(email, name, addedAt) {
  const source = email || name || addedAt || `${Date.now()}`;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `reviewer-${Date.now()}`;
}

function makeReviewerId(email, name, addedAt) {
  const source = `${email || ""}:${name || ""}:${addedAt || ""}`;
  const hash = hashText(source || `${Date.now()}`);
  return `rv-${hash.slice(0, 8)}`;
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function truthy(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
