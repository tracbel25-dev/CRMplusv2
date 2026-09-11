import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

const TEAM_LIMIT = 4;

type PermissionInput = { appId: string; canConfigure: boolean };
type Body = {
  action?: 'invite' | 'remove' | 'access' | 'configure';
  name?: string;
  email?: string;
  apps?: PermissionInput[];
  userId?: string;
  appId?: string;
  enabled?: boolean;
  canConfigure?: boolean;
};

type AccountAppRow = {
  app_id: string;
  status: string;
  current_period_end: string | null;
};

function responseError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function activeApp(row: AccountAppRow) {
  if (!['trialing', 'active'].includes(row.status)) return false;
  if (row.status === 'active' && !row.current_period_end) return true;
  return !!row.current_period_end && Date.parse(row.current_period_end) > Date.now();
}

async function verifyCaller(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;
  try {
    const authResponse = await fetch(`${STORE_SUPABASE.url}/auth/v1/user`, {
      headers: {
        apikey: STORE_SUPABASE.publishableKey,
        authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    if (!authResponse.ok) return null;
    const user = await authResponse.json() as { id?: string };
    return typeof user.id === 'string' ? { token, userId: user.id } : null;
  } catch {
    return null;
  }
}

function serviceClient() {
  const secret = process.env.STORE_SUPABASE_SECRET_KEY?.trim() || '';
  if (!secret) return null;
  return createClient(STORE_SUPABASE.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ownerAccount(service: SupabaseClient, userId: string) {
  const { data, error } = await service
    .from('account_members')
    .select('account_id, role, status')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error || !data?.account_id) return null;

  const { data: account } = await service
    .from('accounts')
    .select('id, status')
    .eq('id', data.account_id)
    .eq('status', 'active')
    .maybeSingle();
  return account?.id ? String(account.id) : null;
}

async function findUserByEmail(service: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.trim().toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function getActiveApps(service: SupabaseClient, accountId: string) {
  const { data, error } = await service
    .from('account_apps')
    .select('app_id, status, current_period_end')
    .eq('account_id', accountId);
  if (error) throw error;
  return (data as AccountAppRow[]).filter(activeApp).map(row => row.app_id);
}

async function getTargetMember(service: SupabaseClient, accountId: string, userId: string) {
  const { data, error } = await service
    .from('account_members')
    .select('user_id, role, status')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function setSelectedApps(service: SupabaseClient, accountId: string, userId: string, selected: PermissionInput[]) {
  const { error: clearError } = await service
    .from('member_app_access')
    .delete()
    .eq('account_id', accountId)
    .eq('user_id', userId);
  if (clearError) throw clearError;

  if (!selected.length) return;
  const { error: insertError } = await service.from('member_app_access').insert(
    selected.map(item => ({
      account_id: accountId,
      user_id: userId,
      app_id: item.appId,
      can_configure: !!item.canConfigure,
      updated_at: new Date().toISOString(),
    })),
  );
  if (insertError) throw insertError;
}

export async function POST(request: NextRequest) {
  const caller = await verifyCaller(request);
  if (!caller) return responseError(401, 'Sua sessão expirou. Entre novamente para continuar.');

  const service = serviceClient();
  if (!service) return responseError(503, 'A gestão da equipe está temporariamente indisponível. Tente novamente em instantes.');

  const accountId = await ownerAccount(service, caller.userId);
  if (!accountId) return responseError(403, 'Somente o titular da empresa pode alterar a equipe e os acessos.');

  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.action) return responseError(400, 'Não foi possível identificar a alteração solicitada.');

  try {
    if (body.action === 'invite') {
      const name = body.name?.trim().replace(/\s+/g, ' ') || '';
      const email = body.email?.trim().toLowerCase() || '';
      if (name.length < 2) return responseError(400, 'Informe o nome da pessoa.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responseError(400, 'Informe um e-mail válido.');

      const { data: activeMembers, error: membersError } = await service
        .from('account_members')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('status', 'active');
      if (membersError) throw membersError;
      if ((activeMembers?.length || 0) >= TEAM_LIMIT) {
        return responseError(409, 'Sua equipe já tem 4 integrantes. Remova alguém antes de adicionar outra pessoa.');
      }

      const activeApps = new Set(await getActiveApps(service, accountId));
      const selected = Array.isArray(body.apps)
        ? body.apps
            .filter(item => item && typeof item.appId === 'string' && activeApps.has(item.appId))
            .map(item => ({ appId: item.appId, canConfigure: !!item.canConfigure }))
        : [];
      const uniqueSelected = [...new Map(selected.map(item => [item.appId, item])).values()];
      if (!uniqueSelected.length) return responseError(400, 'Selecione pelo menos um aplicativo para essa pessoa.');

      let targetUser = await findUserByEmail(service, email);
      let createdByInvite = false;

      if (targetUser?.id === caller.userId) return responseError(409, 'Você já é o titular desta equipe.');

      if (targetUser) {
        const { data: memberships, error: membershipError } = await service
          .from('account_members')
          .select('account_id, status, role')
          .eq('user_id', targetUser.id);
        if (membershipError) throw membershipError;
        const activeMembership = memberships?.find(row => row.status === 'active');
        if (activeMembership?.account_id === accountId) return responseError(409, 'Essa pessoa já faz parte da sua equipe.');
        if (activeMembership && activeMembership.account_id !== accountId) {
          return responseError(409, 'Este e-mail já está vinculado a outra empresa e não pode ser adicionado agora.');
        }
      } else {
        const origin = new URL(request.url).origin;
        const { data, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${origin}/auth/confirm`,
          data: { name, signup_redirect: '/nova-senha?convite=1' },
        });
        if (inviteError || !data.user) {
          if (inviteError?.message?.toLowerCase().includes('rate')) {
            return responseError(429, 'Muitos convites foram enviados em pouco tempo. Aguarde alguns minutos e tente novamente.');
          }
          throw inviteError || new Error('invite_failed');
        }
        targetUser = data.user;
        createdByInvite = true;
      }

      try {
        const { error: profileError } = await service.from('profiles').upsert({
          user_id: targetUser.id,
          display_name: name,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (profileError) throw profileError;

        const existing = await getTargetMember(service, accountId, targetUser.id);
        if (existing) {
          const { error: reactivateError } = await service
            .from('account_members')
            .update({ role: 'member', status: 'active' })
            .eq('account_id', accountId)
            .eq('user_id', targetUser.id);
          if (reactivateError) throw reactivateError;
        } else {
          const { error: memberError } = await service.from('account_members').insert({
            account_id: accountId,
            user_id: targetUser.id,
            role: 'member',
            status: 'active',
          });
          if (memberError) throw memberError;
        }

        await setSelectedApps(service, accountId, targetUser.id, uniqueSelected);
      } catch (writeError) {
        if (createdByInvite) await service.auth.admin.deleteUser(targetUser.id).catch(() => undefined);
        throw writeError;
      }

      return NextResponse.json({ ok: true, mode: createdByInvite ? 'invited' : 'existing' });
    }

    if (body.action === 'remove') {
      const targetId = body.userId?.trim() || '';
      if (!targetId) return responseError(400, 'Selecione a pessoa que deseja remover.');
      const target = await getTargetMember(service, accountId, targetId);
      if (!target || target.status !== 'active') return responseError(404, 'Essa pessoa não faz mais parte da equipe.');
      if (target.role === 'owner') return responseError(400, 'O titular da conta não pode ser removido da própria equipe.');

      const { error: accessError } = await service
        .from('member_app_access')
        .delete()
        .eq('account_id', accountId)
        .eq('user_id', targetId);
      if (accessError) throw accessError;

      const { error: memberError } = await service
        .from('account_members')
        .update({ status: 'suspended' })
        .eq('account_id', accountId)
        .eq('user_id', targetId);
      if (memberError) throw memberError;
      return NextResponse.json({ ok: true });
    }

    const targetId = body.userId?.trim() || '';
    const appId = body.appId?.trim() || '';
    if (!targetId || !appId) return responseError(400, 'Não foi possível identificar a pessoa ou o aplicativo.');
    const target = await getTargetMember(service, accountId, targetId);
    if (!target || target.status !== 'active') return responseError(404, 'Essa pessoa não faz mais parte da equipe.');
    if (target.role === 'owner') return responseError(400, 'O titular já possui acesso completo aos aplicativos ativos.');

    const activeApps = new Set(await getActiveApps(service, accountId));
    if (!activeApps.has(appId)) return responseError(400, 'Este aplicativo não está ativo nesta empresa.');

    if (body.action === 'access') {
      if (body.enabled) {
        const { error } = await service.from('member_app_access').upsert({
          account_id: accountId,
          user_id: targetId,
          app_id: appId,
          can_configure: !!body.canConfigure,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'account_id,user_id,app_id' });
        if (error) throw error;
      } else {
        const { error } = await service
          .from('member_app_access')
          .delete()
          .eq('account_id', accountId)
          .eq('user_id', targetId)
          .eq('app_id', appId);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'configure') {
      const { data: existingAccess, error: accessReadError } = await service
        .from('member_app_access')
        .select('app_id')
        .eq('account_id', accountId)
        .eq('user_id', targetId)
        .eq('app_id', appId)
        .maybeSingle();
      if (accessReadError) throw accessReadError;
      if (!existingAccess) return responseError(400, 'Libere o acesso ao aplicativo antes de permitir configurações.');

      const { error } = await service
        .from('member_app_access')
        .update({ can_configure: !!body.enabled, updated_at: new Date().toISOString() })
        .eq('account_id', accountId)
        .eq('user_id', targetId)
        .eq('app_id', appId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return responseError(400, 'Alteração não reconhecida.');
  } catch (reason) {
    console.error('team-management-failed', reason);
    return responseError(500, 'Não foi possível concluir a alteração da equipe. Tente novamente.');
  }
}
