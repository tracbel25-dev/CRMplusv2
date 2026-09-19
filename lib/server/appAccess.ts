import type { NextRequest } from 'next/server';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
import { readZeusEntitlements, syncZeusEntitlementsFromStore } from '@/lib/server/zeusPlanAccess';
import { zeusHasFeature, type ZeusFeature, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

export type ServerApp = 'zeus' | 'artemis';
export type ServerPermissionMap = Record<string, boolean>;

const ZEUS_PERMISSION_FEATURE: Record<string, ZeusFeature> = {
  appointments_view:'scheduling', appointments_manage:'scheduling',
  quotes_view:'budgets', quotes_manage:'budgets',
  billing_view:'billing', billing_manage:'billing',
  dashboard_view:'dashboard', reports_export:'export',
};
const ZEUS_PLAN_CODES = new Set<ZeusPlanCode>(['start','essencial','plus','premium']);

const ZEUS_PATH_FEATURE: Array<[string, ZeusFeature]> = [
  ['/api/zeus/checklist', 'checklist'],
  ['/api/zeus/diagnostico', 'diagnosis'],
  ['/api/zeus/faturamento', 'billing'],
];

async function storeFetch(path: string, token: string) {
  try {
    const response = await fetch(`${STORE_SUPABASE.url}${path}`, { headers:{apikey:STORE_SUPABASE.publishableKey,authorization:`Bearer ${token}`}, cache:'no-store' });
    if (!response.ok) return null;
    return response.json();
  } catch { return null; }
}

function restPath(table: string, params: Record<string, string>) { return `/rest/v1/${table}?${new URLSearchParams(params).toString()}`; }

export function serverPermissionGranted(role: string, permissions: ServerPermissionMap, permission?: string) {
  if (!permission || role === 'owner') return true;
  const keys = Object.keys(permissions || {});
  if (!keys.length) return true;
  return permissions[permission] === true;
}

export async function authorizeAppRequest(request: NextRequest, app: ServerApp, requiredPermission?: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;

  let userResponse: Response;
  try { userResponse = await fetch(`${STORE_SUPABASE.url}/auth/v1/user`, { headers:{apikey:STORE_SUPABASE.publishableKey,authorization:`Bearer ${token}`}, cache:'no-store' }); }
  catch { return null; }
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  if (!user || typeof user.id !== 'string') return null;

  const memberships = await storeFetch(restPath('account_members', {select:'account_id,role,status',user_id:`eq.${user.id}`,status:'eq.active',order:'created_at.asc',limit:'1'}), token) as Array<{account_id:string;role:string}> | null;
  const membership = memberships?.[0];
  if (!membership?.account_id) return null;

  const accounts = await storeFetch(restPath('accounts', {select:'id',id:`eq.${membership.account_id}`,status:'eq.active'}), token) as Array<{id:string}> | null;
  if (!accounts?.length) return null;

  const accountApps = await storeFetch(restPath('account_apps', {select:'app_id,plan_id,status,current_period_end,seats',account_id:`eq.${membership.account_id}`,app_id:`eq.${app}`,status:'in.(trialing,active)',or:`(and(status.eq.active,current_period_end.is.null),current_period_end.gt.${new Date().toISOString()})`,limit:'1'}), token) as Array<{app_id:string;plan_id?:string|null;seats?:number}> | null;
  if (!accountApps?.length) return null;

  let permissions: ServerPermissionMap = {};
  let canConfigure = false;
  if (membership.role !== 'owner') {
    const access = await storeFetch(restPath('member_app_access', {select:'app_id,user_id,permissions,can_configure',account_id:`eq.${membership.account_id}`,user_id:`eq.${user.id}`,app_id:`eq.${app}`,limit:'1'}), token) as Array<{app_id:string;permissions?:ServerPermissionMap|null;can_configure?:boolean}> | null;
    const row = access?.[0];
    if (!row) return null;
    permissions = row.permissions && typeof row.permissions === 'object' ? row.permissions : {};
    canConfigure = !!row.can_configure;
    if (!serverPermissionGranted(membership.role, permissions, requiredPermission)) return null;
  }

  let plan: string | undefined;
  let seatLimit = Math.max(1, Number(accountApps[0]?.seats || 1));
  if (app === 'zeus') {
    try {
      let entitlements = await readZeusEntitlements(membership.account_id);
      const planId = accountApps[0]?.plan_id;
      if (planId) {
        const planRows = await storeFetch(restPath('plans', {
          select:'plan_code',
          id:`eq.${planId}`,
          app_id:'eq.zeus',
          limit:'1',
        }), token) as Array<{plan_code?:string|null}> | null;
        const storePlanCode = String(planRows?.[0]?.plan_code || '').toLowerCase() as ZeusPlanCode;
        if (ZEUS_PLAN_CODES.has(storePlanCode) && storePlanCode !== entitlements.plan) {
          entitlements = await syncZeusEntitlementsFromStore(membership.account_id, storePlanCode);
        }
      }
      plan = entitlements.plan;
      seatLimit = entitlements.seatLimit;
      const pathFeature = ZEUS_PATH_FEATURE.find(([prefix]) => request.nextUrl.pathname.startsWith(prefix))?.[1];
      const feature = pathFeature || (requiredPermission ? ZEUS_PERMISSION_FEATURE[requiredPermission] : undefined);
      if (feature && !zeusHasFeature(entitlements.plan, feature)) return null;
    } catch { return null; }
  }

  return { token, userId:user.id as string, accountId:membership.account_id as string, role:membership.role as string, permissions, canConfigure, plan, seatLimit };
}
