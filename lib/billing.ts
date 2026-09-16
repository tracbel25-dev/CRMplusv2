import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
import { clientMessage } from '@/lib/clientMessage';

export async function billingRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createStoreClient().auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para continuar.');
  const response = await fetch(`${STORE_SUPABASE.url}/functions/v1/mercadopago-subscription`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: STORE_SUPABASE.publishableKey,
      Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(clientMessage(result?.error, 'Não foi possível concluir a solicitação. Tente novamente.'));
  return result as T;
}
