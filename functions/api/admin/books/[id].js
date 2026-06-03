import {
  json,
  error,
  requireAdmin,
  resolveAdminBooksBucket,
  readCatalog,
  writeCatalog,
  deleteR2Keys,
  toPublicManifestEntry,
  safeText,
  boolValue
} from "../../../_shared/books.js";
import { readUsageGuard, shouldBlockPublishing } from "../../../_shared/usage-guard.js";
import { adminOperationActor, recordAdminOperationEvent } from "../../../_shared/admin-operation-log.js";

export async function onRequestPatch(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = resolveAdminBooksBucket(context.env, new URL(context.request.url).searchParams.get("scope"));
  const bucket = target.bucket;
  if (!bucket) return error(target.missingMessage, 500);

  const id = context.params.id;
  const patch = await context.request.json().catch(() => null);
  if (!patch || typeof patch !== "object") return error("JSON body が必要です");

  const catalog = await readCatalog(bucket);
  const books = Array.isArray(catalog.books) ? catalog.books : [];
  const index = books.findIndex((entry) => entry.id === id);
  if (index < 0) return error("作品が見つかりません", 404);

  const current = books[index];
  const nextPublished = patch.published == null ? current.published === true : boolValue(patch.published);
  const removeCover = boolValue(patch.removeCover);
  const guard = await readUsageGuard(bucket, context.env);
  if (shouldBlockPublishing(guard, current.published === true, nextPublished)) {
    await recordAdminOperationEvent(bucket, {
      type: "book-publish-failed",
      result: "failed",
      actor: adminOperationActor(auth),
      bookId: id,
      title: current.title || "",
      reason: "usage-guard",
      details: { fromPublished: current.published === true, toPublished: nextPublished }
    });
    return error("使用量ガードにより、新規公開は一時停止中です。非公開保存は可能です。", 403);
  }

  const next = {
    ...current,
    title: patch.title == null ? current.title : safeText(patch.title, current.title),
    author: patch.author == null ? current.author : safeText(patch.author, current.author),
    description: patch.description == null ? current.description : safeText(patch.description, ""),
    updatedAt: patch.updatedAt == null ? current.updatedAt : safeText(patch.updatedAt, current.updatedAt),
    coverKey: removeCover ? "" : current.coverKey,
    published: nextPublished,
    savedAt: new Date().toISOString()
  };

  const nextBooks = books.slice();
  nextBooks[index] = next;
  await writeCatalog(bucket, { books: nextBooks });
  const cleanup = await deleteR2Keys(bucket, removeCover ? [current.coverKey] : []);
  const type = removeCover
    ? "book-cover-removed"
    : current.published === nextPublished
      ? "book-metadata-updated"
      : "book-publish-changed";
  await recordAdminOperationEvent(bucket, {
    type,
    result: cleanup.failed.length ? "warn" : "ok",
    actor: adminOperationActor(auth),
    bookId: id,
    title: next.title || "",
    reason: cleanup.failed.length ? "cleanup-partial" : "admin",
    details: {
      fromPublished: current.published === true,
      toPublished: nextPublished,
      removeCover,
      cleanupFailed: cleanup.failed.length
    }
  });
  return json({ ok: true, book: toPublicManifestEntry(next), cleanup });
}

export async function onRequestDelete(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = resolveAdminBooksBucket(context.env, new URL(context.request.url).searchParams.get("scope"));
  const bucket = target.bucket;
  if (!bucket) return error(target.missingMessage, 500);

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const books = Array.isArray(catalog.books) ? catalog.books : [];
  const index = books.findIndex((entry) => entry.id === id);
  if (index < 0) return error("作品が見つかりません", 404);

  const removed = books[index];
  const nextBooks = books.filter((entry) => entry.id !== id);
  await writeCatalog(bucket, { books: nextBooks });
  const cleanup = await deleteR2Keys(bucket, [removed.contentKey, removed.coverKey]);
  await recordAdminOperationEvent(bucket, {
    type: "book-deleted",
    result: cleanup.failed.length ? "warn" : "ok",
    actor: adminOperationActor(auth),
    bookId: removed.id,
    title: removed.title || "",
    reason: cleanup.failed.length ? "cleanup-partial" : "admin",
    details: {
      contentKey: removed.contentKey || "",
      coverKey: removed.coverKey || "",
      cleanupFailed: cleanup.failed.length
    }
  });

  return json({
    ok: true,
    deleted: {
      id: removed.id,
      title: removed.title || ""
    },
    cleanup
  });
}
