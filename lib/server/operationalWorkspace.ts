import { readOperationalSupabaseConfig } from '@/lib/supabase/operationalConfig';

export type CloudOperationalApp = 'zeus' | 'artemis';

function config(app: CloudOperationalApp) {
  const current = readOperationalSupabaseConfig(app);
  if (!current.secretKey) throw new Error(`${app === 'zeus' ? 'ZEUS' : 'ARTEMIS'}_SUPABASE_SECRET_KEY não configurada no servidor.`);
  return current;
}

export async function operationalRest(app: CloudOperationalApp, path: string, init: RequestInit = {}) {
  const current = config(app);
  const headers = new Headers(init.headers);
  headers.set('apikey', current.secretKey);
  headers.set('authorization', `Bearer ${current.secretKey}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${current.url}/rest/v1/${path}`, { ...init, headers, cache: 'no-store' });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = payload && typeof payload === 'object' ? (payload.message || payload.hint || payload.details) : '';
    throw new Error(String(detail || `O banco do ${app === 'zeus' ? 'Zeus' : 'Artemis'} respondeu ${response.status}.`));
  }
  return payload;
}

export async function operationalRpc(app: CloudOperationalApp, name: string, body: unknown) {
  return operationalRest(app, `rpc/${name}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}
