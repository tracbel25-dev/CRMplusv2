import { readOperationalSupabaseConfig } from '@/lib/supabase/operationalConfig';

function config() {
  const value = readOperationalSupabaseConfig('artemis');
  if (!value.secretKey) throw new Error('ARTEMIS_SUPABASE_SECRET_KEY não configurada no servidor.');
  return value;
}

export function artemisSlug(value: string, accountId: string) {
  const base = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 38) || 'restaurante';
  const suffix = accountId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(-8) || 'crmplus';
  return `${base}-${suffix}`.slice(0, 50);
}

export async function artemisRest(path: string, init: RequestInit = {}) {
  const current = config();
  const headers = new Headers(init.headers);
  headers.set('apikey', current.secretKey);
  headers.set('authorization', `Bearer ${current.secretKey}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${current.url}/rest/v1/${path}`, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; hint?: string } | null;
    throw new Error(payload?.message || payload?.hint || `Supabase Artemis respondeu ${response.status}.`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function artemisRpc(name: string, body: unknown) {
  return artemisRest(`rpc/${name}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}
