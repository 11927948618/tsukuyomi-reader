import {
  json,
  error,
  getPublicBucket,
  isBookVisible,
  requireAdmin,
  resolveAdminBooksBucket,
  readCatalog,
  writeCatalog,
  deleteR2Keys,
  toPublicManifestEntry,
  sanitizeId,
  safeText,
  boolValue,
  extFromFile,
  contentTypeForExt
} from "../../../_shared/books.js";
import { readUsageGuard, shouldBlockPublishing } from "../../../_shared/usage-guard.js";
import { adminOperationActor, recordAdminOperationEvent } from "../../../_shared/admin-operation-log.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = resolveAdminBooksBucket(context.env, new URL(context.request.url).searchParams.get("scope"));
  const bucket = target.bucket;
  if (!bucket) return error(target.missingMessage, 500);

  const catalog = await readCatalog(bucket);
  const publicPromotionState = target.scope === "limited"
    ? await readPublicPromotionIndex(context.env)
    : { promotions: new Map(), error: "" };
  const publicPromotions = publicPromotionState.promotions;
  const books = catalog.books.map((book) => ({
    ...toPublicManifestEntry(book),
    contentKey: book.contentKey || "",
    coverKey: book.coverKey || "",
    scope: target.scope,
    publicPromotion: publicPromotions.get(book.id) || null
  }));
  const promotionSummary = summarizePublicPromotions(books, publicPromotionState.error);
  const guard = await readUsageGuard(bucket, context.env);
  return json({
    books,
    updatedAt: catalog.updatedAt || "",
    guard,
    scope: target.scope,
    scopeLabel: target.label,
    promotionSummary
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = resolveAdminBooksBucket(context.env, "limited");
  const bucket = target.bucket;
  if (!bucket) return error(target.missingMessage, 500);

  let form;
  try {
    form = await context.request.formData();
  } catch (err) {
    return error(`アップロード内容を読み取れませんでした: ${err?.message || String(err || "")}`, 400);
  }

  const title = safeText(form.get("title"), "");
  if (!title) return error("タイトルは必須です");

  const id = sanitizeId(form.get("id"), sanitizeId(title, `book-${Date.now()}`));
  const nowCompact = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const catalog = await readCatalog(bucket);
  const books = Array.isArray(catalog.books) ? catalog.books : [];
  const current = books.find((entry) => entry.id === id) || {};
  const staleKeys = [];

  const bookFile = form.get("bookFile");
  const cover = form.get("cover");
  const nextPublished = boolValue(form.get("published"));
  const guard = await readUsageGuard(bucket, context.env);
  if (shouldBlockPublishing(guard, current.published === true, nextPublished)) {
    await recordAdminOperationEvent(bucket, {
      type: "book-save-failed",
      result: "failed",
      actor: adminOperationActor(auth),
      bookId: id,
      title,
      reason: "usage-guard",
      details: { published: nextPublished }
    });
    return error("使用量ガードにより、新規公開は一時停止中です。非公開保存は可能です。", 403);
  }

  let contentKey = current.contentKey || "";
  let coverKey = current.coverKey || "";
  let format = current.format || "epub";
  let contentUploaded = false;
  let coverUploaded = false;

  try {
    if (bookFile && typeof bookFile.arrayBuffer === "function" && bookFile.size > 0) {
      const ext = extFromFile(bookFile, "epub");
      if (!["epub", "txt", "pdf"].includes(ext)) return error("本文ファイルはEPUB、TXT、PDFを選択してください");
      format = ext;
      contentKey = `works/${id}-${nowCompact}.${ext}`;
      if (current.contentKey && current.contentKey !== contentKey) staleKeys.push(current.contentKey);
      await bucket.put(contentKey, await bookFile.arrayBuffer(), {
        httpMetadata: { contentType: contentTypeForExt(ext) }
      });
      contentUploaded = true;
    }

    if (cover && typeof cover.arrayBuffer === "function" && cover.size > 0) {
      const ext = extFromFile(cover, "jpg");
      if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
        return error("表紙画像は jpg / png / webp を選択してください");
      }
      coverKey = `covers/${id}-${nowCompact}.${ext}`;
      if (current.coverKey && current.coverKey !== coverKey) staleKeys.push(current.coverKey);
      await bucket.put(coverKey, await cover.arrayBuffer(), {
        httpMetadata: { contentType: contentTypeForExt(ext) }
      });
      coverUploaded = true;
    }
  } catch (err) {
    await recordAdminOperationEvent(bucket, {
      type: "book-save-failed",
      result: "failed",
      actor: adminOperationActor(auth),
      bookId: id,
      title,
      reason: "r2-upload-failed",
      details: {
        message: err?.message || String(err || ""),
        bookFileSize: Number(bookFile?.size) || 0,
        coverSize: Number(cover?.size) || 0
      }
    });
    return error(`R2へのアップロードに失敗しました: ${err?.message || String(err || "")}`, 500);
  }

  if (!contentKey) return error("初回登録では本文ファイルが必須です");

  const nextBook = {
    ...current,
    id,
    title,
    author: safeText(form.get("author"), "hal the juggernaut"),
    description: safeText(form.get("description"), ""),
    format,
    contentKey,
    coverKey,
    published: nextPublished,
    updatedAt: safeText(form.get("updatedAt"), new Date().toISOString().slice(0, 10)),
    savedAt: new Date().toISOString()
  };

  const nextBooks = current.id
    ? books.map((entry) => (entry.id === id ? nextBook : entry))
    : [...books, nextBook];

  await writeCatalog(bucket, { books: nextBooks });
  const cleanup = await deleteR2Keys(bucket, staleKeys);
  await recordAdminOperationEvent(bucket, {
    type: current.id ? "book-updated" : "book-created",
    result: cleanup.failed.length ? "warn" : "ok",
    actor: adminOperationActor(auth),
    bookId: id,
    title: nextBook.title,
    reason: cleanup.failed.length ? "cleanup-partial" : "admin",
    details: {
      format,
      published: nextPublished,
      contentUploaded,
      coverUploaded,
      staleKeys: staleKeys.length,
      cleanupFailed: cleanup.failed.length
    }
  });
  return json({ ok: true, book: toPublicManifestEntry(nextBook), cleanup });
}

