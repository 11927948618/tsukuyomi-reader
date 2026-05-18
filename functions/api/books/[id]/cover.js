import { getBucket, error, readCatalog, serveR2Object, contentTypeForExt } from "../../../_shared/books.js";
import { applyRateLimit } from "../../../_shared/rate-limit.js";
import { readUsageGuard, publicAssetPausedResponse } from "../../../_shared/usage-guard.js";

export async function onRequestGet(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "cover");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const guard = await readUsageGuard(bucket, context.env);
  if (guard.publicationPaused) return publicAssetPausedResponse(guard);

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const book = catalog.books.find((entry) => entry.id === id && entry.published === true);
  if (!book || !book.coverKey) return error("表紙が見つかりません", 404);

  const object = await bucket.get(book.coverKey);
  const ext = book.coverKey.split(".").pop() || "";
  return serveR2Object(object, contentTypeForExt(ext));
}
