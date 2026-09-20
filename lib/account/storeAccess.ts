'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { clientMessage } from '@/lib/clientMessage';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';

export type AppPermissionMap = Record<string, boolean>;

export type StoreMember = {
  userId: string;
  role: 'owner' | 'member';
  status: 'active' | 'suspended';
  displayName: string;
  jobTitle: string;
  apps: { appId: AppId; canConfigure: boolean; permissions: AppPermissionMap }[];
};

export type StoreIdentityStatus = {
  registered: boolean;
  verified: boolean;
  provider: string | null;
};

export type StoreAccount = {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  personType: 'pf' | 'pj';
  cnpj: string | null;
  apps: { appId: AppId; planId: string | null; planCode: string | null; status: string; seats: number; currentPeriodEnd: string | null }[];
  members: StoreMember[];
};

export type TeamInvitePermission = { appId: AppId; canConfigure: boolean };

async function teamRequest<T = { ok: boolean }>(accountId: string, payload: Record<string, unknown>): Promise<T> {
  const supabase = createStoreClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Entre novamente para continuar.');

  const response = await fetch('/api/team', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
      'x-crmplus-account-id': accountId,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(clientMessage(result.error, 'Não foi possível concluir a alteração.'));
  return result;
}

function useStoreAccessState(disabled=false) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<StoreAccount | null>(null);
  const [member, setMember] = useState<StoreMember | null>(null);
  const [identityStatus, setIdentityStatus] = useState<StoreIdentityStatus | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if(disabled){setUser(null);setAccount(null);setMember(null);setIdentityStatus(null);setError('');setReady(true);return;}
    setError('');
    let supabase;
    try {
      supabase = createStoreClient();
    } catch (reason) {
      setUser(null); setAccount(null); setMember(null); setIdentityStatus(null); setError(clientMessage(reason, 'Não foi possível abrir sua conta.')); setReady(true); return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) { setUser(null); setAccount(null); setMember(null); setIdentityStatus(null); setReady(true); return; }
    const currentUser = userData.user;
    setUser(currentUser);

    let { data: membership, error: membershipError } = await supabase
      .from('account_members')
      .select('account_id, user_id, role, status, created_at')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) { setError(clientMessage(membershipError, 'Não foi possível carregar sua conta.')); setReady(true); return; }

    if (!membership) {
      const business = typeof currentUser.user_metadata?.business === 'string' ? currentUser.user_metadata.business.trim() : '';
      if (business) {
        const { error: bootstrapError } = await supabase.rpc('create_account', { account_name: business });
        if (bootstrapError) { setError(clientMessage(bootstrapError, 'Não foi possível concluir sua conta.')); setReady(true); return; }
        const membershipResult = await supabase
          .from('account_members')
          .select('account_id, user_id, role, status, created_at')
          .eq('user_id', currentUser.id)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        membership = membershipResult.data;
        membershipError = membershipResult.error;
      }
    }

    if (membershipError || !membership) {
      setAccount(null); setMember(null); if (membershipError) setError(clientMessage(membershipError, 'Não foi possível carregar sua conta.')); setReady(true); return;
    }

    const accountId = membership.account_id as string;
    const [accountResult, appsResult, membersResult, appAccessResult, identityResult] = await Promise.all([
      supabase.from('accounts').select('id, name, status, person_type, cnpj').eq('id', accountId).single(),
      supabase.from('account_apps').select('app_id, plan_id, status, seats, current_period_end').eq('account_id', accountId),
      supabase.from('account_members').select('account_id, user_id, role, status, job_title').eq('account_id', accountId).eq('status', 'active'),
      supabase.from('member_app_access').select('user_id, app_id, can_configure, permissions').eq('account_id', accountId),
      supabase.rpc('current_identity_summary')
    ]);

    const firstError = accountResult.error || appsResult.error || membersResult.error || appAccessResult.error;
    if (firstError || !accountResult.data) { setError(clientMessage(firstError, 'Não foi possível carregar sua conta.')); setReady(true); return; }

    const planIds = Array.from(new Set((appsResult.data || []).map(row => row.plan_id as string | null).filter((value): value is string => !!value)));
    const plansResult = planIds.length
      ? await supabase.from('plans').select('id, plan_code').in('id', planIds)
      : { data: [], error: null };
    if (plansResult.error) { setError(clientMessage(plansResult.error, 'Não foi possível identificar os planos contratados.')); setReady(true); return; }
    const planCodes = new Map((plansResult.data || []).map(plan => [plan.id as string, plan.plan_code as string | null]));

    const membersRaw = membersResult.data || [];
    const userIds = membersRaw.map(item => item.user_id as string);
    const profilesResult = userIds.length
      ? await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds)
      : { data: [], error: null };
    if (profilesResult.error) { setError(clientMessage(profilesResult.error, 'Não foi possível carregar os dados da equipe.')); setReady(true); return; }

    const profileNames = new Map((profilesResult.data || []).map(profile => [profile.user_id as string, profile.display_name as string | null]));
    const accessRows = appAccessResult.data || [];
    const members: StoreMember[] = membersRaw.map(raw => ({
      userId: raw.user_id as string,
      role: raw.role as 'owner' | 'member',
      status: raw.status as 'active' | 'suspended',
      displayName: profileNames.get(raw.user_id as string) || (raw.user_id === currentUser.id ? (currentUser.user_metadata?.name || currentUser.email || 'Usuário') : 'Usuário'),
      jobTitle: String(raw.job_title || ''),
      apps: accessRows
        .filter(row => row.user_id === raw.user_id)
        .map(row => ({
          appId: row.app_id as AppId,
          canConfigure: !!row.can_configure,
          permissions: row.permissions && typeof row.permissions === 'object' ? row.permissions as AppPermissionMap : {}
        }))
    }));

    const accountApps = (appsResult.data || []).map(row => ({
      appId: row.app_id as AppId,
      planId: row.plan_id as string | null,
      planCode: planCodes.get(row.plan_id as string) || null,
      status: row.status as string,
      seats: Number(row.seats || 0),
      currentPeriodEnd: row.current_period_end as string | null
    }));

    const nextAccount: StoreAccount = {
      id: accountResult.data.id as string,
      name: accountResult.data.name as string,
      status: accountResult.data.status as StoreAccount['status'],
      personType: accountResult.data.person_type === 'pj' ? 'pj' : 'pf',
      cnpj: accountResult.data.cnpj as string | null,
      apps: accountApps,
      members
    };
    const identity = identityResult.error ? null : identityResult.data as StoreIdentityStatus | null;
    setAccount(nextAccount);
    setMember(members.find(item => item.userId === currentUser.id) || null);
    setIdentityStatus(identity ? {
      registered: identity.registered === true,
      verified: identity.verified === true,
      provider: typeof identity.provider === 'string' ? identity.provider : null,
    } : null);
    setReady(true);
  }, [disabled]);

  useEffect(() => {
    if(disabled){setReady(true);return;}
    void refresh();
    let supabase;
    try { supabase = createStoreClient(); } catch { return; }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [disabled, refresh]);

  const isOwner = member?.role === 'owner';
  useEffect(() => {
    if (!account?.apps.some(item => item.status === 'trialing' && item.currentPeriodEnd && Date.parse(item.currentPeriodEnd) > Date.now())) return;
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    return () => window.clearInterval(timer);
  }, [account, refresh]);

  const activeApps = useMemo(() => new Set(account?.apps.filter(item => ['trialing', 'active'].includes(item.status) && ((item.status === 'active' && !item.currentPeriodEnd) || (!!item.currentPeriodEnd && Date.parse(item.currentPeriodEnd) > Date.now()))).map(item => item.appId) || []), [account]);
  const memberApp = (app: AppId) => member?.apps.find(item => item.appId === app);
  const hasApp = (app: AppId) => !!account && account.status === 'active' && activeApps.has(app) && (isOwner || !!memberApp(app));
  const hasPermission = (app: AppId, permission: string) => {
    if (!account) return true;
    if (isOwner) return true;
    if (!activeApps.has(app)) return false;
    const row = memberApp(app);
    if (!row) return false;
    const contracted = account.apps.find(item => item.appId === app && activeApps.has(item.appId));
    if (app === 'zeus' && !['plus','premium'].includes(String(contracted?.planCode || 'start'))) return true;
    const keys = Object.keys(row.permissions || {});
    if (!keys.length) return true;
    return row.permissions[permission] === true;
  };
  const canConfigureApp = (app: AppId) => {
    if (!account || account.status !== 'active' || !activeApps.has(app)) return false;
    if (isOwner) return true;
    const row = memberApp(app);
    if (!row) return false;
    const contracted = account.apps.find(item => item.appId === app && activeApps.has(item.appId));
    if (app === 'zeus' && !['plus','premium'].includes(String(contracted?.planCode || 'start'))) return false;
    const p = row.permissions || {};
    return row.canConfigure || p.settings_fields === true || p.settings_operation === true || p.settings_access === true;
  };

  const setMemberAppAccess = async (userId: string, app: AppId, enabled: boolean, canConfigure = false) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode alterar acessos.');
    await teamRequest(account.id, { action: 'access', userId, appId: app, enabled, canConfigure });
    await refresh();
  };

  const setMemberCanConfigure = async (userId: string, app: AppId, canConfigure: boolean) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode alterar permissões.');
    await teamRequest(account.id, { action: 'configure', userId, appId: app, enabled: canConfigure });
    await refresh();
  };

  const inviteMember = async (name: string, email: string, permissions: TeamInvitePermission[]) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode adicionar pessoas à equipe.');
    const result = await teamRequest<{ ok: boolean; mode: 'invited' | 'existing' }>(account.id, { action: 'invite', name, email, apps: permissions });
    await refresh();
    return result;
  };

  const removeMember = async (userId: string) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode remover pessoas da equipe.');
    await teamRequest(account.id, { action: 'remove', userId });
    await refresh();
  };

  const logout = async () => {
    const supabase = createStoreClient();
    await supabase.auth.signOut();
    await refresh();
  };

  return { ready, user, account, member, identityStatus, error, isOwner, hasApp, hasPermission, canConfigureApp, refresh, setMemberAppAccess, setMemberCanConfigure, inviteMember, removeMember, logout };
}

type StoreAccessContextValue = ReturnType<typeof useStoreAccessState>;
const StoreAccessContext = createContext<StoreAccessContextValue | null>(null);

export function StoreAccessProvider({ children }: { children: ReactNode }) {
  const pathname=usePathname();
  const recoveryRoute=pathname==='/nova-senha';
  const value = useStoreAccessState(recoveryRoute);
  return createElement(StoreAccessContext.Provider, { value }, children);
}

export function useStoreAccess() {
  const value = useContext(StoreAccessContext);
  if (!value) throw new Error('Não foi possível abrir sua conta.');
  return value;
}
