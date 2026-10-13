import { json } from '../../_shared/books.js';
import { authorizeWanwan } from '../../_shared/wanwan-beta.js';
export async function onRequestGet(context) {
  const denied = await authorizeWanwan(context);
  if (denied) return denied;
  return json({ title: 'わんわん地図帳 ベータ版', description: 'わんこと地理を学ぼう。ベータ版は内容を更新していきます。', url: '/apps/wanwan/', buttonLabel: '開く' });
}
