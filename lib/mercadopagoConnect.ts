import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export type MercadoPagoTerms = {
  version: string;
  hash: string;
  text: string;
};

export type MercadoPagoConnection = {
  providerUserId: string;
  publicKey: string | null;
  scope: string;
  liveMode: boolean;
  tokenExpiresAt: string;
  status: 'active' | 'revoked' | 'error';
  connectedAt: string;
  updatedAt: string;
};

export type MercadoPagoAppSetting = {
  appId: string;
  enabled: boolean;
  updatedAt: string;
};

export type MercadoPagoConnectStatus = {
  ready: boolean;
  isOwner: boolean;
  terms: MercadoPagoTerms;
  connection: MercadoPagoConnection | null;
  appSettings: MercadoPagoAppSetting[];
};

export async function mercadoPagoConnectRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createStoreClient().auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para continuar.');

  const response = await fetch(`${STORE_SUPABASE.url}/functions/v1/mercadopago-connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: STORE_SUPABASE.publishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a integração com o Mercado Pago.');
  return result as T;
}
