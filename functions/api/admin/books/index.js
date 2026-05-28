import {
  getBucket,
  json,
  error,
  requireAdmin,
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

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const catalog = await readCatalog(bucket);
  const books = catalog.books.map((book) => ({
    ...toPublicManifestEntry(book),
    contentKey: book.contentKey || "",
    coverKey: book.coverKey || ""
  }));
  const guard = await readUsageGuard(bucket, context.env);
  return json({ books, updatedAt: catalog.updatedAt || "", guard });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const form = await context.request.formData();
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
    return error("使用量ガードにより、新規公開は一時停止中です。非公開保存は可能です。", 403);
  }

  let contentKey = current.contentKey || "";
  let coverKey = current.coverKey || "";
  let format = current.format || "epub";

  if (bookFile && typeof bookFile.arrayBuffer === "function" && bookFile.size > 0) {
    const ext = extFromFile(bookFile, "epub");
    if (!["epub", "txt", "pdf"].includes(ext)) return error("本文ファイルはEPUB、TXT、PDFを選択してください");
    format = ext;
    contentKey = `works/${id}-${nowCompact}.${ext}`;
    if (current.contentKey && current.contentKey !== contentKey) staleKeys.push(current.contentKey);
    await bucket.put(contentKey, await bookFile.arrayBuffer(), {
      httpMetadata: { contentType: contentTypeForExt(ext) }
    });
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
  return json({ ok: true, book: toPublicManifestEntry(nextBook), cleanup });
}
