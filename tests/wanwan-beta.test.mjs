import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/apps/wanwan/[[path]].js';
import { onRequestGet } from '../functions/api/apps/wanwan.js';
import { createReviewSession, REVIEW_AUTH_COOKIE } from '../functions/_shared/review-auth.js';

const origin = 'https://tsukuyomi-reader-tachiyomi.pages.dev';
async function fixture({ status = 'applied', authenticated = true, host = origin, path = '/apps/wanwan/viewer/', authEnabled = true, binding = true, upstream } = {}) {
  const entry = { email: 'reader@example.invalid', reviewerId: 'test-reader', status,
    passwordHash: 'pbkdf2-sha256$100000$c2FsdA$dGVzdA', passwordIssuedAt: new Date(Date.now() - 60000).toISOString() };
  const bucket = { async get() { return { async text() { return JSON.stringify({ entries: [entry] }); } }; } };
  let calls = 0;
  let forwarded;
  const env = { TSUKUYOMI_REVIEW_PASSWORD_AUTH: authEnabled ? 'true' : 'false',
    TSUKUYOMI_REVIEW_AUTH_SECRET: 'synthetic-test-signing-key', TSUKUYOMI_BOOKS_BUCKET: bucket };
  if (binding) env.WANWAN_BETA = { async fetch(request) { calls++; forwarded = request; return upstream || new Response('asset', { headers: { 'Set-Cookie': 'bad=1' } }); } };
  const session = await createReviewSession(entry, env);
  const headers = { Authorization: 'Bearer do-not-forward' };
  if (authenticated) headers.Cookie = `${REVIEW_AUTH_COOKIE}=${encodeURIComponent(session.token)}`;
  return { context: { request: new Request(host + path, { headers }), env },
    calls: () => calls, forwarded: () => forwarded };
}
test('anonymous requests cannot obtain any map resources', async () => {
  for (const path of ['/apps/wanwan/', '/apps/wanwan/viewer/', '/apps/wanwan/viewer/app.js', '/apps/wanwan/models/japan.glb', '/apps/wanwan/db/questions.json', '/apps/wanwan/research/lakes.geojson']) {
    const f = await fixture({ authenticated: false, path });
    assert.equal((await onRequest(f.context)).status, 401);
    assert.equal(f.calls(), 0);
  }
});
test('public Reader, disabled authentication and missing binding fail closed', async () => {
  for (const [options, status] of [[{host:'https://tsukuyomi-reader.pages.dev'},404], [{authEnabled:false},503], [{binding:false},503]]) {
    const f = await fixture(options);
    assert.equal((await onRequest(f.context)).status, status);
    assert.equal(f.calls(), 0);
  }
});
test('revoked, muted and pending viewers cannot obtain the map', async () => {
  for (const status of ['revoked', 'muted', 'pending']) {
    const f = await fixture({ status });
    assert.equal((await onRequest(f.context)).status, 403);
    assert.equal(f.calls(), 0);
  }
});
test('authenticated assets use a stripped path and never forward Reader credentials', async () => {
  const f = await fixture({ upstream: new Response('asset', { headers: {
    'Set-Cookie': 'bad=1', 'Content-Encoding': 'gzip', 'Content-Length': '100'
  } }) });
  const response = await onRequest(f.context);
  assert.equal(response.status, 200);
  assert.equal(new URL(f.forwarded().url).pathname, '/viewer/');
  assert.equal(f.forwarded().headers.has('Cookie'), false);
  assert.equal(f.forwarded().headers.has('Authorization'), false);
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(response.headers.has('Content-Encoding'), false);
  assert.equal(response.headers.has('Content-Length'), false);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});
test('launch page embeds the app and links back to the Reader list', async () => {
  const f = await fixture({ path:'/apps/wanwan/' });
  const response = await onRequest(f.context);
  const html = await response.text();
  assert.match(html, /href="\/"/);
  assert.match(html, /src="\/apps\/wanwan\/viewer\/"/);
  assert.equal(f.calls(), 0);
});
test('redirects stay within the authenticated prefix', async () => {
  const f = await fixture({ upstream:new Response(null,{status:308,headers:{Location:'/viewer/'}}) });
  assert.equal((await onRequest(f.context)).headers.get('Location'),'/apps/wanwan/viewer/');
  const external = await fixture({ upstream:new Response(null,{status:302,headers:{Location:'https://example.invalid/'}}) });
  assert.equal((await onRequest(external.context)).status,502);
});
test('catalog app is only advertised to authenticated readers on the limited site', async () => {
  const f = await fixture({ path:'/api/apps/wanwan' });
  assert.equal((await (await onRequestGet(f.context)).json()).url,'/apps/wanwan/');
  const denied = await fixture({ path:'/api/apps/wanwan', authenticated:false });
  assert.equal((await onRequestGet(denied.context)).status,401);
});
