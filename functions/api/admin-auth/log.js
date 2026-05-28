import { error, getBucket, json, requireAdmin } from "../../_shared/books.js";
import { readAdminAuthLog } from "../../_shared/admin-auth.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  return json({ ok: true, authLog: await readAdminAuthLog(bucket) });
}
