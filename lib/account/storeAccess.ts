'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';

export type StoreMember = {
  userId: string;
  role: 'owner' | 'member';
  status: 'active' | 'suspended';
  displayName: string;
  apps: { appId: AppId; canConfigure: boolean }[];
};

export type StoreAccount = {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  apps: { appId: AppId; status: string; seats: number; currentPeriodEnd: string | null }[];
  members: StoreMember[];
};

export function useStoreAccess() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<StoreAccount | null>(null);
  const [member, setMember] = useState<StoreMember | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    let supabase;
    try {
      supabase = createStoreClient();
    } catch (reason) {
      setUser(null);
      setAccount(null);
      setMember(null);
      setError((reason as Error).message);
      setReady(true);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setUser(null);
      setAccount(null);
      setMember(null);
      setReady(true);
      return;
    }
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

    if (membershipError) {
      setError(membershipError.message);
      setReady(true);
      return;
    }

    if (!membership) {
      const business = typeof currentUser.user_metadata?.business === 'string'
        ? currentUser.user_metadata.business.trim()
        : '';
      if (business) {
        const { error: bootstrapError } = await supabase.rpc('create_account', { account_name: business });
        if (bootstrapError) {
          setError(bootstrapError.message);
          setReady(true);
          return;
        }
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
      setAccount(null);
      setMember(null);
      if (membershipError) setError(membershipError.message);
      setReady(true);
      return;
    }

    const accountId = membership.account_id as string;
    const [accountResult, appsResult, membersResult, appAccessResult] = await Promise.all([
      supabase.from('accounts').select('id, name, status').eq('id', accountId).single(),
      supabase.from('account_apps').select('app_id, status, seats, current_period_end').eq('account_id', accountId),
      supabase.from('account_members').select('account_id, user_id, role, status').eq('account_id', accountId).eq('status', 'active'),
      supabase.from('member_app_access').select('user_id, app_id, can_configure').eq('account_id', accountId)
    ]);

    const firstError = accountResult.error || appsResult.error || membersResult.error || appAccessResult.error;
    if (firstError || !accountResult.data) {
      setError(firstError?.message || 'Não foi possível carregar a conta.');
      setReady(true);
      return;
    }

    const membersRaw = membersResult.data || [];
    const userIds = membersRaw.map(item => item.user_id as string);
    const profilesResult = userIds.length
      ? await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds)
      : { data: [], error: null };
    if (profilesResult.error) {
      setError(profilesResult.error.message);
      setReady(true);
      return;
    }

    const profileNames = new Map((profilesResult.data || []).map(profile => [profile.user_id as string, profile.display_name as string | null]));
    const accessRows = appAccessResult.data || [];
    const members: StoreMember[] = membersRaw.map(raw => ({
      userId: raw.user_id as string,
      role: raw.role as 'owner' | 'member',
      status: raw.status as 'active' | 'suspended',
      displayName: profileNames.get(raw.user_id as string) || (raw.user_id === currentUser.id ? (currentUser.user_metadata?.name || currentUser.email || 'Usuário') : 'Usuário'),
      apps: accessRows
        .filter(row => row.user_id === raw.user_id)
        .map(row => ({ appId: row.app_id as AppId, canConfigure: !!row.can_configure }))
    }));

    const accountApps = (appsResult.data || []).map(row => ({
      appId: row.app_id as AppId,
      status: row.status as string,
      seats: Number(row.seats || 0),
      currentPeriodEnd: row.current_period_end as string | null
    }));

    const nextAccount: StoreAccount = {
      id: accountResult.data.id as string,
      name: accountResult.data.name as string,
      status: accountResult.data.status as StoreAccount['status'],
      apps: accountApps,
      members
    };
    setAccount(nextAccount);
    setMember(members.find(item => item.userId === currentUser.id) || null);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    let supabase;
    try { supabase = createStoreClient(); } catch { return; }
    const { data } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const isOwner = member?.role === 'owner';
  const activeApps = useMemo(() => new Set(account?.apps.filter(item => ['trialing', 'active'].includes(item.status)).map(item => item.appId) || []), [account]);
  const hasApp = (app: AppId) => !!account && activeApps.has(app) && (isOwner || !!member?.apps.some(item => item.appId === app));
  const canConfigureApp = (app: AppId) => !!account && activeApps.has(app) && (isOwner || !!member?.apps.some(item => item.appId === app && item.canConfigure));

  const setMemberAppAccess = async (userId: string, app: AppId, enabled: boolean, canConfigure = false) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode alterar acessos.');
    const supabase = createStoreClient();
    if (enabled) {
      const { error: writeError } = await supabase.from('member_app_access').upsert({
        account_id: account.id,
        user_id: userId,
        app_id: app,
        can_configure: canConfigure,
        updated_at: new Date().toISOString()
      });
      if (writeError) throw writeError;
    } else {
      const { error: writeError } = await supabase.from('member_app_access')
        .delete()
        .eq('account_id', account.id)
        .eq('user_id', userId)
        .eq('app_id', app);
      if (writeError) throw writeError;
    }
    await refresh();
  };

  const setMemberCanConfigure = async (userId: string, app: AppId, canConfigure: boolean) => {
    if (!account || !isOwner) throw new Error('Somente o titular pode alterar permissões.');
    const supabase = createStoreClient();
    const { error: writeError } = await supabase.from('member_app_access')
      .update({ can_configure: canConfigure, updated_at: new Date().toISOString() })
      .eq('account_id', account.id)
      .eq('user_id', userId)
      .eq('app_id', app);
    if (writeError) throw writeError;
    await refresh();
  };

  const logout = async () => {
    const supabase = createStoreClient();
    await supabase.auth.signOut();
    await refresh();
  };

  return { ready, user, account, member, error, isOwner, hasApp, canConfigureApp, refresh, setMemberAppAccess, setMemberCanConfigure, logout };
}
