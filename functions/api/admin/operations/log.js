import { error, resolveAdminBooksBucket, json, requireAdmin } from "../../../_shared/books.js";
import { readAdminOperationLog } from "../../../_shared/admin-operation-log.js";

export async function onRequestGet(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;

  const target = resolveAdminBooksBucket(context.env, new URL(context.request.url).searchParams.get("scope"));
  if (!target.bucket) return error(target.missingMessage, 500);

  return json({ ok: true, scope: target.scope, operationLog: await readAdminOperationLog(target.bucket) });
}
