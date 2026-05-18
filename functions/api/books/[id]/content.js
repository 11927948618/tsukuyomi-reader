import { getBucket, error, readCatalog, serveR2Object, contentTypeForExt } from "../../../_shared/books.js";
import { readUsageGuard, publicAssetPausedResponse } from "../../../_shared/usage-guard.js";

export async function onRequestGet(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const guard = await readUsageGuard(bucket, context.env);
  if (guard.publicationPaused) return publicAssetPausedResponse(guard);

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const book = catalog.books.find((entry) => entry.id === id && entry.published === true);
  if (!book || !book.contentKey) return error("作品が見つかりません", 404);

  const object = await bucket.get(book.contentKey);
  const ext = book.contentKey.split(".").pop() || book.format || "";
  return serveR2Object(object, contentTypeForExt(ext));
}
