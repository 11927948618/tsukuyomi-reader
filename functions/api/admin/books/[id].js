import {
  getBucket,
  json,
  error,
  requireAdmin,
  readCatalog,
  writeCatalog,
  toPublicManifestEntry,
  safeText,
  boolValue
} from "../../../_shared/books.js";
import { readUsageGuard, shouldBlockPublishing } from "../../../_shared/usage-guard.js";

export async function onRequestPatch(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const id = context.params.id;
  const patch = await context.request.json().catch(() => null);
  if (!patch || typeof patch !== "object") return error("JSON body が必要です");

  const catalog = await readCatalog(bucket);
  const books = Array.isArray(catalog.books) ? catalog.books : [];
  const index = books.findIndex((entry) => entry.id === id);
  if (index < 0) return error("作品が見つかりません", 404);

  const current = books[index];
  const nextPublished = patch.published == null ? current.published === true : boolValue(patch.published);
  const guard = await readUsageGuard(bucket, context.env);
  if (shouldBlockPublishing(guard, current.published === true, nextPublished)) {
    return error("使用量ガードにより、新規公開は一時停止中です。非公開保存は可能です。", 403);
  }

  const next = {
    ...current,
    title: patch.title == null ? current.title : safeText(patch.title, current.title),
    author: patch.author == null ? current.author : safeText(patch.author, current.author),
    description: patch.description == null ? current.description : safeText(patch.description, ""),
    updatedAt: patch.updatedAt == null ? current.updatedAt : safeText(patch.updatedAt, current.updatedAt),
    published: nextPublished,
    savedAt: new Date().toISOString()
  };

  const nextBooks = books.slice();
  nextBooks[index] = next;
  await writeCatalog(bucket, { books: nextBooks });
  return json({ ok: true, book: toPublicManifestEntry(next) });
}
