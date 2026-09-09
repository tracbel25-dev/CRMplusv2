import type { NextRequest } from 'next/server';

export type ServerApp = 'zeus' | 'artemis';

const STORE_URL = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL || 'https://sodcfarvfhkdjecjmdwc.supabase.co';
const STORE_KEY = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET';

async function storeFetch(path: string, token: string) {
  const response = await fetch(`${STORE_URL}${path}`, {
    headers: { apikey: STORE_KEY, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json();
}

function restPath(table: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/rest/v1/${table}?${query.toString()}`;
}

export async function authorizeAppRequest(request: NextRequest, app: ServerApp) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;

  const userResponse = await fetch(`${STORE_URL}/auth/v1/user`, {
    headers: { apikey: STORE_KEY, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
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
