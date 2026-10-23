import { error, getBucket, getLimitedBucket, json, requireAdmin } from '../../_shared/books.js';
import { adminAuthMode, recordAdminTokenCheck } from '../../_shared/admin-auth.js';
import { applyRateLimit } from '../../_shared/rate-limit.js';

export async function onRequestPost({ request, env }) {
  const limited = applyRateLimit(request, env, 'admin_auth_verify');
  if (limited) return limited;
  if (adminAuthMode(env) !== 'token') return error('現在はメール認証方式です', 400);
  const bucket = getBucket(env) || getLimitedBucket(env);
  if (!bucket) return error('R2 bucket binding が未設定です', 500);
  const auth = await requireAdmin(request, env);
  if (!auth.ok) {
    if (auth.status === 401) await recordAdminTokenCheck(bucket, false);
    return auth.response;
  }
  const logged = await recordAdminTokenCheck(bucket, true);
  return json({ ok: true, authenticated: true, logged: Boolean(logged) });
}
