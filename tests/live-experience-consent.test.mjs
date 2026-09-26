import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../api/live-experience.js', import.meta.url), 'utf8');
const { default: handler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
process.env.GHL_LIVE_EXPERIENCE_WEBHOOK_URL = 'https://example.invalid/hook';
const base = { name: 'Test', email: 'test@example.test', phone: '(209) 470-1307' };
async function run(body) {
 let payload, status;
 globalThis.fetch = async (_url, init) => { payload = JSON.parse(init.body); return { ok: true }; };
 await handler({ method: 'POST', body }, { status(n) { status=n; return this; }, json() {} });
 return { payload, status };
}
test('normalizes phone and records explicit opt-in', async () => {
 const {payload,status}=await run({...base,consent_sms:true});
 assert.equal(status,200); assert.equal(payload.phone,'+12094701307'); assert.equal(payload.consent_sms,true);
 assert.equal(payload.sms_consent_version,'solynx-live-sms-v1-2026-09-25');
 assert.equal(payload.sms_consent_source,'https://solynx.solutions/live-experience/');
 assert.ok(Date.parse(payload.sms_consent_recorded_at));
});
test('unchecked and older clients never acquire SMS consent', async () => {
 for(const consent of [undefined,false]) assert.equal((await run({...base,consent_sms:consent})).payload.consent_sms,false);
});
test('rejects string consent and malformed phone before webhook', async () => {
 for(const body of [{...base,consent_sms:'true'},{...base,phone:'+120947013207'},{...base,phone:'123'}]) {
 const result=await run(body); assert.equal(result.status,400); assert.equal(result.payload,undefined);
 }
});
