import { getBucket, json, error, requireAdmin } from "../../../_shared/books.js";
import { readReviewAccessList, writeReviewAccessList } from "../../../_shared/review-access.js";
import { readReviewAuthLog, readReviewAuthSummary, recordReviewAuthEvent } from "../../../_shared/review-auth.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const accessList = await readReviewAccessList(bucket);
  const authLog = await readReviewAuthLog(bucket);
  const authSummary = await readReviewAuthSummary(bucket);
  return json({ ...accessList, authLog, authSummary });
}

export async function onRequestPut(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return error("JSON body が必要です");

  const current = await readReviewAccessList(bucket);
  const next = await writeReviewAccessList(bucket, payload.entries, { preserveAuthFields: true });
  await recordReviewAccessChangeEvents(bucket, current.entries, next.entries);
  const authLog = await readReviewAuthLog(bucket);
  const authSummary = await readReviewAuthSummary(bucket);
  return json({ ok: true, ...next, authLog, authSummary });
}

async function recordReviewAccessChangeEvents(bucket, beforeEntries, afterEntries) {
  const before = mapReviewAccessEntries(beforeEntries);
  const after = mapReviewAccessEntries(afterEntries);
  const events = [];

  for (const [key, entry] of after.entries()) {
    const current = before.get(key);
    if (!current) {
      events.push({
        type: "review-access-added",
        email: entry.email,
        reviewerId: entry.reviewerId,
        reason: entry.status || "pending"
      });
      continue;
    }
    if ((current.status || "pending") !== (entry.status || "pending")) {
      events.push({
        type: "review-access-status-changed",
        email: entry.email || current.email,
        reviewerId: entry.reviewerId || current.reviewerId,
        reason: `${current.status || "pending"}->${entry.status || "pending"}`
      });
    }
  }

  for (const [key, entry] of before.entries()) {
    if (!after.has(key)) {
      events.push({
        type: "review-access-removed",
        email: entry.email,
        reviewerId: entry.reviewerId,
        reason: entry.status || "removed"
      });
    }
  }

  for (const event of events.slice(0, 20)) {
    await recordReviewAuthEvent(bucket, {
      ...event,
      result: "ok"
    });
  }
}

function mapReviewAccessEntries(entries) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = entry?.reviewerId || entry?.email || entry?.id || "";
    if (!key) continue;
    map.set(key, entry);
  }
  return map;
}
