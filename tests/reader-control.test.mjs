import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readReaderControl, updateReaderControl } from '../functions/_shared/reader-control.js';
import { onRequest } from '../functions/_middleware.js';
globalThis.crypto ||= webcrypto;
function store() {
  let raw = null, etag = 0;
  return {
    async get() { if (raw === null) return null; const text = raw; return { etag: String(etag), text: async () => text }; },
    async put(key, text, options) {
      if (options.onlyIf.etagMatches !== undefined && options.onlyIf.etagMatches !== String(etag)) return null;
      if (options.onlyIf.etagDoesNotMatch === '*' && raw !== null) return null;
      raw = text; etag++; return { etag: String(etag) };
    }
  };
}
test('pause revokes sessions; resume never restores the old generation', async () => {
  const bucket = store();
  const initial = await readReaderControl(bucket);
  assert.equal(initial.paused, false);
  const paused = await updateReaderControl(bucket, 'pause');
  assert.equal(paused.paused, true);
  assert.notEqual(paused.generation, initial.generation);
  const resumed = await updateReaderControl(bucket, 'resume');
  assert.equal(resumed.generation, paused.generation);
  assert.equal(resumed.paused, false);
  const revoked = await updateReaderControl(bucket, 'logout-all');
  assert.notEqual(revoked.generation, resumed.generation);
  assert.equal((await readReaderControl(bucket, { TSUKUYOMI_PUBLICATION_PAUSED: 'true' })).paused, true);
});
test('competing control writes cannot silently overwrite one another', async () => {
  const bucket = store();
  const results = await Promise.allSettled([updateReaderControl(bucket, 'pause'), updateReaderControl(bucket, 'resume')]);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
test('storage failure denies public APIs while leaving recovery accessible', async () => {
  const env = { BUCKET: { get: async () => { throw new Error('offline'); } } };
  for (const path of ['/api/books', '/api/books/id/content', '/api/apps/wanwan', '/apps/wanwan/index.html', '/api/review-auth/session']) {
    const res = await onRequest({ request: new Request(`https://example.org${path}`), env, next: () => new Response('open') });
    assert.equal(res.status, 503);
  }
  const res = await onRequest({ request: new Request('https://example.org/api/admin/review-access/control'), env, next: () => new Response('admin') });
  assert.equal(await res.text(), 'admin');
});
