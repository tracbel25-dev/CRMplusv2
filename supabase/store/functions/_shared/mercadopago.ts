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
export async function mp(path: string, method = 'GET', body?: Json) {
  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) throw new HttpError(503, 'Pagamento em configuração.');
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mercado Pago request failed:', method, response.status);
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
export function assertSubscription(local: Json, remote: Json) {
  const recurring = remote.auto_recurring;
  if (String(remote.application_id) !== applicationId || remote.external_reference !== local.id ||
    (local.preapproval_id && remote.id !== local.preapproval_id) || !remote.id ||
    !['pending', 'authorized', 'paused', 'cancelled'].includes(remote.status) ||
    Math.round(Number(recurring?.transaction_amount) * 100) !== local.amount_cents ||
    recurring?.currency_id !== local.currency || recurring?.frequency !== local.frequency ||
    recurring?.frequency_type !== 'months' || !remote.last_modified) {
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
  const { error } = await admin().rpc('mp_apply_snapshot', {
    local_id: local.id, subscription: remote, payment: payment || null,
  });
  check(error);
}
export async function findLocal(remote: Json) {
  if (String(remote.application_id) !== applicationId || !/^[0-9a-f-]{36}$/i.test(remote.external_reference || '')) return null;
  const { data, error } = await admin().from('mp_subscriptions').select('*').eq('id', remote.external_reference).maybeSingle();
  check(error);
  return data;
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
  const remote = await mp(`/preapproval/${encodeURIComponent(local.preapproval_id)}`);
  await applySnapshot(local, remote);
  const invoices = await mp(`/authorized_payments/search?preapproval_id=${encodeURIComponent(local.preapproval_id)}&limit=20&offset=0`);
  if (!Array.isArray(invoices.results)) throw new HttpError(502, 'Não foi possível consultar as cobranças.');
  for (const invoice of invoices.results) {
    if (String(invoice.preapproval_id) !== String(local.preapproval_id)) throw new HttpError(502, 'Fatura divergente.');
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
