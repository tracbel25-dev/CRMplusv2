import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

export type Json = Record<string, any>;
export const applicationId = '4059087158712728';
export const siteUrl = () => (Deno.env.get('STORE_SITE_URL') || 'https://crmplusv2.vercel.app').replace(/\/$/, '');
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function check(error: { message: string } | null) {
  if (error) { console.error('Billing database operation failed:', error.message); throw new HttpError(500, 'Não foi possível atualizar a assinatura. Tente novamente.'); }
}
export const configured = () => !!Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') && !!Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET');

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export async function mp(path: string, method = 'GET', body?: Json) {
  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) throw new HttpError(503, 'Pagamento em configuração.');
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mercado Pago request failed:', method, response.status, data?.message || data?.error || 'unknown');
    throw new HttpError(response.status >= 500 ? 502 : response.status,
      response.status === 401 || response.status === 403 ? 'Credencial do pagamento indisponível. Contate o suporte.' : 'O Mercado Pago não concluiu a solicitação. Tente novamente.');
  }
  return data as Json;
}

export function checkoutUrl(value: unknown): string {
  try {
    const url = new URL(String(value));
    if (url.protocol === 'https:' && ['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) return url.href;
  } catch { /* Reject unexpected redirects. */ }
  throw new HttpError(502, 'Link de pagamento inválido.');
}

export function hasSevenDayTrial(remote: Json) {
  const trial = remote?.auto_recurring?.free_trial;
  return Number(trial?.frequency) === 7 && trial?.frequency_type === 'days';
}

function correlatedSubscription(local: Json, remote: Json) {
  if (remote?.external_reference === local.id) return true;
  if (local.dedicated_trial_plan === true && local.preapproval_plan_id) {
    return String(remote?.preapproval_plan_id || '') === String(local.preapproval_plan_id);
  }
  return !!local.preapproval_plan_id
    && !!local.payer_email
    && String(remote?.preapproval_plan_id || '') === String(local.preapproval_plan_id)
    && normalizeEmail(remote?.payer_email) === normalizeEmail(local.payer_email);
}

export function assertSubscription(local: Json, remote: Json) {
  const recurring = remote.auto_recurring;
  if (String(remote.application_id) !== applicationId || !correlatedSubscription(local, remote) ||
    (local.preapproval_id && remote.id !== local.preapproval_id) || !remote.id ||
    !['pending', 'authorized', 'paused', 'cancelled'].includes(remote.status) ||
    Math.round(Number(recurring?.transaction_amount) * 100) !== local.amount_cents ||
    recurring?.currency_id !== local.currency || Number(recurring?.frequency) !== Number(local.frequency) ||
    recurring?.frequency_type !== 'months' || !remote.last_modified ||
    (local.preapproval_plan_id && remote.preapproval_plan_id !== local.preapproval_plan_id) ||
    (local.trial_requested === true && remote.status !== 'cancelled' && !hasSevenDayTrial(remote))) {
    throw new HttpError(409, 'Os dados da assinatura precisam de conferência pelo suporte.');
  }
}

export function assertPayment(local: Json, remote: Json, payment: Json) {
  if (String(payment.collector_id) !== String(remote.collector_id) ||
    payment.currency_id !== local.currency || Math.round(Number(payment.transaction_amount) * 100) !== local.amount_cents ||
    !payment.id || !payment.date_last_updated || (payment.status === 'approved' && !payment.date_approved) ||
    payment.live_mode !== true) throw new HttpError(409, 'Pagamento não corresponde à assinatura de produção.');
}

export async function applySnapshot(local: Json, remote: Json, payment?: Json) {
  assertSubscription(local, remote);
  if (payment) assertPayment(local, remote, payment);

  if (local.trial_requested === true && remote.status === 'authorized' && (!payment || payment.status !== 'approved')) {
    const trialEnds = String(remote.next_payment_date || '');
    if (!trialEnds || Number.isNaN(Date.parse(trialEnds))) throw new HttpError(409, 'O Mercado Pago não informou o fim do teste grátis.');
    const db = admin();
    const { data: accepted, error: trialError } = await db.rpc('mp_register_checkout_trial', {
      local_id: local.id,
      provider_payer_id: remote.payer_id == null ? '' : String(remote.payer_id),
      provider_card_id: remote.card_id == null ? '' : String(remote.card_id),
      trial_ends: trialEnds,
    });
    check(trialError);
    if (!accepted) {
      const cancelled = await mp(`/preapproval/${encodeURIComponent(remote.id)}`, 'PUT', { status: 'cancelled' });
      assertSubscription(local, cancelled);
      const { error: cancelSnapshotError } = await db.rpc('mp_apply_snapshot', {
        local_id: local.id, subscription: cancelled, payment: null,
      });
      check(cancelSnapshotError);
      return;
    }
  }

  const { error } = await admin().rpc('mp_apply_snapshot', {
    local_id: local.id, subscription: remote, payment: payment || null,
  });
  check(error);
}

function remoteFitsLocal(local: Json, remote: Json) {
  const createdAt = Date.parse(String(local.created_at || ''));
  const remoteCreatedAt = Date.parse(String(remote.date_created || ''));
  const sameWindow = !Number.isNaN(createdAt) && !Number.isNaN(remoteCreatedAt)
    ? remoteCreatedAt >= createdAt - 5 * 60 * 1000 && remoteCreatedAt <= createdAt + 24 * 60 * 60 * 1000
    : true;
  const identityMatches = local.dedicated_trial_plan === true
    ? String(remote.preapproval_plan_id || '') === String(local.preapproval_plan_id || '')
    : String(remote.preapproval_plan_id || '') === String(local.preapproval_plan_id || '')
      && normalizeEmail(remote.payer_email) === normalizeEmail(local.payer_email);
  return String(remote.application_id) === applicationId
    && identityMatches
    && Math.round(Number(remote.auto_recurring?.transaction_amount) * 100) === Number(local.amount_cents)
    && remote.auto_recurring?.currency_id === local.currency
    && Number(remote.auto_recurring?.frequency) === Number(local.frequency)
    && remote.auto_recurring?.frequency_type === 'months'
    && sameWindow;
}

export async function findRemoteForLocal(local: Json) {
  if (local.preapproval_id) return mp(`/preapproval/${encodeURIComponent(local.preapproval_id)}`);
  if (!local.preapproval_plan_id) return null;

  const query = local.dedicated_trial_plan === true
    ? `/preapproval/search?preapproval_plan_id=${encodeURIComponent(local.preapproval_plan_id)}&limit=30&offset=0`
    : local.payer_email
      ? `/preapproval/search?preapproval_plan_id=${encodeURIComponent(local.preapproval_plan_id)}&payer_email=${encodeURIComponent(local.payer_email)}&limit=30&offset=0`
      : '';
  if (!query) return null;

  const found = await mp(query);
  const matches = Array.isArray(found.results) ? found.results.filter((item: Json) => remoteFitsLocal(local, item)) : [];
  if (!matches.length) return null;

  matches.sort((a: Json, b: Json) => Date.parse(String(a.date_created || '')) - Date.parse(String(b.date_created || '')));
  const db = admin();
  for (const candidate of matches) {
    const { data: bound, error } = await db.from('mp_subscriptions').select('id').eq('preapproval_id', String(candidate.id)).maybeSingle();
    check(error);
    if (!bound || bound.id === local.id) return mp(`/preapproval/${encodeURIComponent(candidate.id)}`);
  }
  return null;
}

export async function findLocal(remote: Json) {
  if (String(remote.application_id) !== applicationId) return null;
  const db = admin();
  if (/^[0-9a-f-]{36}$/i.test(remote.external_reference || '')) {
    const { data, error } = await db.from('mp_subscriptions').select('*').eq('id', remote.external_reference).maybeSingle();
    check(error);
    if (data) return data;
  }

  const planId = String(remote.preapproval_plan_id || '');
  if (!planId) return null;

  const { data: dedicated, error: dedicatedError } = await db.from('mp_subscriptions').select('*')
    .eq('preapproval_plan_id', planId)
    .eq('dedicated_trial_plan', true)
    .maybeSingle();
  check(dedicatedError);
  if (dedicated && remoteFitsLocal(dedicated, remote)) return dedicated;

  const payerEmail = normalizeEmail(remote.payer_email);
  if (!payerEmail) return null;
  const { data, error } = await db.from('mp_subscriptions').select('*')
    .eq('preapproval_plan_id', planId)
    .eq('payer_email', payerEmail)
    .in('status', ['creating', 'pending'])
    .order('created_at', { ascending: false })
    .limit(5);
  check(error);
  const matches = (data || []).filter((item: Json) => remoteFitsLocal(item, remote));
  if (!matches.length) return null;
  const local = matches[0];
  const { data: alreadyBound, error: boundError } = await db.from('mp_subscriptions').select('id').eq('preapproval_id', String(remote.id)).maybeSingle();
  check(boundError);
  return alreadyBound && alreadyBound.id !== local.id ? null : local;
}

export async function processInvoice(invoice: Json) {
  if (!invoice.preapproval_id) throw new HttpError(502, 'Fatura sem assinatura.');
  const remote = await mp(`/preapproval/${encodeURIComponent(invoice.preapproval_id)}`);
  const local = await findLocal(remote);
  if (!local) return;
  let payment;
  if (invoice.payment?.id) payment = await mp(`/v1/payments/${encodeURIComponent(invoice.payment.id)}`);
  await applySnapshot(local, remote, payment);
}

export async function syncSubscription(local: Json) {
  const remote = await findRemoteForLocal(local);
  if (!remote) throw new HttpError(409, 'Conclua a autorização no Mercado Pago para liberar o acesso.');
  await applySnapshot(local, remote);
  const invoices = await mp(`/authorized_payments/search?preapproval_id=${encodeURIComponent(remote.id)}&limit=20&offset=0`);
  if (!Array.isArray(invoices.results)) throw new HttpError(502, 'Não foi possível consultar as cobranças.');
  for (const invoice of invoices.results) {
    if (String(invoice.preapproval_id) !== String(remote.id)) throw new HttpError(502, 'Fatura divergente.');
    if (invoice.payment?.id) {
      const payment = await mp(`/v1/payments/${encodeURIComponent(invoice.payment.id)}`);
      await applySnapshot(local, remote, payment);
    }
  }
}

export async function verifySignature(request: Request, secret: string) {
  const signature = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const dataId = new URL(request.url).searchParams.get('data.id')?.toLowerCase() || '';
  const parts: Record<string, string> = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!dataId || !requestId || !/^\d+$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const expected = Uint8Array.from(parts.v1.match(/.{2}/g)!, pair => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(`id:${dataId};request-id:${requestId};ts:${parts.ts};`));
}
