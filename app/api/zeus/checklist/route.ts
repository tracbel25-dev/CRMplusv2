import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { operationalRest } from '@/lib/server/operationalWorkspace';
import { ZEUS_CHECKLIST_SEGMENT_BY_FOLDER, ZEUS_CHECKLIST_FOLDER_LABELS } from '@/lib/operations/zeusChecklist';
import { isZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import { ZEUS_CHECKLIST_TEMPLATES } from '@/lib/operations/checklistTemplates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus', 'jobs_view');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem permissão para consultar OS.' }, { status: 403 });
  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  if (jobId && !uuid.test(jobId)) return NextResponse.json({ error: 'OS inválida.' }, { status: 400 });
  try {
    const responseParams: Record<string, string> = {
      select: 'id,link_id,job_id,response,meter_value,completed_by,created_at',
      tenant_key: `eq.${access.accountId}`,
      order: 'created_at.desc',
    };
    const linkParams: Record<string, string> = {
      select: 'id,job_id,token,title,asset_folder,segment,status,created_at,completed_at',
      tenant_key: `eq.${access.accountId}`,
      order: 'created_at.desc',
    };
    if (jobId) { responseParams.job_id = `eq.${jobId}`; linkParams.job_id = `eq.${jobId}`; }
    const [responses, links] = await Promise.all([
      operationalRest('zeus', `checklist_responses?${query(responseParams)}`),
      operationalRest('zeus', `checklist_links?${query(linkParams)}`),
    ]);
    return NextResponse.json({ responses: responses || [], links: links || [] });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível consultar os checklists.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus', 'jobs_edit');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem permissão para alterar a OS.' }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const folder = typeof body?.folder === 'string' ? body.folder : '';
  if (!uuid.test(jobId)) return NextResponse.json({ error: 'OS inválida.' }, { status: 400 });
  if (!isZeusChecklistAssetFolder(folder)) return NextResponse.json({ error: 'Modelo de checklist inválido.' }, { status: 400 });
  const segment = ZEUS_CHECKLIST_SEGMENT_BY_FOLDER[folder];
  const rawItems = Array.isArray(body?.items) ? body!.items : [];
  const items = rawItems.map(value => String(value).trim().slice(0, 180)).filter(Boolean).slice(0, 80);
  const finalItems = items.length ? items : [...ZEUS_CHECKLIST_TEMPLATES[segment].items];
  const requireSignature = body?.requireSignature !== false;

  try {
    const jobs = await operationalRest('zeus', `jobs?${query({ select: 'id,number,customer_id,asset_id,status', tenant_key: `eq.${access.accountId}`, id: `eq.${jobId}`, limit: '1' })}`) as Array<{ id: string; number: number; customer_id: string; asset_id: string; status: string }>;
    const job = jobs?.[0];
    if (!job) return NextResponse.json({ error: 'OS não encontrada no Zeus.' }, { status: 404 });
    if (['Encerrado','Cancelado','Reprovado'].includes(job.status)) return NextResponse.json({ error: 'Esta OS já está encerrada.' }, { status: 409 });

    const completed = await operationalRest('zeus', `checklist_responses?${query({ select: 'id', tenant_key: `eq.${access.accountId}`, job_id: `eq.${jobId}`, limit: '1' })}`) as Array<{ id: string }>;
    if (completed?.length) return NextResponse.json({ error: 'Este checklist já foi concluído e não pode ser realizado novamente.', completed: true }, { status: 409 });

    const existing = await operationalRest('zeus', `checklist_links?${query({ select: 'id,token,status', tenant_key: `eq.${access.accountId}`, job_id: `eq.${jobId}`, limit: '1' })}`) as Array<{ id: string; token: string; status: string }>;
    if (existing?.[0]?.status === 'open') return NextResponse.json({ token: existing[0].token, reused: true });

    const [customers, assets, settings] = await Promise.all([
      operationalRest('zeus', `customers?${query({ select: 'name,phone', tenant_key: `eq.${access.accountId}`, id: `eq.${job.customer_id}`, limit: '1' })}`) as Promise<Array<{ name: string; phone: string }>>,
      operationalRest('zeus', `assets?${query({ select: 'identifier,model,year,meter', tenant_key: `eq.${access.accountId}`, id: `eq.${job.asset_id}`, limit: '1' })}`) as Promise<Array<{ identifier: string; model: string; year: string; meter: string }>>,
      operationalRest('zeus', `tenant_settings?${query({ select: 'business,identifier_label,asset_label,meter_label', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Promise<Array<{ business: string; identifier_label: string; asset_label: string; meter_label: string }>>,
    ]);
    const customer = customers?.[0];
    const asset = assets?.[0];
    const setting = settings?.[0];
    if (!customer || !asset) return NextResponse.json({ error: 'Os dados vinculados à OS estão incompletos.' }, { status: 409 });

    const token = randomBytes(32).toString('hex');
    const payload = {
      business: setting?.business || '',
      customer: customer.name || '',
      customerPhone: customer.phone || '',
      asset: `${asset.identifier} · ${asset.model}`,
      assetInfo: { identifier: asset.identifier, model: asset.model, year: asset.year || '', meter: asset.meter || '', checklistAssetFolder: folder },
      checklistAssetFolder: folder,
      jobNumber: job.number,
      segment,
      segmentLabel: ZEUS_CHECKLIST_TEMPLATES[segment].label,
      items: finalItems,
      requireSignature,
      assetLabel: setting?.asset_label || 'Veículo',
      meterLabel: setting?.meter_label || 'Quilometragem',
      identifierLabel: setting?.identifier_label || 'Placa',
    };
    const title = `Checklist de entrada · ${ZEUS_CHECKLIST_FOLDER_LABELS[folder]} · OS ${String(job.number).padStart(4, '0')}`;
    const rows = await operationalRest('zeus', 'checklist_links', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ tenant_key: access.accountId, job_id: jobId, token, title, asset_folder: folder, segment, payload, status: 'open', created_by: access.userId }),
    }) as Array<{ token: string }>;
    return NextResponse.json({ token: rows?.[0]?.token || token, reused: false });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível preparar o checklist.' }, { status: 503 });
  }
}
