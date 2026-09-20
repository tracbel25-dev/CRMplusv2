'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { clientMessage } from '@/lib/clientMessage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { AppId, Data, initialData } from './model';

const legacyStorageKey = (app: AppId) => `crmplus:${app}:operations:v1`;
export const storageKey = (app: AppId, accountId = 'guest') => app === 'kronos'
  ? `crmplus:${accountId}:${app}:operations:v2`
  : `crmplus:${accountId}:${app}:operations:v1`;

const cloudApp = (app: AppId) => app === 'zeus' || app === 'artemis';
const workspaceMemoryCache = new Map<string, Data>();

type PendingCloudMutation = {
  id: number;
  before: Data;
  after: Data;
  message: string;
  resolve: (ok: boolean) => void;
};

const clone = <T,>(value: T): T => structuredClone(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const plainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keyedArray = (value: unknown[]): value is Array<Record<string, unknown> & { id: string }> => value.every(item => plainObject(item) && typeof item.id === 'string');

function rebaseChange(before: unknown, after: unknown, latest: unknown): unknown {
  if (same(before, after)) return clone(latest);

  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(latest)) {
    if (keyedArray(before) && keyedArray(after) && keyedArray(latest)) {
      const beforeById = new Map(before.map(item => [item.id, item]));
      const afterById = new Map(after.map(item => [item.id, item]));
      const output = latest.map(item => clone(item));

      for (const item of before) {
        if (!afterById.has(item.id)) {
          const index = output.findIndex(current => current.id === item.id);
          if (index >= 0) output.splice(index, 1);
        }
      }

      for (const item of after) {
        const previous = beforeById.get(item.id);
        const index = output.findIndex(current => current.id === item.id);
        if (!previous) {
          if (index >= 0) output[index] = clone(item);
          else output.push(clone(item));
          continue;
        }
        if (same(previous, item)) continue;
        const current = index >= 0 ? output[index] : previous;
        const rebased = rebaseChange(previous, item, current) as Record<string, unknown> & { id: string };
        if (index >= 0) output[index] = rebased;
        else output.push(rebased);
      }
      return output;
    }
    return clone(after);
  }

  if (plainObject(before) && plainObject(after) && plainObject(latest)) {
    const output = clone(latest);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (!(key in after)) {
        delete output[key];
        continue;
      }
      if (!(key in before)) {
        output[key] = clone(after[key]);
        continue;
      }
      output[key] = rebaseChange(before[key], after[key], latest[key]);
    }
    return output;
  }

  return clone(after);
}

function applyMutation(mutation: PendingCloudMutation, latest: Data) {
  return rebaseChange(mutation.before, mutation.after, latest) as Data;
}

function initialForApp(app: AppId): Data {
  const data = initialData();
  if (app === 'kronos') {
    data.settings.salesStages = ['Identificado', 'Contato iniciado', 'Interesse confirmado', 'Proposta', 'Negociação'];
  }
  return data;
}

export function decodeData(raw: string): Data {
  const value = JSON.parse(raw);
  const base = initialData();
  if (value?.version !== 1 || !value.settings || Object.keys(base).some(k => Array.isArray(base[k as keyof Data]) && !Array.isArray(value[k]))) throw new Error('Os dados salvos não puderam ser lidos. Exporte uma cópia antes de restaurar.');
  for (const j of value.jobs) {
    j.tasks ??= [];
    if (!Array.isArray(j.tasks) || !j.quote || !Array.isArray(j.quote.lines) || !Array.isArray(j.attachments)) throw new Error('Ficha de atendimento inválida na cópia.');
  }
  for (const key of ['quotes', 'orders']) for (const item of value[key]) if (!Array.isArray(item.lines) || !Number.isFinite(item.number)) throw new Error('Documento inválido na cópia.');
  for (const survey of value.surveys) if (!Array.isArray(survey.questions)) throw new Error('Pesquisa inválida na cópia.');
  return { ...base, ...value, settings: { ...base.settings, ...value.settings } };
}

function mirrorConfigurationCache(app: AppId, accountId: string, data: Data) {
  if (typeof window === 'undefined') return;
  const prefs = data.settings.operationPreferences;
  if (!prefs || typeof prefs !== 'object') return;
  localStorage.setItem(`crmplus:${accountId}:${app}:configuration:v1`, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('crmplus:configuration', { detail: { app, accountId } }));
}

async function sessionToken() {
  const { data } = await createStoreClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
  return token;
}

type CloudPayload = { data: Data | null; revision: number; conflict?: boolean; error?: string };

