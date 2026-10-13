import { error } from '../../_shared/books.js';
import { authorizeWanwan, privateResponse, WANWAN_PREFIX } from '../../_shared/wanwan-beta.js';
export async function onRequest(context) {
  const denied = await authorizeWanwan(context);
  if (denied) return denied;
  if (!['GET', 'HEAD'].includes(context.request.method)) return error('Method not allowed', 405);
  const url = new URL(context.request.url);
  if (url.pathname === WANWAN_PREFIX) return privateResponse(new Response(null, { status: 308, headers: { Location: `${WANWAN_PREFIX}/` } }));
  if (!url.pathname.startsWith(`${WANWAN_PREFIX}/`)) return error('Not found', 404);
  const path = url.pathname.slice(WANWAN_PREFIX.length);
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return error('Invalid path', 400); }
  if (decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded) || decoded.split('/').some(x => x === '.' || x === '..')) return error('Invalid path', 400);
  if (path === '/') {
    const html = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>わんわん地図帳 ベータ版</title><style>html,body{height:100%;margin:0;overscroll-behavior-y:none}body{display:flex;flex-direction:column;background:#101728;color:#fff;font-family:sans-serif}header{padding:12px;display:flex;gap:20px}a{color:#fff}iframe{flex:1;width:100%;border:0;min-height:0}</style><header><a href="/">コンテンツ一覧へ戻る</a><span>わんわん地図帳 ベータ版</span></header><iframe title="わんわん地図帳" src="/apps/wanwan/viewer/" allow="fullscreen"></iframe></html>';
    return privateResponse(new Response(context.request.method === 'HEAD' ? null : html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'" } }));
  }
  const upstream = new URL(context.request.url);
  upstream.pathname = path;
  const headers = new Headers();
  for (const name of ['accept', 'range', 'if-none-match', 'if-modified-since']) {
    const value = context.request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Reader cookies and viewer identity never leave this gateway.
  let response;
  try { response = await context.env.WANWAN_BETA.fetch(new Request(upstream, { method: context.request.method, headers, redirect: 'manual' })); }
  catch { return error('地図ベータを読み込めませんでした', 503); }
  if (response.headers.has('Location')) {
    const target = new URL(response.headers.get('Location'), upstream);
    if (target.origin !== upstream.origin) return error('Invalid redirect', 502);
    const rewritten = new Headers(response.headers);
    rewritten.set('Location', WANWAN_PREFIX + target.pathname + target.search + target.hash);
    response = new Response(response.body, { status: response.status, headers: rewritten });
  }
  return privateResponse(response);
}
