import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as tokenCheck } from '../functions/api/admin-auth/token-check.js';
import { onRequestGet as operations } from '../functions/api/admin/operations/log.js';
import { ADMIN_AUTH_LOG_KEY, readAdminAuthLog } from '../functions/_shared/admin-auth.js';
import { ADMIN_OPERATION_LOG_KEY } from '../functions/_shared/admin-operation-log.js';
import { splitAdminAuthEvents } from '../js/admin-log-view.js';
function bucket(initial={}) {
 const records=new Map(Object.entries(initial));return {records,async get(key){const value=records.get(key);return value==null?null:{async text(){return value}}},async put(key,value){records.set(key,value)}};
}
const headers = { authorization:'Bearer fixture-current-admin-token' };
const request = token => new Request('https://example.test/api/admin-auth/token-check',{method:'POST',headers:{authorization:`Bearer ${token}`}});
test('explicit token check records success and failure without logging submitted or configured secrets',async()=>{
 const b=bucket(),env={BOOKS_BUCKET:b,TSUKUYOMI_ADMIN_TOKEN:'fixture-current-admin-token',TSUKUYOMI_RATE_LIMIT_DISABLED:'true'};
 assert.equal((await tokenCheck({request:request('fixture-invalid-token'),env})).status,401);
 const response=await tokenCheck({request:request('fixture-current-admin-token'),env});
 assert.deepEqual(await response.json(),{ok:true,authenticated:true,logged:true});
 const events=(await readAdminAuthLog(b)).events;assert.equal(events.length,2);assert.equal(events[0].type,'token-checked');assert.equal(events[0].result,'ok');assert.equal(events[1].result,'failed');
 const stored=b.records.get(ADMIN_AUTH_LOG_KEY);assert.ok(!stored.includes('fixture-current-admin-token'));assert.ok(!stored.includes('fixture-invalid-token'));assert.ok(!stored.includes('authorization'));
});
test('logging failure is visible to caller; email authentication cannot be bypassed',async()=>{
 const env={BOOKS_BUCKET:{get(){throw Error('offline')},put(){throw Error('offline')}},TSUKUYOMI_ADMIN_TOKEN:'fixture-current-admin-token',TSUKUYOMI_RATE_LIMIT_DISABLED:'true'};
 assert.equal((await (await tokenCheck({request:request('fixture-current-admin-token'),env})).json()).logged,false);
 assert.equal((await tokenCheck({request:request('fixture-current-admin-token'),env:{...env,TSUKUYOMI_ADMIN_AUTH_MODE:'email_otp'}})).status,400);
});
test('operation log requires authentication and reads only selected bucket',async()=>{
 const limited=bucket({[ADMIN_OPERATION_LOG_KEY]:JSON.stringify({events:[{createdAt:'2026-10-23T00:00:00Z',type:'book-created',title:'limited-only'}]})});
 const publicBucket=bucket({[ADMIN_OPERATION_LOG_KEY]:JSON.stringify({events:[{createdAt:'2026-10-23T00:00:00Z',type:'book-created',title:'public-only'}]})});
 const env={TSUKUYOMI_ADMIN_TOKEN:'fixture-current-admin-token',TSUKUYOMI_LIMITED_BOOKS_BUCKET:limited,TSUKUYOMI_PUBLIC_BOOKS_BUCKET:publicBucket};
 assert.equal((await operations({request:new Request('https://example.test/api/admin/operations/log'),env})).status,401);
 for(const scope of ['limited','public']) {
  const data=await(await operations({request:new Request(`https://example.test/api/admin/operations/log?scope=${scope}`,{headers}),env})).json();
  assert.equal(data.scope,scope);assert.equal(data.operationLog.events[0].title,scope+'-only');
 }
});
test('only identified old OTP history is archived; current tokens and newer OTP remain visible',()=>{
 const old={type:'otp-send-failed',createdAt:'2026-05-29T06:31:00Z'},modern={type:'otp-send-failed',createdAt:'2026-10-23T01:00:00Z'},token={type:'token-checked',createdAt:'2026-05-29T06:31:00Z'},invalid={type:'otp-send-failed',createdAt:'invalid'};
 const snapshot=JSON.stringify([old,modern,token,invalid]);const result=splitAdminAuthEvents([old,modern,token,invalid]);
 assert.deepEqual(result.legacy,[old]);assert.deepEqual(result.current,[modern,token,invalid]);assert.equal(JSON.stringify([old,modern,token,invalid]),snapshot);
});
