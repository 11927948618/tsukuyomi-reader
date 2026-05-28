import { error, getBucket, json, requireAdmin } from "../../../_shared/books.js";
import { readAdminOperationLog } from "../../../_shared/admin-operation-log.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const bucket = getBucket(context.env);
  if (!bucket) return error("R2 bucket binding が未設定です", 500);

  return json({ ok: true, operationLog: await readAdminOperationLog(bucket) });
}