async function cloudRequest(app: 'zeus' | 'artemis', accountId: string, method: 'GET' | 'PUT', data?: Data, expectedRevision = 0): Promise<CloudPayload> {
  if (!accountId || accountId === 'guest') throw new Error('A conta ainda não foi identificada.');
  const token = await sessionToken();
  const response = await fetch(`/api/operations/${app}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'x-crmplus-account-id': accountId,
      ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}),
    },
    body: method === 'PUT' ? JSON.stringify({ data, expectedRevision }) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as CloudPayload;
  if (response.status === 409 && payload.conflict) return payload;
  if (!response.ok) throw new Error(payload.error || `Não foi possível ${method === 'GET' ? 'carregar' : 'salvar'} os dados.`);
  return payload;
}

function legacyRawForCloud(app: AppId, accountId: string) {
  // Dados operacionais só podem migrar quando já estão vinculados à mesma conta.
  // Nunca reutilizar o storage legado global em uma conta cloud vazia: ele pode
  // ter sido criado por outro cliente que usou este navegador anteriormente.
  return localStorage.getItem(storageKey(app, accountId));
}

function clearLegacyCloudData(app: AppId, accountId: string) {
  localStorage.removeItem(storageKey(app, accountId));
  localStorage.setItem(`crmplus:${app}:cloud-migrated:${accountId}`, new Date().toISOString());
}

export function useWorkspace(app: AppId, accountId?: string) {
  const key = accountId ? storageKey(app, accountId) : '';
  const cachedAtMount = key ? workspaceMemoryCache.get(key) : undefined;
  const [data, setData] = useState<Data>(() => cachedAtMount || initialForApp(app));
  const [ready, setReady] = useState(() => !!cachedAtMount);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'confirmed' | 'failed'>('idle');
  const ref = useRef(data);
  const confirmedRef = useRef(data);
  const blocked = useRef(false);
  const pendingCloud = useRef<PendingCloudMutation[]>([]);
  const savingCloud = useRef(false);
  const mutationSequence = useRef(0);

  const publish = useCallback((next: Data) => {
    ref.current = next;
    if (key) workspaceMemoryCache.set(key, next);
    setData(next);
    mirrorConfigurationCache(app, accountId || 'guest', next);
  }, [app, key]);

  const rebuildVisible = useCallback(() => {
    let visible = clone(confirmedRef.current);
    for (const mutation of pendingCloud.current) visible = applyMutation(mutation, visible);
    publish(visible);
  }, [publish]);

  const flushCloudQueue = useCallback(async () => {
    if (savingCloud.current || !cloudApp(app) || !accountId || accountId === 'guest') return;
    savingCloud.current = true;
    setSyncState('saving');
    try {
      while (pendingCloud.current.length) {
        const mutation = pendingCloud.current[0];
        try {
          let base = clone(confirmedRef.current);
          let candidate = applyMutation(mutation, base);
          let result = await cloudRequest(app, accountId, 'PUT', candidate, base.revision);

          if (result.conflict && result.data) {
            base = decodeData(JSON.stringify(result.data));
            confirmedRef.current = base;
            candidate = applyMutation(mutation, base);
            result = await cloudRequest(app, accountId, 'PUT', candidate, base.revision);
          }

          if (result.conflict || !result.data) {
            if (result.data) confirmedRef.current = decodeData(JSON.stringify(result.data));
            throw new Error('As informações foram atualizadas enquanto você salvava. Tente novamente.');
          }

          confirmedRef.current = decodeData(JSON.stringify(result.data));
          pendingCloud.current = pendingCloud.current.filter(item => item.id !== mutation.id);
          rebuildVisible();
          setError('');
          setSyncState('confirmed');
          if (mutation.message) setNotice(mutation.message);
          mutation.resolve(true);
        } catch (reason) {
          pendingCloud.current = pendingCloud.current.filter(item => item.id !== mutation.id);
          try { rebuildVisible(); } catch { publish(confirmedRef.current); }
          setError(clientMessage(reason, 'Não foi possível salvar agora. Tente novamente.'));
          setSyncState('failed');
          mutation.resolve(false);
        }
      }
    } finally {
      savingCloud.current = false;
      if (pendingCloud.current.length) queueMicrotask(() => { void flushCloudQueue(); });
    }
  }, [accountId, app, publish, rebuildVisible]);

  useEffect(() => {
    if (!key || !accountId) { setReady(false); return; }
    for (const mutation of pendingCloud.current) mutation.resolve(false);
    pendingCloud.current = [];
    savingCloud.current = false;
    let cancelled = false;
    const cached = workspaceMemoryCache.get(key);
    if (cached) {
      ref.current = cached;
      confirmedRef.current = cached;
      setData(cached);
      blocked.current = false;
      setError('');
      setSyncState('confirmed');
      setReady(true);
    } else {
      setReady(false);
      setError('');
    }

    if (cloudApp(app) && accountId !== 'guest') {
      const load = async () => {
        try {
          const remote = await cloudRequest(app, accountId, 'GET');
          if (cancelled) return;
          let next: Data;
          if (remote.data) {
            next = decodeData(JSON.stringify(remote.data));
          } else {
            const legacy = legacyRawForCloud(app, accountId);
            if (legacy) {
              const migrated = decodeData(legacy);
              migrated.revision = 0;
              const saved = await cloudRequest(app, accountId, 'PUT', migrated, 0);
              if (!saved.data) throw new Error('Não foi possível concluir a atualização dos seus dados.');
              next = decodeData(JSON.stringify(saved.data));
              clearLegacyCloudData(app, accountId);
              if (!cancelled) setNotice('Seus dados anteriores foram importados com sucesso.');
            } else {
              next = initialForApp(app);
            }
          }
          if (cancelled) return;
          confirmedRef.current = next;
          publish(next);
          blocked.current = false;
          setError('');
          setSyncState('confirmed');
        } catch (e) {
          if (cancelled) return;
          blocked.current = true;
          setError(clientMessage(e, 'Não foi possível carregar suas informações. Tente novamente.'));
          setSyncState('failed');
        } finally {
          if (!cancelled) setReady(true);
        }
      };
      void load();
      return () => { cancelled = true; };
    }

    const scopedRaw = () => {
      let raw = localStorage.getItem(key);
      if (!raw && accountId !== 'guest' && app !== 'kronos') {
        const legacyKey = legacyStorageKey(app);
        const migratedKey = `${legacyKey}:migrated-account`;
        const legacy = localStorage.getItem(legacyKey);
        const migratedAccount = localStorage.getItem(migratedKey);
        if (legacy && !migratedAccount) {
          localStorage.setItem(key, legacy);
          localStorage.setItem(migratedKey, accountId);
          raw = legacy;
        }
      }
      return raw;
    };
    function sync() {
      try {
        const raw = scopedRaw();
        const next = raw ? decodeData(raw) : initialForApp(app);
        confirmedRef.current = next;
        publish(next);
        blocked.current = false;
        setError('');
      } catch (e) {
        blocked.current = true;
        setError(clientMessage(e, 'Não foi possível carregar suas informações. Tente novamente.'));
      }
      setReady(true);
    }
    sync();
    const listener = (e: StorageEvent) => { if (e.key === key) sync(); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [key, accountId, app, publish]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const mutate = useCallback(async (fn: (d: Data) => void, message = 'Alteração salva.') => {
    if (!key || !accountId) { setError('A conta ainda está sendo identificada.'); return false; }

    if (cloudApp(app) && accountId !== 'guest') {
      try {
        if (blocked.current) throw new Error('Aguarde o carregamento das informações antes de continuar.');
        const before = clone(ref.current);
        const after = clone(before);
        fn(after);
        const id = ++mutationSequence.current;
        const result = new Promise<boolean>(resolve => {
          pendingCloud.current.push({ id, before, after, message, resolve });
        });
        publish(after);
        setError('');
        setSyncState('saving');
        void flushCloudQueue();
        return await result;
      } catch (e) {
        setError(clientMessage(e, 'Não foi possível salvar agora. Tente novamente.'));
        return false;
      }
    }

    const update = () => {
      try {
        if (blocked.current) throw new Error('Aguarde o carregamento das informações antes de continuar.');
        const raw = localStorage.getItem(key);
        const next = raw ? decodeData(raw) : initialForApp(app);
        fn(next);
        next.revision++;
        localStorage.setItem(key, JSON.stringify(next));
        confirmedRef.current = next;
        publish(next);
        setError('');
        setNotice(message);
        setSyncState('confirmed');
        return true;
      } catch (e) {
        setError((e as Error).name === 'QuotaExceededError' ? 'Não há espaço suficiente para salvar agora. Faça uma cópia dos seus dados e remova anexos que não precisa.' : clientMessage(e, 'Não foi possível salvar agora. Tente novamente.'));
        setSyncState('failed');
        return false;
      }
    };
    return navigator.locks ? navigator.locks.request(key, update) : update();
  }, [key, app, accountId, flushCloudQueue, publish]);

  const restore = async (raw: string) => {
    if (!key || !accountId) { setError('A conta ainda está sendo identificada.'); return false; }
    if (pendingCloud.current.length) { setError('Aguarde as alterações atuais terminarem de salvar antes de restaurar uma cópia.'); return false; }
    try {
      const next = decodeData(raw);
      if (cloudApp(app) && accountId !== 'guest') {
        next.revision = confirmedRef.current.revision;
        const result = await cloudRequest(app, accountId, 'PUT', next, confirmedRef.current.revision);
        if (result.conflict || !result.data) throw new Error('As informações mudaram durante a restauração. Atualize e tente novamente.');
        const saved = decodeData(JSON.stringify(result.data));
        confirmedRef.current = saved;
        publish(saved);
      } else {
        localStorage.setItem(key, JSON.stringify(next));
        confirmedRef.current = next;
        publish(next);
      }
      blocked.current = false;
      setError('');
      setNotice('Cópia restaurada.');
      return true;
    } catch (e) {
      setError(clientMessage(e, 'Não foi possível restaurar esta cópia. Tente novamente.'));
      return false;
    }
  };

  return { app, accountId: accountId || '', data, ready, error, notice, syncState, mutate, restore, setError, setNotice };
}

export type Workspace = ReturnType<typeof useWorkspace>;
export const WorkspaceContext = createContext<Workspace | null>(null);
export const useCurrentWorkspace = () => useContext(WorkspaceContext);

export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(name: string, rows: unknown[][]) {
  download(name, '\uFEFF' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"').join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
