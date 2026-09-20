'use client';

import { useEffect, useMemo, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { ZEUS_PLANS, type ZeusFeature, type ZeusPlanCode } from './zeusPlans';

type Payload = { plan: ZeusPlanCode; planName: string; seatLimit: number; aiEnabled: true; aiMonthlyLimit: number|null; features: ZeusFeature[] };

async function load(): Promise<Payload> {
  const { data } = await createStoreClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch('/api/zeus/entitlements', { headers:{ authorization:`Bearer ${data.session.access_token}` }, cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o plano do Zeus.');
  return payload as Payload;
}

export function clearZeusEntitlementsCache() { /* sem cache global entre contas ou sessões */ }

export function useZeusEntitlements(enabled = true) {
  const [value, setValue] = useState<Payload|null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then(result => { if (active) setValue(result); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o plano.'); });
    return () => { active = false; };
  }, [enabled]);
  const features = useMemo(() => new Set(value?.features || []), [value]);
  return {
    ready: !enabled || !!value || !!error,
    error,
    plan: value?.plan || 'start' as ZeusPlanCode,
    planName: value?.planName || ZEUS_PLANS.start.name,
    seatLimit: value?.seatLimit || ZEUS_PLANS.start.seats,
    aiEnabled: true as const,
    aiMonthlyLimit: value?.aiMonthlyLimit ?? null,
    has: (feature: ZeusFeature) => features.has(feature),
  };
}
