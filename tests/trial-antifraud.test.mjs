import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/store/migrations/20260911173000_harden_trial_cnpj_identity.sql', import.meta.url), 'utf8');
const activation = readFileSync(new URL('../components/TrialActivation.tsx', import.meta.url), 'utf8');

test('CNPJ is unique and consumed as a durable company trial identity', () => {
  assert.match(migration, /create unique index if not exists accounts_cnpj_unique/i);
  assert.match(migration, /create table if not exists private\.trial_identity_claims/i);
  assert.match(migration, /primary key \(app_id, company_hash\)/i);
  assert.match(migration, /unique \(app_id, owner_document_hash\)/i);
  assert.match(migration, /unique \(app_id, user_id\)/i);
});

test('direct and Mercado Pago trials share the same identity claim', () => {
  assert.match(migration, /claim_trial_identity\(target_account,target_app,uid,'direct',null\)/i);
  assert.match(migration, /claim_trial_identity\(s\.account_id,s\.app_id,uid,'mercadopago',s\.id\)/i);
});

test('legacy browser document cannot choose the server-side trial identity', () => {
  assert.match(migration, /create or replace function public\.start_app_trial\(target_account uuid,target_app text,document text\)/i);
  assert.match(migration, /select private\.start_app_trial\(target_account,target_app\)/i);
  assert.doesNotMatch(migration, /private\.start_app_trial\(target_account,target_app,document\)/i);
});

test('direct activation validates CNPJ and reserves network before starting trial', () => {
  const reservePosition = activation.indexOf('await reserveTrialNetwork(account.id, app)');
  const rpcPosition = activation.indexOf("client.rpc('start_app_trial'");
  assert.ok(reservePosition >= 0, 'network reservation must be called');
  assert.ok(rpcPosition > reservePosition, 'network must be reserved before RPC');
  assert.match(activation, /CNPJ da empresa/);
  assert.match(activation, /validCnpj\(cleanCnpj\)/);
  assert.doesNotMatch(activation, /CPF do responsável ou CNPJ da empresa/);
});
