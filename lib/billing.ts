import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export async function billingRequest<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await createStoreClient().auth.getSession();
  if (error || !data.session) throw new Error('Entre na sua conta para continuar.');
  const response = await fetch(`${STORE_SUPABASE.url}/functions/v1/mercadopago-subscription`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: STORE_SUPABASE.publishableKey,
      Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a solicitação.');
  return result as T;
}
