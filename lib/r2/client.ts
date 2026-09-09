'use client';

import { createStoreClient } from '@/lib/supabase/storeClient';
import type { R2App } from './server';

export class R2AuthRequiredError extends Error {
  code = 'R2_AUTH_REQUIRED' as const;
  constructor() { super('Entre com sua conta para usar o armazenamento em nuvem.'); }
}

async function accessToken() {
  const supabase = createStoreClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new R2AuthRequiredError();
  return token;
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return new Error(typeof payload?.error === 'string' ? payload.error : `Falha no armazenamento (${response.status}).`);
}

export async function uploadOperationalFile(app: R2App, file: File) {
  const token = await accessToken();
  const form = new FormData();
  form.set('file', file);
  const response = await fetch(`/api/storage/${app}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    if (response.status === 401) throw new R2AuthRequiredError();
    throw await readError(response);
  }
  return response.json() as Promise<{ key: string; url: string; name: string; type: string; size: number }>;
}

export async function resolveOperationalFile(app: R2App, key: string) {
  const token = await accessToken();
  const response = await fetch(`/api/storage/${app}?key=${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 401) throw new R2AuthRequiredError();
    throw await readError(response);
  }
  const payload = await response.json();
  return String(payload.url || '');
}

export async function deleteOperationalFile(app: R2App, key: string) {
  const token = await accessToken();
  const response = await fetch(`/api/storage/${app}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new R2AuthRequiredError();
    throw await readError(response);
  }
}
