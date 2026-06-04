import {
  contentTypeForExt,
  error,
  getLimitedBucket,
  getPublicBucket,
  json,
  publicPromotionExpiresAt,
  readCatalog,
  requireAdmin,
  safeText,
  toPublicManifestEntry,
  writeCatalog
} from "../../../../_shared/books.js";
import { adminOperationActor, recordAdminOperationEvent } from "../../../../_shared/admin-operation-log.js";

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const limitedBucket = getLimitedBucket(context.env);
  if (!limitedBucket) return error("限定レビュー用 R2 bucket binding が未設定です", 500);

  const publicBucket = getPublicBucket(context.env);
  if (!publicBucket) return error("一般公開用 R2 bucket binding が未設定です", 500);

  const id = context.params.id;
  const now = new Date();
  const payload = await context.request.json().catch(() => ({}));

  const limitedCatalog = await readCatalog(limitedBucket);
  const source = limitedCatalog.books.find((entry) => entry.id === id);
  if (!source) return error("昇格元の限定レビュー作品が見つかりません", 404);
  if (!source.contentKey) return error("昇格元の本文ファイルが見つかりません", 400);

  const contentCopied = await copyR2Object(limitedBucket, publicBucket, source.contentKey, source.format || "");
  if (!contentCopied) return error("昇格元の本文ファイルをR2から読み込めません", 404);
  const coverCopied = source.coverKey
    ? await copyR2Object(limitedBucket, publicBucket, source.coverKey, "")
    : false;

  const publicCatalog = await readCatalog(publicBucket);
  const publicBooks = Array.isArray(publicCatalog.books) ? publicCatalog.books : [];
  const existingPublic = publicBooks.find((entry) => entry.id === id) || null;
  const publicExpiresAt = safeText(payload?.publicExpiresAt, "") || publicPromotionExpiresAt(context.env, publicPromotionBaseDate(existingPublic, now));
  const promoted = {
    ...source,
    published: true,
    publicExpiresAt,
    promotedFromId: source.id,
    promotedAt: now.toISOString(),
    savedAt: now.toISOString()
  };
  const nextBooks = publicBooks.some((entry) => entry.id === promoted.id)
    ? publicBooks.map((entry) => (entry.id === promoted.id ? { ...entry, ...promoted } : entry))
    : [...publicBooks, promoted];

  await writeCatalog(publicBucket, { books: nextBooks });
  await recordAdminOperationEvent(limitedBucket, {
    type: "book-promoted-public",
    result: "ok",
    actor: adminOperationActor(auth),
    bookId: source.id,
    title: source.title || "",
    reason: "admin",
    details: {
      publicExpiresAt,
      contentCopied,
      coverCopied
    }
  });

  return json({
    ok: true,
    book: toPublicManifestEntry(promoted),
    publicExpiresAt,
    copied: {
      content: contentCopied,
      cover: coverCopied
    }
  });
}

function publicPromotionBaseDate(existingPublic, now) {
  const expiresMs = Date.parse(existingPublic?.publicExpiresAt || "");
  if (Number.isFinite(expiresMs) && expiresMs > now.getTime()) return new Date(expiresMs);
  return now;
}

async function copyR2Object(sourceBucket, targetBucket, key, fallbackExt = "") {
  const object = await sourceBucket.get(key);
  if (!object) return false;
  const ext = String(key || "").split(".").pop() || fallbackExt;
  await targetBucket.put(key, await object.arrayBuffer(), {
    httpMetadata: { contentType: contentTypeForExt(ext) }
  });
  return true;
}
