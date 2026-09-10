import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const env = new Map();
globalThis.Deno = { env: { get: name => env.get(name) }, serve() {} };
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64');
const root = new URL('../supabase/store/functions/', import.meta.url);
const sharedSource = readFileSync(new URL('_shared/mercadopago.ts', root), 'utf8')
  .replace('npm:@supabase/supabase-js@2.109.0', pathToFileURL(require.resolve('@supabase/supabase-js')).href);
const sharedUrl = compile(sharedSource);
const shared = await import(sharedUrl);
const loadHandler = async name => (await import(compile(readFileSync(new URL(`${name}/index.ts`, root), 'utf8')
  .replace('../_shared/mercadopago.ts', sharedUrl)))).handler;
const subscription = await loadHandler('mercadopago-subscription');
const webhook = await loadHandler('mercadopago-webhook');

beforeEach(() => {
  env.clear();
  env.set('SUPABASE_URL', 'https://store.test'); env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  globalThis.fetch = async () => { throw new Error('Unexpected network call'); };
});
after(() => { globalThis.fetch = originalFetch; delete globalThis.Deno; });
const local = { id: '10000000-0000-4000-8000-000000000001', amount_cents: 5000, currency: 'BRL', frequency: 1, preapproval_id: 'mp123' };
const remote = { id: 'mp123', external_reference: local.id, application_id: shared.applicationId, collector_id: 123,
  status: 'authorized', last_modified: '2026-09-10T01:00:00Z', auto_recurring: { transaction_amount: 50, currency_id: 'BRL', frequency: 1, frequency_type: 'months' } };
const payment = { id: 999, collector_id: 123, status: 'approved', currency_id: 'BRL', transaction_amount: 50,
  date_approved: '2026-09-10T01:00:00Z', date_last_updated: '2026-09-10T01:00:00Z', live_mode: true };
const signedRequest = (id = 'mp123', overrides = {}) => {
  const signature = createHmac('sha256', 'test-secret').update(`id:${id.toLowerCase()};request-id:request1;ts:1704908010;`).digest('hex');
  return new Request(`https://store.test/webhook?data.id=${id}`, { method: 'POST',
    headers: { 'x-signature': `ts=1704908010,v1=${signature}`, 'x-request-id': 'request1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'subscription_preapproval', data: { id }, ...overrides }) });
};

test('webhook signature accepts official HMAC manifest and rejects a changed resource', async () => {
  assert.equal(await shared.verifySignature(signedRequest('MP123'), 'test-secret'), true);
  assert.equal(await shared.verifySignature(signedRequest(), 'wrong-secret'), false);
  const valid = signedRequest();
  assert.equal(await shared.verifySignature(new Request('https://store.test/webhook?data.id=other', { headers: valid.headers }), 'test-secret'), false);
});
test('webhook rejects unsigned and mismatched notifications before any provider or DB access', async () => {
  env.set('MERCADO_PAGO_WEBHOOK_SECRET', 'test-secret');
  assert.equal((await webhook(new Request('https://store.test/webhook', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await webhook(signedRequest('mp123', { data: { id: 'other' } }))).status, 400);
});
test('missing webhook secret fails closed', async () => {
  assert.equal((await webhook(signedRequest())).status, 503);
  assert.equal(shared.configured(), false);
});
test('subscription requires a logged-in user and rejects a foreign origin', async () => {
  assert.equal((await subscription(new Request('https://store.test/subscription', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await subscription(new Request('https://store.test/subscription', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }))).status, 403);
});
test('a logged-in member without billing permission cannot start or cancel a subscription', async () => {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'user@example.test' });
    if (url.includes('/account_members?')) return Response.json({ role: 'member', status: 'active' });
    if (url.includes('/accounts?')) return Response.json({ status: 'active' });
    if (url.includes('/member_permissions?')) return Response.json(null);
    throw new Error('Unauthorized downstream call');
  };
  for (const action of ['checkout', 'cancel']) {
    const response = await subscription(new Request('https://store.test/subscription', { method: 'POST',
      headers: { Authorization: 'Bearer user-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, accountId: local.id }) }));
    assert.equal(response.status, 403);
  }
  assert.equal(calls.some(url => url.includes('mercadopago.com')), false);
});
test('provider subscription must match app, account reference, price, currency and cycle', () => {
  assert.doesNotThrow(() => shared.assertSubscription(local, remote));
  for (const changes of [{ external_reference: 'other' }, { application_id: 'other' }, { id: 'other' },
    { auto_recurring: { ...remote.auto_recurring, transaction_amount: 1 } },
    { auto_recurring: { ...remote.auto_recurring, currency_id: 'USD' } },
    { auto_recurring: { ...remote.auto_recurring, frequency: 12 } }]) {
    assert.throws(() => shared.assertSubscription(local, { ...remote, ...changes }));
  }
});
test('test-mode, underpaid and wrong-collector payments cannot grant production access', () => {
  assert.doesNotThrow(() => shared.assertPayment(local, remote, payment));
  for (const changes of [{ live_mode: false }, { transaction_amount: 1 }, { collector_id: 987 }, { currency_id: 'USD' }, { date_approved: null }])
    assert.throws(() => shared.assertPayment(local, remote, { ...payment, ...changes }));
});
test('checkout redirect rejects other origins and non-HTTPS URLs', () => {
  assert.equal(shared.checkoutUrl('https://www.mercadopago.com.br/subscriptions/checkout?id=123'), 'https://www.mercadopago.com.br/subscriptions/checkout?id=123');
  for (const value of ['javascript:alert(1)', 'https://mercadopago.com.br.evil.test/', 'http://mercadopago.com.br/']) assert.throws(() => shared.checkoutUrl(value));
});
