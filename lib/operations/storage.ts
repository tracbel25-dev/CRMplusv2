'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { AppId, Data, initialData } from './model';

const legacyStorageKey = (app: AppId) => `crmplus:${app}:operations:v1`;
export const storageKey = (app: AppId, accountId = 'guest') => app === 'kronos'
  ? `crmplus:${accountId}:${app}:operations:v2`
  : `crmplus:${accountId}:${app}:operations:v1`;

const cloudApp = (app: AppId) => app === 'zeus' || app === 'artemis';

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

function mirrorConfigurationCache(app: AppId, data: Data) {
  if (typeof window === 'undefined') return;
  const prefs = data.settings.operationPreferences;
  if (!prefs || typeof prefs !== 'object') return;
  localStorage.setItem(`crmplus:${app}:configuration:v1`, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('crmplus:configuration', { detail: { app } }));
}

async function sessionToken() {
  const { data } = await createStoreClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
  return token;
}

type CloudPayload = { data: Data | null; revision: number; conflict?: boolean; error?: string };

async function cloudRequest(app: 'zeus' | 'artemis', method: 'GET' | 'PUT', data?: Data, expectedRevision = 0): Promise<CloudPayload> {
  const token = await sessionToken();
  const response = await fetch(`/api/operations/${app}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
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
  const scoped = localStorage.getItem(storageKey(app, accountId));
  if (scoped) return scoped;
  return localStorage.getItem(legacyStorageKey(app));
}

function clearLegacyCloudData(app: AppId, accountId: string) {
  localStorage.removeItem(storageKey(app, accountId));
  localStorage.removeItem(legacyStorageKey(app));
  localStorage.setItem(`crmplus:${app}:cloud-migrated:${accountId}`, new Date().toISOString());
}

export function useWorkspace(app: AppId, accountId?: string) {
  const [data, setData] = useState<Data>(() => initialForApp(app));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const key = accountId ? storageKey(app, accountId) : '';
  const ref = useRef(data);
  const blocked = useRef(false);

  useEffect(() => {
    if (!key || !accountId) { setReady(false); return; }
    let cancelled = false;
    setReady(false);
    setError('');

    if (cloudApp(app) && accountId !== 'guest') {
      const load = async () => {
        try {
          const remote = await cloudRequest(app, 'GET');
          if (cancelled) return;
          let next: Data;
          if (remote.data) {
            next = decodeData(JSON.stringify(remote.data));
          } else {
            const legacy = legacyRawForCloud(app, accountId);
            if (legacy) {
              const migrated = decodeData(legacy);
              migrated.revision = 0;
              const saved = await cloudRequest(app, 'PUT', migrated, 0);
              if (!saved.data) throw new Error('O banco não confirmou a migração dos dados deste navegador.');
              next = decodeData(JSON.stringify(saved.data));
              clearLegacyCloudData(app, accountId);
              if (!cancelled) setNotice('Seus dados anteriores foram migrados para a nuvem.');
            } else {
              next = initialForApp(app);
            }
          }
          if (cancelled) return;
          ref.current = next;
          setData(next);
          mirrorConfigurationCache(app, next);
          blocked.current = false;
          setError('');
        } catch (e) {
          if (cancelled) return;
          blocked.current = true;
          setError((e as Error).message);
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
        ref.current = next;
        setData(next);
        blocked.current = false;
        setError('');
      } catch (e) {
        blocked.current = true;
        setError((e as Error).message);
      }
      setReady(true);
    }
    sync();
    const listener = (e: StorageEvent) => { if (e.key === key) sync(); };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [key, accountId, app]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const mutate = useCallback(async (fn: (d: Data) => void, message = 'Alteração salva.') => {
    if (!key || !accountId) { setError('A conta ainda está sendo identificada.'); return false; }

    if (cloudApp(app) && accountId !== 'guest') {
      try {
        if (blocked.current) throw new Error('Os dados da nuvem precisam ser carregados antes de continuar.');
        const base = structuredClone(ref.current);
        fn(base);
        let result = await cloudRequest(app, 'PUT', base, ref.current.revision);
        if (result.conflict && result.data) {
          const latest = decodeData(JSON.stringify(result.data));
          const retry = structuredClone(latest);
          fn(retry);
          result = await cloudRequest(app, 'PUT', retry, latest.revision);
        }
        if (result.conflict || !result.data) throw new Error('Outra pessoa atualizou estes dados agora. O Zeus/Artemis carregou a versão mais recente; repita a alteração.');
        const next = decodeData(JSON.stringify(result.data));
        ref.current = next;
        setData(next);
        mirrorConfigurationCache(app, next);
        setError('');
        setNotice(message);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    }

    const update = () => {
      try {
        if (blocked.current) throw new Error('Os dados locais precisam ser recuperados antes de continuar.');
        const raw = localStorage.getItem(key);
        const next = raw ? decodeData(raw) : initialForApp(app);
        fn(next);
        next.revision++;
        localStorage.setItem(key, JSON.stringify(next));
        ref.current = next;
        setData(next);
        setError('');
        setNotice(message);
        return true;
      } catch (e) {
        setError((e as Error).name === 'QuotaExceededError' ? 'O armazenamento deste navegador está cheio. Exporte seus dados e remova anexos que não precisa.' : (e as Error).message);
        return false;
      }
    };
    return navigator.locks ? navigator.locks.request(key, update) : update();
  }, [key, app, accountId]);

  const restore = async (raw: string) => {
    if (!key || !accountId) { setError('A conta ainda está sendo identificada.'); return false; }
    try {
      const next = decodeData(raw);
      if (cloudApp(app) && accountId !== 'guest') {
        next.revision = ref.current.revision;
        const result = await cloudRequest(app, 'PUT', next, ref.current.revision);
        if (result.conflict || !result.data) throw new Error('Os dados mudaram enquanto a cópia era restaurada. Atualize e tente novamente.');
        const saved = decodeData(JSON.stringify(result.data));
        ref.current = saved;
        setData(saved);
        mirrorConfigurationCache(app, saved);
      } else {
        localStorage.setItem(key, JSON.stringify(next));
        ref.current = next;
        setData(next);
      }
      blocked.current = false;
      setError('');
      setNotice('Cópia restaurada.');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  return { app, accountId: accountId || '', data, ready, error, notice, mutate, restore, setError, setNotice };
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
