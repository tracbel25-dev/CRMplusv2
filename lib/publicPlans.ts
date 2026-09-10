import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export type PublicPlan = { id: string; app_id: string; billing_interval: 'monthly' | 'semiannual' | 'annual'; amount_cents: number; currency: string };

export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const response = await fetch(`${STORE_SUPABASE.url}/rest/v1/plans?select=id,app_id,billing_interval,amount_cents,currency&active=eq.true&order=amount_cents.asc`, {
      headers: { apikey: STORE_SUPABASE.publishableKey }, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    return await response.json();
  } catch { return []; }
}
