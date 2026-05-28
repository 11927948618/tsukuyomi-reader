import { getBucket, json, error, requireAdmin } from "../../../_shared/books.js";
import { readReviewAccessList, writeReviewAccessList } from "../../../_shared/review-access.js";
import { readReviewAuthLog, readReviewAuthSummary } from "../../../_shared/review-auth.js";

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

  const next = await writeReviewAccessList(bucket, payload.entries, { preserveAuthFields: true });
  return json({ ok: true, ...next });
}
