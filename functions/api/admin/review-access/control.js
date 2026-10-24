import { getBucket, json, error, requireAdmin } from '../../../_shared/books.js';
import { readReaderControl, updateReaderControl } from '../../../_shared/reader-control.js';
import { recordReviewAuthEvent } from '../../../_shared/review-auth.js';
export async function onRequest(context) {
  const auth = await requireAdmin(context.request, context.env);
  if (!auth.ok) return auth.response;
  const bucket = getBucket(context.env);
  try {
    if (context.request.method === 'GET') return json(await readReaderControl(bucket, context.env));
    if (context.request.method !== 'POST') return error('Method not allowed', 405);
    const payload = await context.request.json();
    if (!['logout-all', 'pause', 'resume'].includes(payload?.action)) return error('操作が不正です');
    await updateReaderControl(bucket, payload.action);
    await recordReviewAuthEvent(bucket, { type: `reader-control-${payload.action}`, result: 'ok', reason: 'admin' });
    return json({ ok: true, ...await readReaderControl(bucket, context.env) });
  } catch { return error('制御状態を更新・確認できません。再読み込みしてください。', 503); }
}
