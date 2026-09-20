import { NextRequest, NextResponse } from 'next/server';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { operationalRest, operationalRpc } from '@/lib/server/operationalWorkspace';
import { requireZeusFeature, planFeatureError } from '@/lib/server/zeusPlanAccess';
import { isZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import { ZEUS_CHECKLIST_SEGMENT_BY_FOLDER } from '@/lib/operations/zeusChecklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function query(params: Record<string, string>) { return new URLSearchParams(params).toString(); }

async function storeRows<T>(path: string, token: string): Promise<T[]> {
  const response = await fetch(`${STORE_SUPABASE.url}/rest/v1/${path}`, {
    headers: { apikey: STORE_SUPABASE.publishableKey, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  return response.json() as Promise<T[]>;
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus', 'jobs_edit');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem permissão para migrar checklists.' }, { status: 403 });
  try {
    await requireZeusFeature(access.accountId, 'checklist');
    const [links, responses] = await Promise.all([
      storeRows<{ token: string; record_id: string; title: string; payload: Record<string, unknown>; created_at: string }>(`external_links?${query({ select: 'token,record_id,title,payload,created_at', account_id: `eq.${access.accountId}`, app_id: 'eq.zeus', kind: 'eq.zeus-checkin', order: 'created_at.asc' })}`, access.token),
      storeRows<{ record_id: string; response: Record<string, unknown>; created_at: string }>(`external_link_responses?${query({ select: 'record_id,response,created_at', account_id: `eq.${access.accountId}`, app_id: 'eq.zeus', kind: 'eq.zeus-checkin', order: 'created_at.asc' })}`, access.token),
    ]);
    if (!links.length) return NextResponse.json({ ok: true, imported: 0 });
    const responseByJob = new Map(responses.map(row => [row.record_id, row]));
    let imported = 0;

    for (const legacy of links) {
      if (!legacy.record_id || !legacy.token) continue;
      const jobs = await operationalRest('zeus', `jobs?${query({ select: 'id', tenant_key: `eq.${access.accountId}`, id: `eq.${legacy.record_id}`, limit: '1' })}`) as Array<{ id: string }>;
      if (!jobs?.length) continue;
      const current = await operationalRest('zeus', `checklist_links?${query({ select: 'id,token,status', tenant_key: `eq.${access.accountId}`, job_id: `eq.${legacy.record_id}`, limit: '1' })}`) as Array<{ id: string; token: string; status: string }>;
      let token = current?.[0]?.token || legacy.token;
      if (!current?.length) {
        const payload = legacy.payload || {};
        const requested = String(payload.checklistAssetFolder || (payload.assetInfo as Record<string, unknown> | undefined)?.checklistAssetFolder || '');
        const folder = isZeusChecklistAssetFolder(requested) ? requested : 'carro';
        const segment = ZEUS_CHECKLIST_SEGMENT_BY_FOLDER[folder];
        await operationalRest('zeus', 'checklist_links', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ tenant_key: access.accountId, job_id: legacy.record_id, token, title: legacy.title || 'Checklist de entrada', asset_folder: folder, segment, payload, status: 'open', created_by: access.userId, created_at: legacy.created_at }),
        });
        imported++;
      }
      const legacyResponse = responseByJob.get(legacy.record_id);
      if (legacyResponse) {
        const existingResponse = await operationalRest('zeus', `checklist_responses?${query({ select: 'id', tenant_key: `eq.${access.accountId}`, job_id: `eq.${legacy.record_id}`, limit: '1' })}`) as Array<{ id: string }>;
        if (!existingResponse?.length) {
          const response = { ...(legacyResponse.response || {}), migratedFromStore: true, migratedAt: new Date().toISOString() };
          await operationalRpc('zeus', 'submit_zeus_checklist', { p_token: token, p_response: response });
          imported++;
        }
      }
    }
    return NextResponse.json({ ok: true, imported });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível migrar os checklists antigos.' }, { status: 503 });
  }
}
