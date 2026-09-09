import type { NextRequest } from 'next/server';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export type ServerApp = 'zeus' | 'artemis';

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

export async function authorizeAppRequest(request: NextRequest, app: ServerApp) {
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

  const accountApps = await storeFetch(restPath('account_apps', {
    select: 'app_id,status',
    account_id: `eq.${membership.account_id}`,
    app_id: `eq.${app}`,
    status: 'in.(trialing,active)',
    limit: '1',
  }), token) as Array<{ app_id: string }> | null;
  if (!accountApps?.length) return null;

  if (membership.role !== 'owner') {
    const access = await storeFetch(restPath('member_app_access', {
      select: 'app_id,user_id',
      account_id: `eq.${membership.account_id}`,
      user_id: `eq.${user.id}`,
      app_id: `eq.${app}`,
      limit: '1',
    }), token) as Array<{ app_id: string }> | null;
    if (!access?.length) return null;
  }

  return {
    token,
    userId: user.id as string,
    accountId: membership.account_id as string,
    role: membership.role as string,
  };
}
