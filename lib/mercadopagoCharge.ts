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
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível criar a cobrança pelo Mercado Pago.');
  return result as T;
}
