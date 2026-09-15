import { NextRequest, NextResponse } from 'next/server';
import { operationalRest, operationalRpc } from '@/lib/server/operationalWorkspace';

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

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: 'Checklist inválido.' }, { status: 404 });
  try {
    const links = await operationalRest('zeus', `checklist_links?${query({ select: 'id,job_id,title,payload,status,created_at,completed_at', token: `eq.${token}`, limit: '1' })}`) as Array<{ id: string; job_id: string; title: string; payload: Record<string, unknown>; status: string; created_at: string; completed_at: string | null }>;
    const link = links?.[0];
    if (!link) return NextResponse.json({ error: 'Este checklist não está disponível.' }, { status: 404 });
    let response: unknown = null;
    if (link.status === 'completed') {
      const rows = await operationalRest('zeus', `checklist_responses?${query({ select: 'response,created_at', link_id: `eq.${link.id}`, limit: '1' })}`) as Array<{ response: unknown; created_at: string }>;
      response = rows?.[0] || null;
    }
    return NextResponse.json({ link: { kind: 'zeus-checkin', recordId: link.job_id, title: link.title, payload: link.payload, status: link.status }, completed: link.status === 'completed', response });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Checklist indisponível.' }, { status: 503 });
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

  const answers = (Array.isArray(body.answers) ? body.answers : []).slice(0, 100).map(item => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const status = text(row.status, 40);
    return { item: text(row.item, 180), status: ['OK','Atenção','Não se aplica'].includes(status) ? status : '', note: text(row.note, 500) };
  }).filter(item => item.item && item.status);
  if (!answers.length) return NextResponse.json({ error: 'Preencha os itens da inspeção.' }, { status: 400 });

  const damage = (Array.isArray(body.damage) ? body.damage : []).slice(0, 120).map(item => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { view: text(row.view, 40), point: text(row.point, 40), type: text(row.type, 40) };
  }).filter(item => item.view && item.point && ['Amassado','Riscado','Quebrado','Faltante'].includes(item.type));

  const response = {
    segment: text(body.segment, 40),
    checklistAssetFolder: text(body.checklistAssetFolder, 80),
    name: text(body.name, 180),
    meter: text(body.meter, 80),
    notes: text(body.notes, 3000),
    customerSignature: text(body.customerSignature || body.signature, 900000),
    staffSignature: text(body.staffSignature, 900000),
    damage,
    answers,
  };
  if (!response.name) return NextResponse.json({ error: 'O responsável pela conferência não foi identificado.' }, { status: 400 });

  try {
    const result = await operationalRpc('zeus', 'submit_zeus_checklist', { p_token: token, p_response: response }) as { ok?: boolean; completed?: boolean; jobId?: string };
    if (!result?.ok && result?.completed) return NextResponse.json({ error: 'Este checklist já foi concluído.', completed: true }, { status: 409 });
    if (!result?.ok) return NextResponse.json({ error: 'Não foi possível concluir o checklist.' }, { status: 409 });
    return NextResponse.json({ ok: true, completed: true, jobId: result.jobId || '' });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Não foi possível enviar o checklist.';
    const status = /not_found|não encontrado|not found/i.test(message) ? 404 : /completed|conclu/i.test(message) ? 409 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
