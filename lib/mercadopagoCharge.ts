import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export type MercadoPagoChargeItem = {
  description: string;
  kind: string;
  quantity: number;
  lineTotalCents: number;
};

export type MercadoPagoCharge = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'error';
  amount_cents: number;
  init_point: string | null;
  payment_id: string | null;
  paid_at: string | null;
  updated_at: string;
  channel?: 'checkout' | 'qr' | 'point';
  order_id?: string | null;
  qr_data?: string | null;
  qr_image?: string | null;
  terminal_id?: string | null;
};

function edgeErrorMessage(status: number, raw: string) {
  let parsed: Record<string, unknown> = {};
  try { parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* resposta textual */ }

  const detail = [parsed.error, parsed.message, parsed.details, parsed.hint, parsed.code]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const text = !detail && raw && raw.length <= 700 ? raw.trim() : '';
  const suffix = detail || text;
  return suffix
    ? `Mercado Pago (${status}): ${suffix}`
    : `Mercado Pago respondeu com erro ${status}. Abra novamente a cobrança para tentar de novo.`;
}

export async function mercadoPagoChargeRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createStoreClient().auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para continuar.');

  let response: Response;
  try {
    response = await fetch(`${STORE_SUPABASE.url}/functions/v1/mercadopago-charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: STORE_SUPABASE.publishableKey,
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('A cobrança do Mercado Pago não respondeu a tempo. Tente novamente.');
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(edgeErrorMessage(response.status, raw));
  if (!raw) return {} as T;
  try { return JSON.parse(raw) as T; }
  catch { throw new Error('A cobrança respondeu em um formato inválido. Tente novamente.'); }
}
