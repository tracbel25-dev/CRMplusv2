import { NextRequest, NextResponse } from 'next/server';
import type { Data } from '@/lib/operations/model';
import { clientMessage } from '@/lib/clientMessage';
import { ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from '@/lib/operations/checklistTemplates';
import { isZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import { zeusChecklistState } from '@/lib/operations/zeusChecklist';
import { operationalRest, operationalRpc } from '@/lib/server/operationalWorkspace';
import { requireZeusFeature } from '@/lib/server/zeusPlanAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function validToken(value: string) {
  return /^[0-9a-f]{64}$/i.test(value);
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function signature(value: unknown) {
  const current = String(value ?? '');
  if (!current) return '';
  if (!current.startsWith('data:image/png;base64,') || current.length > 400000) throw new Error('Assinatura inválida ou muito grande.');
  return current;
}

type PublicChecklistLink = {
  id: string;
  tenant_key: string;
  job_id: string;
  title: string;
  asset_folder: string;
  segment: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type PublicChecklistJob = { id: string; stage: string; status: string };

async function loadLink(token: string) {
  const links = await operationalRest('zeus', `checklist_links?${query({
    select: 'id,tenant_key,job_id,title,asset_folder,segment,payload,status,created_at,completed_at',
    token: `eq.${token}`,
    limit: '1',
  })}`) as PublicChecklistLink[];
  return links?.[0] || null;
}

async function validateOpenLink(link: PublicChecklistLink) {
  const [jobs, workspaces] = await Promise.all([
    operationalRest('zeus', `jobs?${query({
      select: 'id,stage,status',
      tenant_key: `eq.${link.tenant_key}`,
      id: `eq.${link.job_id}`,
      limit: '1',
    })}`) as Promise<PublicChecklistJob[]>,
    operationalRest('zeus', `workspace_state?${query({
      select: 'data',
      tenant_key: `eq.${link.tenant_key}`,
      limit: '1',
    })}`) as Promise<Array<{ data: Data }>>,
  ]);
  const job = jobs?.[0];
  const workspace = workspaces?.[0]?.data;
  if (!job || !workspace) return { ok: false as const, error: 'A OS vinculada a este checklist não está disponível.' };
  if (job.stage !== 'Identificação' || ['Encerrado','Cancelado','Reprovado'].includes(job.status)) {
    return { ok: false as const, error: 'Este checklist não está mais ativo porque a OS já saiu da Identificação.' };
  }
  const state = zeusChecklistState(workspace, link.job_id);
  if (!state.enabled) return { ok: false as const, error: 'O checklist foi desabilitado nesta OS.' };
  if (!isZeusChecklistAssetFolder(link.asset_folder) || state.folder !== link.asset_folder) {
    return { ok: false as const, error: 'O tipo deste checklist foi alterado. Abra novamente pela OS.' };
  }
  return { ok: true as const, workspace, job, state };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'Checklist inválido.' }, { status: 404 });
  try {
    const link = await loadLink(token);
    if (!link) return NextResponse.json({ error: 'Este checklist não está disponível.' }, { status: 404 });
    await requireZeusFeature(link.tenant_key, 'checklist');
    if (link.status === 'cancelled') return NextResponse.json({ error: 'Este checklist não está mais ativo.' }, { status: 410 });

    let response: unknown = null;
    if (link.status === 'completed') {
      const rows = await operationalRest('zeus', `checklist_responses?${query({ select: 'response,created_at', link_id: `eq.${link.id}`, limit: '1' })}`) as Array<{ response: unknown; created_at: string }>;
      response = rows?.[0] || null;
    } else {
      const validation = await validateOpenLink(link);
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });
    }

    return NextResponse.json({
      link: { kind: 'zeus-checkin', recordId: link.job_id, title: link.title, payload: link.payload, status: link.status },
      completed: link.status === 'completed',
      response,
    });
  } catch (reason) {
    return NextResponse.json({ error: clientMessage(reason, 'Não foi possível abrir o checklist agora. Tente novamente.') }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'Checklist inválido.' }, { status: 404 });
  const raw = await request.text();
  if (!raw || Buffer.byteLength(raw, 'utf8') > 3 * 1024 * 1024) return NextResponse.json({ error: 'O checklist excedeu o tamanho permitido.' }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }

  try {
    const link = await loadLink(token);
    if (!link) return NextResponse.json({ error: 'Este checklist não está disponível.' }, { status: 404 });
    await requireZeusFeature(link.tenant_key, 'checklist');
    if (link.status === 'completed') return NextResponse.json({ error: 'Este checklist já foi concluído.', completed: true }, { status: 409 });
    if (link.status !== 'open') return NextResponse.json({ error: 'Este checklist não está mais ativo.' }, { status: 410 });

    const validation = await validateOpenLink(link);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 });

    const segment = (['auto','moto','truck','machine'].includes(link.segment) ? link.segment : 'auto') as ZeusChecklistSegment;
    const payloadItems = Array.isArray(link.payload?.items) ? link.payload.items.map(item => text(item, 180)).filter(Boolean) : [];
    const expectedItems = payloadItems.length ? payloadItems : [...ZEUS_CHECKLIST_TEMPLATES[segment].items];
    const supplied = Array.isArray(body.answers) ? body.answers.slice(0, 120) : [];
    const answerByItem = new Map<string, { item: string; status: string; note: string }>();
    for (const item of supplied) {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const itemName = text(row.item, 180);
      const status = text(row.status, 40);
      if (!itemName || !['OK','Atenção','Não se aplica'].includes(status) || answerByItem.has(itemName)) continue;
      answerByItem.set(itemName, { item: itemName, status, note: text(row.note, 500) });
    }
    const missing = expectedItems.find(item => !answerByItem.has(item));
    if (missing) return NextResponse.json({ error: `Responda o item: ${missing}` }, { status: 400 });
    const answers = expectedItems.map(item => answerByItem.get(item)!);

    const customerSignature = signature(body.customerSignature || body.signature);
    const staffSignature = signature(body.staffSignature);
    if (link.payload?.requireSignature !== false && !customerSignature) {
      return NextResponse.json({ error: 'A assinatura do cliente/responsável é obrigatória.' }, { status: 400 });
    }

    const damage = (Array.isArray(body.damage) ? body.damage : []).slice(0, 120).map(item => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return { view: text(row.view, 40), point: text(row.point, 40), type: text(row.type, 40) };
    }).filter(item => item.view && item.point && ['Amassado','Riscado','Quebrado','Faltante'].includes(item.type));

    const name = text(link.payload?.customer, 180) || text(body.name, 180);
    if (!name) return NextResponse.json({ error: 'O responsável pela conferência não foi identificado.' }, { status: 400 });

    const response = {
      segment,
      checklistAssetFolder: link.asset_folder,
      name,
      meter: text(body.meter, 80),
      notes: text(body.notes, 3000),
      customerSignature,
      staffSignature,
      damage,
      answers,
    };

    const result = await operationalRpc('zeus', 'submit_zeus_checklist', { p_token: token, p_response: response }) as { ok?: boolean; completed?: boolean; jobId?: string };
    if (!result?.ok && result?.completed) return NextResponse.json({ error: 'Este checklist já foi concluído.', completed: true }, { status: 409 });
    if (!result?.ok) return NextResponse.json({ error: 'Não foi possível concluir o checklist.' }, { status: 409 });
    return NextResponse.json({ ok: true, completed: true, jobId: result.jobId || '' });
  } catch (reason) {
    const rawMessage = reason instanceof Error ? reason.message : '';
    const status = /not_found|não encontrado|not found/i.test(rawMessage) ? 404 : /completed|conclu/i.test(rawMessage) ? 409 : 503;
    const fallback = status === 404 ? 'Este checklist não está disponível.' : status === 409 ? 'Este checklist já foi concluído.' : 'Não foi possível enviar o checklist agora. Tente novamente.';
    return NextResponse.json({ error: clientMessage(reason, fallback) }, { status });
  }
}
