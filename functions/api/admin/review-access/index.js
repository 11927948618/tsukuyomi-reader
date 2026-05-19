import { getBucket, json, error, requireAdmin } from "../../../_shared/books.js";
import { readReviewAccessList, writeReviewAccessList } from "../../../_shared/review-access.js";

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  return json(await readReviewAccessList(bucket));
}

export async function onRequestPut(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const payload = await context.request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return error("JSON body が必要です");

  const next = await writeReviewAccessList(bucket, payload.entries);
  return json({ ok: true, ...next });
}
