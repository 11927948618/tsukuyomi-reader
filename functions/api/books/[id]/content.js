import { getBucket, error, readCatalog, serveR2Object, contentTypeForExt } from "../../../_shared/books.js";
import { applyRateLimit } from "../../../_shared/rate-limit.js";
import { getReviewAccessDecision, reviewAssetSoftBlockedResponse } from "../../../_shared/review-access.js";
import { recordReviewSessionActivity, requireReviewPasswordAuth } from "../../../_shared/review-auth.js";
import { readUsageGuard, publicAssetPausedResponse } from "../../../_shared/usage-guard.js";

export async function onRequestGet(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "content");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const reviewAuth = await requireReviewPasswordAuth(context.request, bucket, context.env);
  if (!reviewAuth.ok) return reviewAuth.response;
  await recordReviewSessionActivity(bucket, context.request, reviewAuth, context.env, "content");

  const guard = await readUsageGuard(bucket, context.env);
  if (guard.publicationPaused) return publicAssetPausedResponse(guard);

  const reviewAccess = await getReviewAccessDecision(context.request, bucket, context.env);
  if (reviewAccess.blocked) return reviewAssetSoftBlockedResponse();

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const book = catalog.books.find((entry) => entry.id === id && entry.published === true);
  if (!book || !book.contentKey) return error("作品が見つかりません", 404);

  const object = await bucket.get(book.contentKey);
  const ext = book.contentKey.split(".").pop() || book.format || "";
  return serveR2Object(object, contentTypeForExt(ext));
}
