import {
  getBucket,
  json,
  error,
  requireAdmin,
  readCatalog,
  writeCatalog,
  toPublicManifestEntry,
  sanitizeId,
  safeText,
  boolValue,
  extFromFile,
  contentTypeForExt
} from "../../../_shared/books.js";

export async function onRequestGet(context) {
  const auth = requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const catalog = await readCatalog(bucket);
  const books = catalog.books.map((book) => ({
    ...toPublicManifestEntry(book),
    contentKey: book.contentKey || "",
    coverKey: book.coverKey || ""
  }));
  return json({ books, updatedAt: catalog.updatedAt || "" });
}

export async function onRequestPost(context) {
  const auth = requireAdmin(context.request, context.env);
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

  const epub = form.get("epub");
  const cover = form.get("cover");
  let contentKey = current.contentKey || "";
  let coverKey = current.coverKey || "";

  if (epub && typeof epub.arrayBuffer === "function" && epub.size > 0) {
    const ext = extFromFile(epub, "epub");
    if (ext !== "epub") return error("EPUBファイルを選択してください");
    contentKey = `works/${id}-${nowCompact}.epub`;
    await bucket.put(contentKey, await epub.arrayBuffer(), {
      httpMetadata: { contentType: "application/epub+zip" }
    });
  }

  if (cover && typeof cover.arrayBuffer === "function" && cover.size > 0) {
    const ext = extFromFile(cover, "jpg");
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
      return error("表紙画像は jpg / png / webp を選択してください");
    }
    coverKey = `covers/${id}-${nowCompact}.${ext}`;
    await bucket.put(coverKey, await cover.arrayBuffer(), {
      httpMetadata: { contentType: contentTypeForExt(ext) }
    });
  }

  if (!contentKey) return error("初回登録ではEPUBが必須です");

  const nextBook = {
    ...current,
    id,
    title,
    author: safeText(form.get("author"), "hal the juggernaut"),
    description: safeText(form.get("description"), ""),
    format: "epub",
    contentKey,
    coverKey,
    published: boolValue(form.get("published")),
    updatedAt: safeText(form.get("updatedAt"), new Date().toISOString().slice(0, 10)),
    savedAt: new Date().toISOString()
  };

  const nextBooks = current.id
    ? books.map((entry) => (entry.id === id ? nextBook : entry))
    : [...books, nextBook];

  await writeCatalog(bucket, { books: nextBooks });
  return json({ ok: true, book: toPublicManifestEntry(nextBook) });
}
