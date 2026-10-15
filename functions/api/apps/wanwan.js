import { json } from '../../_shared/books.js';
import { authorizeWanwan } from '../../_shared/wanwan-beta.js';
export async function onRequestGet(context) {
  const denied = await authorizeWanwan(context);
  if (denied) return denied;
  let version = null;
  try {
    // Read the actual deployed app, rather than the source repository's next release.
    // Construct a fresh request: Reader cookies and authorization stay in Reader.
    const upstream = new URL('/viewer/app.js', context.request.url);
    const response = await context.env.WANWAN_BETA.fetch(new Request(upstream, {
      redirect: 'manual', signal: AbortSignal.timeout(3000),
      headers: { Accept: 'text/javascript', 'Cache-Control': 'no-cache' }
    }));
    if (response.ok) version = (await response.text()).match(/\bVERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/)?.[1] || null;
  } catch { /* Keep the app launch available when its version cannot be checked. */ }
  return json({ version, title: 'わんわん地図帳 ベータ版', description: 'わんこと地理を学ぼう。ベータ版は内容を更新していきます。', url: '/apps/wanwan/', buttonLabel: '開く' });
}
