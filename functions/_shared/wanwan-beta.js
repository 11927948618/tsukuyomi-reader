import { error, getBucket } from './books.js';
import { requireReviewPasswordAuth, reviewPasswordAuthEnabled } from './review-auth.js';
export const WANWAN_READER_ORIGIN = 'https://tsukuyomi-reader-tachiyomi.pages.dev';
export const WANWAN_PREFIX = '/apps/wanwan';
export async function authorizeWanwan(context) {
  if (new URL(context.request.url).origin !== WANWAN_READER_ORIGIN) return error('Not found', 404);
  if (!reviewPasswordAuthEnabled(context.env)) return error('地図ベータの認証設定が未完了です', 503);
  const bucket = getBucket(context.env);
  if (!bucket) return error('地図ベータを利用できません', 503);
  const auth = await requireReviewPasswordAuth(context.request, bucket, context.env);
  if (!auth.ok) return auth.response;
  if (!auth.authRequired || !auth.sessionId) return error('読者認証が必要です', 401);
  if (!context.env.WANWAN_BETA || typeof context.env.WANWAN_BETA.fetch !== 'function') return error('地図ベータは準備中です', 503);
  return null;
}
export function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.delete('Set-Cookie');
  return new Response(response.body, { status: response.status, headers });
}
