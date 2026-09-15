import type { NextRequest } from 'next/server';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export type ServerApp = 'zeus' | 'artemis';
export type ServerPermissionMap = Record<string, boolean>;

async function storeFetch(path: string, token: string) {
  try {
    const response = await fetch(`${STORE_SUPABASE.url}${path}`, {
      headers: { apikey: STORE_SUPABASE.publishableKey, authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function restPath(table: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/rest/v1/${table}?${query.toString()}`;
}

export function serverPermissionGranted(role: string, permissions: ServerPermissionMap, permission?: string) {
  if (!permission || role === 'owner') return true;
  const keys = Object.keys(permissions || {});
  // Contas antigas sem mapa explícito preservam o comportamento anterior até o titular configurar as permissões.
  if (!keys.length) return true;
  return permissions[permission] === true;
}

export async function authorizeAppRequest(request: NextRequest, app: ServerApp, requiredPermission?: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;

  let userResponse: Response;
  try {
    userResponse = await fetch(`${STORE_SUPABASE.url}/auth/v1/user`, {
      headers: { apikey: STORE_SUPABASE.publishableKey, authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  if (!user || typeof user.id !== 'string') return null;

  const memberships = await storeFetch(restPath('account_members', {
    select: 'account_id,role,status',
    user_id: `eq.${user.id}`,
    status: 'eq.active',
    order: 'created_at.asc',
    limit: '1',
  }), token) as Array<{ account_id: string; role: string }> | null;
  const membership = memberships?.[0];
  if (!membership?.account_id) return null;

  const accounts = await storeFetch(restPath('accounts', {
    select: 'id', id: `eq.${membership.account_id}`, status: 'eq.active',
  }), token) as Array<{ id: string }> | null;
  if (!accounts?.length) return null;

  const accountApps = await storeFetch(restPath('account_apps', {
    select: 'app_id,status,current_period_end',
    account_id: `eq.${membership.account_id}`,
    app_id: `eq.${app}`,
    status: 'in.(trialing,active)',
    or: `(and(status.eq.active,current_period_end.is.null),current_period_end.gt.${new Date().toISOString()})`,
    limit: '1',
  }), token) as Array<{ app_id: string }> | null;
  if (!accountApps?.length) return null;

  let permissions: ServerPermissionMap = {};
  let canConfigure = false;
  if (membership.role !== 'owner') {
    const access = await storeFetch(restPath('member_app_access', {
      select: 'app_id,user_id,permissions,can_configure',
      account_id: `eq.${membership.account_id}`,
      user_id: `eq.${user.id}`,
      app_id: `eq.${app}`,
      limit: '1',
    }), token) as Array<{ app_id: string; permissions?: ServerPermissionMap | null; can_configure?: boolean }> | null;
    const row = access?.[0];
    if (!row) return null;
    permissions = row.permissions && typeof row.permissions === 'object' ? row.permissions : {};
    canConfigure = !!row.can_configure;
    if (!serverPermissionGranted(membership.role, permissions, requiredPermission)) return null;
  }

  return {
    token,
    userId: user.id as string,
    accountId: membership.account_id as string,
    role: membership.role as string,
    permissions,
    canConfigure,
  };
}
