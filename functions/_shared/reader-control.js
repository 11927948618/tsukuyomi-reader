// Independent, uncached emergency control. A storage failure must never reopen delivery.
export const READER_CONTROL_KEY = '_tsukuyomi/reader-control.json';
export async function readReaderControl(bucket, env = {}) {
  const forced = /^(true|1|yes)$/i.test(String(env.TSUKUYOMI_PUBLICATION_PAUSED || env.PUBLICATION_PAUSED || ''));
  if (!bucket) throw new Error('Reader control storage unavailable');
  const object = await bucket.get(READER_CONTROL_KEY);
  const value = object ? JSON.parse(await object.text()) : {};
  if (typeof value !== 'object' || !value || Array.isArray(value)) throw new Error('Invalid reader control');
  if (value.generation !== undefined && typeof value.generation !== 'string') throw new Error('Invalid session generation');
  if (value.paused !== undefined && typeof value.paused !== 'boolean') throw new Error('Invalid pause state');
  return { generation: value.generation || '', paused: forced || value.paused === true, environmentPaused: forced, updatedAt: value.updatedAt || '' };
}
export async function updateReaderControl(bucket, action) {
  if (!['logout-all', 'pause', 'resume'].includes(action)) throw new Error('Unknown control action');
  // Conditional writes prevent a simultaneous resume from undoing a session revocation.
  const object = await bucket.get(READER_CONTROL_KEY);
  const current = object ? JSON.parse(await object.text()) : {};
  const next = { generation: current.generation || '', paused: current.paused === true, updatedAt: new Date().toISOString() };
  if (action === 'logout-all' || action === 'pause') next.generation = crypto.randomUUID();
  if (action === 'pause') next.paused = true;
  if (action === 'resume') next.paused = false;
  const result = await bucket.put(READER_CONTROL_KEY, JSON.stringify(next), {
    onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' }
  });
  if (!result) throw new Error('Concurrent control update; reload and retry');
  return next;
}
