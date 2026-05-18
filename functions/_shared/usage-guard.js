import { json, error } from "./books.js";

export const USAGE_GUARD_KEY = "_tsukuyomi/usage-guard.json";

const DEFAULT_USAGE_GUARD = {
  checkedAt: "",
  source: "default",
  level: "ok",
  publicationPaused: false,
  newPublishDisabled: false,
  reason: "",
  metrics: {},
  thresholds: {}
};

const CACHE_TTL_MS = 60 * 1000;
const PAUSED_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedGuard = null;

export async function readUsageGuard(bucket, env, options = {}) {
  const envPaused = parseBoolean(env?.TSUKUYOMI_PUBLICATION_PAUSED || env?.PUBLICATION_PAUSED);
  if (envPaused) {
    return {
      ...DEFAULT_USAGE_GUARD,
      checkedAt: new Date().toISOString(),
      source: "environment",
      level: "paused",
      publicationPaused: true,
      newPublishDisabled: true,
      reason: "TSUKUYOMI_PUBLICATION_PAUSED is true."
    };
  }

  if (!bucket) return { ...DEFAULT_USAGE_GUARD };

  const now = Date.now();
  if (!options.forceRefresh && cachedGuard) {
    const ttl = cachedGuard.value.publicationPaused ? PAUSED_CACHE_TTL_MS : CACHE_TTL_MS;
    if (now - cachedGuard.fetchedAt < ttl) return cachedGuard.value;
  }

  try {
    const object = await bucket.get(USAGE_GUARD_KEY);
    const value = object ? normalizeUsageGuard(JSON.parse(await object.text())) : { ...DEFAULT_USAGE_GUARD };
    cachedGuard = { value, fetchedAt: now };
    return value;
  } catch (err) {
    const value = {
      ...DEFAULT_USAGE_GUARD,
      checkedAt: new Date().toISOString(),
      source: "usage-guard-read-error",
      reason: "usage-guard.json could not be read."
    };
    cachedGuard = { value, fetchedAt: now };
    return value;
  }
}

export function publicManifestPausedResponse(guard) {
  return json([], {
    headers: usageGuardHeaders(guard)
  });
}

export function publicAssetPausedResponse(guard) {
  return error("公開を一時停止しています。時間をおいて再度お試しください。", 503, {
    headers: {
      ...usageGuardHeaders(guard),
      "retry-after": "3600"
    }
  });
}

export function shouldBlockPublishing(guard, currentPublished, nextPublished) {
  if (!guard?.newPublishDisabled) return false;
  return nextPublished === true && currentPublished !== true;
}

export function usageGuardHeaders(guard) {
  if (!guard || guard.level === "ok") return {};
  return {
    "x-tsukuyomi-usage-guard": guard.level,
    "x-tsukuyomi-publication-paused": guard.publicationPaused ? "true" : "false",
    "x-tsukuyomi-new-publish-disabled": guard.newPublishDisabled ? "true" : "false"
  };
}

function normalizeUsageGuard(value) {
  const guard = value && typeof value === "object" ? value : {};
  const level = String(guard.level || "").trim() || "ok";
  return {
    ...DEFAULT_USAGE_GUARD,
    ...guard,
    level,
    publicationPaused: guard.publicationPaused === true,
    newPublishDisabled: guard.newPublishDisabled === true,
    metrics: guard.metrics && typeof guard.metrics === "object" ? guard.metrics : {},
    thresholds: guard.thresholds && typeof guard.thresholds === "object" ? guard.thresholds : {}
  };
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}
