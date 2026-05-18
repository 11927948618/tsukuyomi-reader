import { getBucket, json, error, readCatalog, toPublicManifestEntry } from "../../_shared/books.js";
import { applyRateLimit } from "../../_shared/rate-limit.js";
import { readUsageGuard, publicManifestPausedResponse, usageGuardHeaders } from "../../_shared/usage-guard.js";

export async function onRequestGet(context) {
  const rateLimited = applyRateLimit(context.request, context.env, "manifest");
  if (rateLimited) return rateLimited;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const guard = await readUsageGuard(bucket, context.env);
  if (guard.publicationPaused) return publicManifestPausedResponse(guard);

  const catalog = await readCatalog(bucket);
  const books = catalog.books
    .filter((book) => book.published === true)
    .map(toPublicManifestEntry);

  return json(books, { headers: usageGuardHeaders(guard) });
}
