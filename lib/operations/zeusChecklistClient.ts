'use client';

import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Workspace } from './storage';
import { event, setCustomValues } from './model';
import { initialJobStatus } from './zeus';
import type { ZeusChecklistAssetFolder } from './checklistAssets';
import type { ZeusChecklistSegment } from './checklistTemplates';
import {
  ZEUS_CHECKLIST_COMPLETED_AT_KEY,
  ZEUS_CHECKLIST_COMPLETED_KEY,
  ZEUS_CHECKLIST_METER_KEY,
  ZEUS_CHECKLIST_RESPONSE_KEY,
} from './zeusChecklistKeys';

type ChecklistResponseRow = {
  id: string;
  link_id: string;
  job_id: string;
  response: Record<string, unknown>;
  meter_value: string;
  completed_by: string;
  created_at: string;
};

type ChecklistLinkRow = {
  id: string;
  job_id: string;
  token: string;
  title: string;
  asset_folder: string;
  segment: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

async function authToken() {
  const { data } = await createStoreClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  return data.session.access_token;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${await authToken()}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Não foi possível acessar o checklist.') as Error & { completed?: boolean; status?: number };
    error.completed = !!payload.completed;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export async function migrateLegacyZeusChecklists() {
  return request<{ ok: boolean; imported: number }>('/api/zeus/checklist/migrate', { method: 'POST' });
}

export async function listZeusChecklists(jobId = '') {
  const params = new URLSearchParams();
  if (jobId) params.set('jobId', jobId);
  return request<{ responses: ChecklistResponseRow[]; links: ChecklistLinkRow[] }>(`/api/zeus/checklist${params.size ? `?${params}` : ''}`);
}

export async function createZeusChecklistLink(input: {
  jobId: string;
  folder: ZeusChecklistAssetFolder;
  segment: ZeusChecklistSegment;
  items: string[];
  requireSignature: boolean;
}) {
  return request<{ token: string; reused: boolean }>('/api/zeus/checklist', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function syncZeusChecklistResponse(w: Workspace, jobId: string, known?: ChecklistResponseRow) {
  if (!w.accountId || w.accountId === 'guest') return false;
  const local = w.data.customFieldValues?.[jobId] || {};
  if (local[ZEUS_CHECKLIST_COMPLETED_KEY] === 'true') return false;
  const row = known || (await listZeusChecklists(jobId)).responses[0];
  if (!row) return false;
  const meter = String(row.meter_value || row.response?.meter || '').trim();
  const completedAt = row.created_at || new Date().toISOString();
  return w.mutate(data => {
    const job = data.jobs.find(item => item.id === jobId);
    if (!job) return;
    setCustomValues(data, jobId, {
      [ZEUS_CHECKLIST_COMPLETED_KEY]: 'true',
      [ZEUS_CHECKLIST_COMPLETED_AT_KEY]: completedAt,
      [ZEUS_CHECKLIST_RESPONSE_KEY]: JSON.stringify(row.response || {}),
      [ZEUS_CHECKLIST_METER_KEY]: meter,
    });
    const asset = data.assets.find(item => item.id === job.assetId);
    if (asset && meter) asset.meter = meter;
    if (!job.events.some(item => item.text.includes('Checklist de entrada concluído'))) {
      job.events.push(event('Checklist de entrada concluído e vinculado à OS'));
    }
    if (job.stage === 'Identificação' && job.status === 'Aguardando checklist') {
      job.status = initialJobStatus(data.settings);
      job.events.push(event(`Situação: ${job.status}`));
    }
  }, 'Checklist sincronizado com a OS.');
}

export async function syncAllZeusChecklistResponses(w: Workspace) {
  if (!w.accountId || w.accountId === 'guest') return 0;
  const { responses } = await listZeusChecklists();
  const pending = responses.filter(row => w.data.customFieldValues?.[row.job_id]?.[ZEUS_CHECKLIST_COMPLETED_KEY] !== 'true');
  let count = 0;
  for (const row of pending) if (await syncZeusChecklistResponse(w, row.job_id, row)) count++;
  return count;
}

export type { ChecklistResponseRow, ChecklistLinkRow };
