'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppId, Data, initialData } from './model';

const legacyStorageKey = (app: AppId) => `crmplus:${app}:operations:v1`;
export const storageKey = (app: AppId, accountId = 'guest') => app === 'kronos'
  ? `crmplus:${accountId}:${app}:operations:v2`
  : `crmplus:${accountId}:${app}:operations:v1`;

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
    setReady(false);
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
    if (!key) { setError('A conta ainda está sendo identificada.'); return false; }
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
  }, [key, app]);

  const restore = async (raw: string) => {
    if (!key) { setError('A conta ainda está sendo identificada.'); return false; }
    try {
      const next = decodeData(raw);
      localStorage.setItem(key, JSON.stringify(next));
      ref.current = next;
      setData(next);
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
