import { operationalRest } from '@/lib/server/operationalWorkspace';
import { normalizeZeusPlan, zeusHasFeature, zeusPlan, type ZeusFeature, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

function query(params: Record<string,string>) { return new URLSearchParams(params).toString(); }

export type ZeusEntitlements = {
  plan: ZeusPlanCode;
  planName: string;
  seatLimit: number;
  aiEnabled: boolean;
  aiMonthlyLimit: number | null;
};

export async function readZeusEntitlements(tenantKey: string): Promise<ZeusEntitlements> {
  const rows = await operationalRest('zeus', `tenant_entitlements?${query({ select:'plan_code,seat_limit,ai_enabled,ai_monthly_limit', tenant_key:`eq.${tenantKey}`, limit:'1' })}`) as Array<{plan_code?:string;seat_limit?:number;ai_enabled?:boolean;ai_monthly_limit?:number|null}>;
  const row = rows?.[0];
  const plan = normalizeZeusPlan(row?.plan_code || 'start');
  const definition = zeusPlan(plan);
  return { plan, planName: definition.name, seatLimit: Number(row?.seat_limit || definition.seats), aiEnabled: zeusHasFeature(plan, 'ai') && row?.ai_enabled !== false, aiMonthlyLimit: row?.ai_monthly_limit ?? null };
}

export async function requireZeusFeature(tenantKey: string, feature: ZeusFeature) {
  const entitlements = await readZeusEntitlements(tenantKey);
  if (!zeusHasFeature(entitlements.plan, feature)) {
    const error = new Error(`PLAN_FEATURE_REQUIRED: ${feature}`) as Error & { code?: string; plan?: ZeusPlanCode };
    error.code = 'PLAN_FEATURE_REQUIRED'; error.plan = entitlements.plan;
    throw error;
  }
  return entitlements;
}

export function planFeatureError(reason: unknown, fallback = 'Este recurso não está disponível no seu plano atual.') {
  if (reason instanceof Error && reason.message.startsWith('PLAN_FEATURE_REQUIRED:')) return fallback;
  return reason instanceof Error ? reason.message : fallback;
}


export async function syncZeusEntitlementsFromStore(tenantKey: string, planCode: ZeusPlanCode) {
  await operationalRest('zeus', 'tenant_entitlements?on_conflict=tenant_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      tenant_key: tenantKey,
      plan_code: planCode,
      source: 'store_runtime',
      updated_at: new Date().toISOString(),
    }),
  });
  return readZeusEntitlements(tenantKey);
}
