import { getBucket, error } from './_shared/books.js';
import { readReaderControl } from './_shared/reader-control.js';
export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  // The admin and static recovery UI remain available, including during a pause.
  const protectedPath = /^\/api\/(books(?:\/|$)|apps(?:\/|$)|review-auth(?:\/|$))/.test(path) || /^\/apps\//.test(path);
  if (!protectedPath) return context.next();
  try {
    const control = await readReaderControl(getBucket(context.env), context.env);
    if (control.paused) return error('配信を一時停止しています', 503);
  } catch { return error('配信の安全確認ができません。時間をおいて再試行してください。', 503); }
  return context.next();
}
