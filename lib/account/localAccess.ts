'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppId } from '@/lib/operations/model';

export type LocalRole = 'owner' | 'member';
export type LocalPermission = 'manage_configuration' | 'manage_members' | 'manage_apps' | 'manage_billing';
export type LocalMember = {
  id: string;
  name: string;
  email: string;
  role: LocalRole;
  apps: AppId[];
  permissions?: LocalPermission[];
};
export type LocalAccount = {
  id: string;
  business: string;
  subscriptions: AppId[];
  ownerMemberId: string;
  members: LocalMember[];
  createdAt: string;
};
export type LocalSession = { accountId: string; memberId: string };

type CreateAccountInput = { name: string; business: string; email: string; app: AppId };

const accountsKey = 'crmplus:accounts:v1';
const sessionKey = 'crmplus:session:v1';
const changedEvent = 'crmplus:account-changed';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function readLocalAccounts(): LocalAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(accountsKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLocalSession(): LocalSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    return parsed?.accountId && parsed?.memberId ? parsed : null;
  } catch {
    return null;
  }
}

function emitChange() {
  window.dispatchEvent(new Event(changedEvent));
}

function writeAccounts(accounts: LocalAccount[]) {
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
  emitChange();
}

function writeSession(session: LocalSession | null) {
  if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
  emitChange();
}

function ensureEmailAvailable(accounts: LocalAccount[], email: string, ignoreMemberId?: string) {
  const normalized = normalizeEmail(email);
  if (accounts.some(account => account.members.some(member => member.id !== ignoreMemberId && normalizeEmail(member.email) === normalized))) {
    throw new Error('Este e-mail já está vinculado a um acesso neste protótipo.');
  }
}

export function createLocalAccount(input: CreateAccountInput) {
  const accounts = readLocalAccounts();
  const email = normalizeEmail(input.email);
  if (!input.name.trim() || !input.business.trim() || !email) throw new Error('Preencha nome, negócio e e-mail.');
  ensureEmailAvailable(accounts, email);
  const memberId = makeId();
  const account: LocalAccount = {
    id: makeId(),
    business: input.business.trim(),
    subscriptions: [input.app],
    ownerMemberId: memberId,
    members: [{ id: memberId, name: input.name.trim(), email, role: 'owner', apps: [input.app], permissions: [] }],
    createdAt: new Date().toISOString()
  };
  accounts.push(account);
  writeAccounts(accounts);
  const session = { accountId: account.id, memberId };
  writeSession(session);
  return { account, member: account.members[0] };
}

export function loginLocal(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const accounts = readLocalAccounts();
  for (const account of accounts) {
    const member = account.members.find(item => normalizeEmail(item.email) === email);
    if (member) {
      writeSession({ accountId: account.id, memberId: member.id });
      return { account, member };
    }
  }
  throw new Error('Nenhuma conta local foi encontrada para este e-mail. Crie a conta primeiro neste protótipo.');
}

export function logoutLocal() {
  writeSession(null);
}

export function useLocalAccess() {
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [session, setSession] = useState<LocalSession | null>(null);

  useEffect(() => {
    const sync = () => {
      setAccounts(readLocalAccounts());
      setSession(readLocalSession());
      setReady(true);
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(changedEvent, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(changedEvent, sync);
    };
  }, []);

  const account = useMemo(() => accounts.find(item => item.id === session?.accountId) || null, [accounts, session]);
  const member = useMemo(() => account?.members.find(item => item.id === session?.memberId) || null, [account, session]);
  const isOwner = !!account && !!member && account.ownerMemberId === member.id;
  const hasApp = (app: AppId) => !!member?.apps.includes(app) && !!account?.subscriptions.includes(app);
  const hasPermission = (permission: LocalPermission) => isOwner || !!member?.permissions?.includes(permission);
  const canManageConfiguration = hasPermission('manage_configuration');

  const mutateAccount = (mutate: (account: LocalAccount) => void) => {
    if (!account || !member) throw new Error('Entre na conta antes de alterar acessos.');
    const next = readLocalAccounts();
    const target = next.find(item => item.id === account.id);
    if (!target) throw new Error('Conta local não encontrada.');
    mutate(target);
    writeAccounts(next);
  };

  const addMember = (name: string, emailInput: string, appAccess: AppId[], permissions: LocalPermission[] = []) => {
    if (!isOwner || !account) throw new Error('Somente o titular pode adicionar acessos.');
    if (account.members.length >= 4) throw new Error('Esta conta já possui o limite de quatro acessos.');
    const email = normalizeEmail(emailInput);
    if (!name.trim() || !email) throw new Error('Informe nome e e-mail do novo acesso.');
    const allowed = appAccess.filter(app => account.subscriptions.includes(app));
    if (!allowed.length) throw new Error('Escolha pelo menos um aplicativo contratado para este acesso.');
    const accountsNow = readLocalAccounts();
    ensureEmailAvailable(accountsNow, email);
    mutateAccount(target => target.members.push({ id: makeId(), name: name.trim(), email, role: 'member', apps: allowed, permissions: Array.from(new Set(permissions)) }));
  };

  const updateMemberApps = (memberId: string, appAccess: AppId[]) => {
    if (!isOwner || !account) throw new Error('Somente o titular pode alterar acessos.');
    if (memberId === account.ownerMemberId) throw new Error('O titular mantém acesso aos aplicativos da conta.');
    const allowed = appAccess.filter(app => account.subscriptions.includes(app));
    if (!allowed.length) throw new Error('O usuário precisa manter acesso a pelo menos um aplicativo.');
    mutateAccount(target => {
      const targetMember = target.members.find(item => item.id === memberId);
      if (!targetMember) throw new Error('Acesso não encontrado.');
      targetMember.apps = allowed;
    });
  };

  const updateMemberPermission = (memberId: string, permission: LocalPermission, enabled: boolean) => {
    if (!isOwner || !account) throw new Error('Somente o titular pode conceder permissões.');
    if (memberId === account.ownerMemberId) throw new Error('O titular já possui todas as permissões.');
    mutateAccount(target => {
      const targetMember = target.members.find(item => item.id === memberId);
      if (!targetMember) throw new Error('Acesso não encontrado.');
      const current = targetMember.permissions || [];
      targetMember.permissions = enabled
        ? Array.from(new Set([...current, permission]))
        : current.filter(item => item !== permission);
    });
  };

  const removeMember = (memberId: string) => {
    if (!isOwner || !account) throw new Error('Somente o titular pode remover acessos.');
    if (memberId === account.ownerMemberId) throw new Error('O acesso do titular não pode ser removido.');
    mutateAccount(target => { target.members = target.members.filter(item => item.id !== memberId); });
  };

  return {
    ready, accounts, session, account, member, isOwner, hasApp, hasPermission, canManageConfiguration,
    addMember, updateMemberApps, updateMemberPermission, removeMember, logout: logoutLocal
  };
}
