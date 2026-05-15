import { getBucket, error, readCatalog, serveR2Object, contentTypeForExt } from "../../../_shared/books.js";

export async function onRequestGet(context) {
  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  const id = context.params.id;
  const catalog = await readCatalog(bucket);
  const book = catalog.books.find((entry) => entry.id === id && entry.published === true);
  if (!book || !book.coverKey) return error("表紙が見つかりません", 404);

  const object = await bucket.get(book.coverKey);
  const ext = book.coverKey.split(".").pop() || "";
  return serveR2Object(object, contentTypeForExt(ext));
}
