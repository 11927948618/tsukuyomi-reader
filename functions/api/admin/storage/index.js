import { error, getBucket, json, requireAdmin } from "../../../_shared/books.js";
import { readUsageGuard } from "../../../_shared/usage-guard.js";
import { ANALYTICS_LITE_KEY } from "../../../_shared/analytics-lite.js";

const DEFAULT_FREE_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_SCAN_LIMIT = 10000;

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const scanLimit = normalizePositiveNumber(context.env?.TSUKUYOMI_STORAGE_SCAN_LIMIT, DEFAULT_SCAN_LIMIT);
  const freeBytes = normalizePositiveNumber(context.env?.TSUKUYOMI_R2_FREE_STORAGE_BYTES, DEFAULT_FREE_STORAGE_BYTES);
  const usage = await scanBucketUsage(bucket, scanLimit);
  const guard = await readUsageGuard(bucket, context.env);
  const remainingBytes = Math.max(0, freeBytes - usage.totalBytes);

  return json({
    checkedAt: new Date().toISOString(),
    storage: {
      freeTierBytes: freeBytes,
      usedBytes: usage.totalBytes,
      remainingBytes,
      usedPercent: freeBytes > 0 ? Math.round((usage.totalBytes / freeBytes) * 1000) / 10 : null,
      objectCount: usage.objectCount,
      truncated: usage.truncated,
      scanLimit
    },
    prefixes: usage.prefixes,
    knownObjects: usage.knownObjects,
    guard,
    notes: [
      "R2 binding から取得できるのは、このバケット内オブジェクトを走査した保存容量の概算です。",
      "Class A/B 操作数の月間実績と請求上の残量は Cloudflare R2 Metrics / Billing で確認してください。"
    ]
  });
}

async function scanBucketUsage(bucket, scanLimit) {
  const prefixes = {};
  const knownObjects = {
    analyticsLite: null
  };
  let cursor = undefined;
  let totalBytes = 0;
  let objectCount = 0;
  let truncated = false;

  do {
    const listed = await bucket.list({ cursor, limit: Math.min(1000, scanLimit - objectCount) });
    for (const object of listed.objects || []) {
      const size = Number(object.size) || 0;
      objectCount += 1;
      totalBytes += size;

      const prefix = prefixOf(object.key);
      if (!prefixes[prefix]) prefixes[prefix] = { bytes: 0, count: 0 };
      prefixes[prefix].bytes += size;
      prefixes[prefix].count += 1;

      if (object.key === ANALYTICS_LITE_KEY) {
        knownObjects.analyticsLite = {
          key: object.key,
          bytes: size,
          uploaded: object.uploaded ? new Date(object.uploaded).toISOString() : ""
        };
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
    if (objectCount >= scanLimit && cursor) {
      truncated = true;
      break;
    }
  } while (cursor);

  return { totalBytes, objectCount, prefixes, knownObjects, truncated };
}

function prefixOf(key) {
  const raw = String(key || "");
  const first = raw.split("/", 1)[0] || "(root)";
  return first;
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number;
}
