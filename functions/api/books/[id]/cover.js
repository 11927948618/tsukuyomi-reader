import { getBucket, error, isBookVisible, readCatalog, serveR2Object, contentTypeForExt } from "../../../_shared/books.js";
import { applyRateLimit } from "../../../_shared/rate-limit.js";
import { getReviewAccessDecision, reviewAssetSoftBlockedResponse } from "../../../_shared/review-access.js";
import { recordReviewSessionActivity, requireReviewPasswordAuth } from "../../../_shared/review-auth.js";
import { readUsageGuard, publicAssetPausedResponse } from "../../../_shared/usage-guard.js";

export async function onRequestGet(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "cover");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const reviewAuth = await requireReviewPasswordAuth(context.request, bucket, context.env);
  if (!reviewAuth.ok) return reviewAuth.response;
  await recordReviewSessionActivity(bucket, context.request, reviewAuth, context.env, "cover");

  const guard = await readUsageGuard(bucket, context.env);
  if (guard.publicationPaused) return publicAssetPausedResponse(guard);

  const reviewAccess = await getReviewAccessDecision(context.request, bucket, context.env);
  if (reviewAccess.blocked) return reviewAssetSoftBlockedResponse();

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const book = catalog.books.find((entry) => entry.id === id && isBookVisible(entry));
  if (!book || !book.coverKey) return error("表紙が見つかりません", 404);

  const object = await bucket.get(book.coverKey);
  const ext = book.coverKey.split(".").pop() || "";
  return serveR2Object(object, contentTypeForExt(ext));
}
