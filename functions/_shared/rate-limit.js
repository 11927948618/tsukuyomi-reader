import { error } from "./books.js";

const DEFAULT_WINDOW_SECONDS = 10;
const DEFAULT_BLOCK_SECONDS = 30;
const DEFAULT_LIMITS = {
  manifest: 60,
  content: 12,
  cover: 60,
  analytics: 120
};

const buckets = new Map();
let nextCleanupAt = 0;

export function applyRateLimit(request, env, profile = "manifest") {
  if (parseBoolean(env?.TSUKUYOMI_RATE_LIMIT_DISABLED || env?.RATE_LIMIT_DISABLED)) {
    return null;
  }

  const config = getRateLimitConfig(env, profile);
  if (!config.limit || config.limit < 1) return null;

  const now = Date.now();
  cleanupExpired(now);

  const clientKey = getClientKey(request);
  const key = `${profile}:${clientKey}`;
  let entry = buckets.get(key);

  if (entry?.blockedUntil > now) {
    return rateLimitedResponse(profile, entry.blockedUntil, config.limit);
  }

  if (!entry || entry.resetAt <= now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
      blockedUntil: 0
    };
  }

  entry.count += 1;

  if (entry.count > config.limit) {
    entry.blockedUntil = now + config.blockMs;
    entry.resetAt = Math.max(entry.resetAt, entry.blockedUntil);
    buckets.set(key, entry);
    return rateLimitedResponse(profile, entry.blockedUntil, config.limit);
  }

  buckets.set(key, entry);
  return null;
}

export function getRateLimitConfig(env, profile = "manifest") {
  const normalizedProfile = String(profile || "manifest").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const defaultLimit = DEFAULT_LIMITS[profile] || DEFAULT_LIMITS.manifest;
  const limit = readPositiveInteger(
    env,
    [`TSUKUYOMI_RATE_LIMIT_${normalizedProfile}`, "TSUKUYOMI_RATE_LIMIT_DEFAULT"],
    defaultLimit
  );
  const windowSeconds = readPositiveInteger(
    env,
    [`TSUKUYOMI_RATE_LIMIT_${normalizedProfile}_WINDOW_SECONDS`, "TSUKUYOMI_RATE_LIMIT_WINDOW_SECONDS"],
    DEFAULT_WINDOW_SECONDS
  );
  const blockSeconds = readPositiveInteger(
    env,
    [`TSUKUYOMI_RATE_LIMIT_${normalizedProfile}_BLOCK_SECONDS`, "TSUKUYOMI_RATE_LIMIT_BLOCK_SECONDS"],
    DEFAULT_BLOCK_SECONDS
  );

  return {
    limit,
    windowMs: windowSeconds * 1000,
    blockMs: blockSeconds * 1000
  };
}

function rateLimitedResponse(profile, blockedUntil, limit) {
  const retryAfter = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));
  return error("アクセスが集中しています。少し時間をおいて再度お試しください。", 429, {
    headers: {
      "retry-after": String(retryAfter),
      "x-tsukuyomi-rate-limited": "true",
      "x-tsukuyomi-rate-limit-profile": profile,
      "x-tsukuyomi-rate-limit": String(limit)
    }
  });
}

function getClientKey(request) {
  const headers = request?.headers;
  const ip =
    headers?.get("cf-connecting-ip") ||
    headers?.get("true-client-ip") ||
    String(headers?.get("x-forwarded-for") || "").split(",", 1)[0].trim();
  return ip || "unknown";
}

function readPositiveInteger(env, names, fallback) {
  for (const name of names) {
    const value = Number.parseInt(env?.[name], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function cleanupExpired(now) {
  if (now < nextCleanupAt) return;
  nextCleanupAt = now + 60 * 1000;
  for (const [key, entry] of buckets) {
    if (!entry || entry.resetAt <= now) buckets.delete(key);
  }
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}