async function readPublicPromotionIndex(env) {
  const publicBucket = getPublicBucket(env);
  if (!publicBucket) return { promotions: new Map(), error: "public-bucket-missing" };

  try {
    const catalog = await readCatalog(publicBucket);
    const promotions = new Map((catalog.books || []).map((book) => [
      book.id,
      {
        published: book.published === true,
        visible: isBookVisible(book),
        publicExpiresAt: book.publicExpiresAt || "",
        promotedAt: book.promotedAt || ""
      }
    ]));
    return { promotions, error: "" };
  } catch (err) {
    return { promotions: new Map(), error: err?.message || String(err || "public-bucket-read-failed") };
  }
}

function summarizePublicPromotions(books, error = "") {
  const nowMs = Date.now();
  const promotions = books
    .map((book) => book.publicPromotion)
    .filter((promotion) => promotion?.published === true);
  const active = promotions.filter((promotion) => promotion.visible === true);
  const expired = promotions.filter((promotion) => promotion.visible !== true);
  const activeExpireTimes = active
    .map((promotion) => Date.parse(promotion.publicExpiresAt || ""))
    .filter((expiresMs) => Number.isFinite(expiresMs) && expiresMs > nowMs);
  const nearestExpiresAt = activeExpireTimes.length
    ? new Date(Math.min(...activeExpireTimes)).toISOString()
    : "";
  const nearestRemainingDays = nearestExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(nearestExpiresAt) - nowMs) / 86400000))
    : null;
  return {
    active: active.length,
    expired: expired.length,
    nearestExpiresAt,
    nearestRemainingDays,
    error
  };
}
