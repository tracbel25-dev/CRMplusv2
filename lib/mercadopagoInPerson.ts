import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
import type { MercadoPagoCharge, MercadoPagoChargeItem } from '@/lib/mercadopagoCharge';

export type MercadoPagoPos = {
  id: string;
  name: string;
  externalId: string;
  storeId: string;
  qrImage: string | null;
  qrCode: string | null;
};

export type MercadoPagoTerminal = {
  id: string;
  posId: string;
  storeId: string;
  externalPosId: string;
  operatingMode: string;
};

export type MercadoPagoInPersonCapabilities = {
  pos: MercadoPagoPos[];
  terminals: MercadoPagoTerminal[];
  qrReady: boolean;
  pointReady: boolean;
};

export type MercadoPagoInPersonCreate = {
  charge: MercadoPagoCharge;
};

export async function mercadoPagoInPersonRequest<T>(body: {
  action: 'capabilities' | 'status' | 'create';
  accountId: string;
  appId: 'zeus' | 'artemis';
  sourceId: string;
  channel?: 'qr' | 'point';
  reference?: string;
  amountCents?: number;
  items?: MercadoPagoChargeItem[];
  externalPosId?: string;
  terminalId?: string;
}): Promise<T> {
  const { data, error } = await createStoreClient().auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para continuar.');

  const response = await fetch(`${STORE_SUPABASE.url}/functions/v1/mercadopago-inperson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: STORE_SUPABASE.publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a cobrança presencial pelo Mercado Pago.');
  return result as T;
}
