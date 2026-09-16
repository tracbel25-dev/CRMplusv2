import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { operationalRest, operationalRpc, type CloudOperationalApp } from '@/lib/server/operationalWorkspace';
import { assertZeusWorkspacePermissions } from '@/lib/server/zeusWorkspacePermissions';
import type { Data } from '@/lib/operations/model';
import { zeusChecklistState } from '@/lib/operations/zeusChecklist';
import { ZEUS_RELATED_JOB_KEY } from '@/lib/operations/zeusChecklistKeys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WORKSPACE_BYTES = 8 * 1024 * 1024;

function cloudApp(value: string): CloudOperationalApp | null {
  return value === 'zeus' || value === 'artemis' ? value : null;
}

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function validWorkspace(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !data.settings || typeof data.settings !== 'object') return false;
  const arrays = ['customers','assets','jobs','appointments','products','orders','tables','payments','shifts','movements','stockMovements','surveys','responses','deals','tasks','quotes'];
  return arrays.every(key => Array.isArray(data[key]));
}

function validArtemisImageKey(value: unknown, accountId: string, productId: string) {
  const key = typeof value === 'string' ? value.trim() : '';
  const prefix = `accounts/${accountId}/cardapio/${productId}/`;
  return key && key.startsWith(prefix) && !key.includes('..') ? key : '';
}

async function hydrateArtemisProductImages(data: Record<string, unknown>, accountId: string) {
  const imageRows = await operationalRest('artemis', `products?${query({
    select: 'id,image_object_key',
    tenant_key: `eq.${accountId}`,
  })}`) as Array<{ id?: string; image_object_key?: string | null }>;

  const imageByProduct = new Map(imageRows.map(row => [String(row.id || ''), row.image_object_key || '']));
  const hydrated = structuredClone(data);
  const products = hydrated.products as Array<Record<string, unknown>>;
  for (const product of products) {
    const productId = String(product.id || '');
    const key = validArtemisImageKey(imageByProduct.get(productId), accountId, productId);
    if (key) product.imageObjectKey = key;
  }
  return hydrated;
}

function validateZeusTransition(current: Data | null, next: Data) {
  const currentJobs = new Map((current?.jobs || []).map(job => [job.id, job]));
  for (const job of next.jobs) {
    const previous = currentJobs.get(job.id);
    if (previous?.stage === 'Identificação' && job.stage !== 'Identificação') {
      const nextChecklist = zeusChecklistState(next, job.id);
      const currentChecklist = current ? zeusChecklistState(current, job.id) : null;
      if ((nextChecklist.enabled || currentChecklist?.enabled) && !nextChecklist.completed && !currentChecklist?.completed) {
        throw new Error('CHECKLIST_REQUIRED: conclua o checklist de entrada antes de avançar a OS.');
      }
    }

    const values = next.customFieldValues?.[job.id] || {};
    const relatedId = String(values[ZEUS_RELATED_JOB_KEY] || '').trim();
    if (relatedId) {
      if (relatedId === job.id) throw new Error('RELATED_JOB_INVALID: uma OS não pode ser relacionada a ela mesma.');
      const related = next.jobs.find(item => item.id === relatedId);
      if (!related) throw new Error('RELATED_JOB_INVALID: a OS de origem não foi encontrada.');
      if (related.customerId !== job.customerId || related.assetId !== job.assetId) {
        throw new Error('RELATED_JOB_INVALID: retorno/garantia deve apontar para uma OS do mesmo cliente e veículo/equipamento.');
      }
    }
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app: raw } = await params;
  const app = cloudApp(raw);
  if (!app) return NextResponse.json({ error: 'Aplicativo inválido.' }, { status: 404 });
  const access = await authorizeAppRequest(request, app);
  if (!access) return NextResponse.json({ error: 'Entre com uma conta que tenha acesso a este aplicativo.' }, { status: 401 });

  try {
    const rows = await operationalRest(app, `workspace_state?${query({ select: 'revision,data,updated_at', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ revision: number; data: unknown; updated_at: string }>;
    const row = rows?.[0];
    if (!row) return NextResponse.json({ data: null, revision: 0 });

    let data = row.data;
    if (app === 'artemis' && validWorkspace(data)) data = await hydrateArtemisProductImages(data, access.accountId);
    return NextResponse.json({ data, revision: Number(row.revision || 0), updatedAt: row.updated_at });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível carregar os dados.' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app: raw } = await params;
  const app = cloudApp(raw);
  if (!app) return NextResponse.json({ error: 'Aplicativo inválido.' }, { status: 404 });
  const access = await authorizeAppRequest(request, app);
  if (!access) return NextResponse.json({ error: 'Sua sessão expirou ou este aplicativo não está liberado para sua conta.' }, { status: 401 });

  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_WORKSPACE_BYTES) return NextResponse.json({ error: 'A quantidade de dados enviada excede o limite deste aplicativo.' }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  if (!validWorkspace(body.data)) return NextResponse.json({ error: 'Os dados operacionais enviados são inválidos.' }, { status: 400 });
  const expectedRevision = Math.max(0, Math.trunc(Number(body.expectedRevision) || 0));

  try {
    if (app === 'zeus') {
      const rows = await operationalRest('zeus', `workspace_state?${query({ select: 'data', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ data: unknown }>;
      const current = rows?.[0]?.data && validWorkspace(rows[0].data) ? rows[0].data as unknown as Data : null;
      const next = body.data as unknown as Data;
      assertZeusWorkspacePermissions(access, current, next);
      validateZeusTransition(current, next);
    }

    const result = await operationalRpc(app, 'save_workspace_state', {
      p_tenant_key: access.accountId,
      p_expected_revision: expectedRevision,
      p_data: body.data,
      p_updated_by: access.userId,
    }) as { ok?: boolean; conflict?: boolean; revision?: number; data?: unknown };

    if (result?.conflict) return NextResponse.json({
      error: 'Outra pessoa atualizou estes dados ao mesmo tempo.',
      conflict: true,
      revision: Number(result.revision || 0),
      data: result.data || null,
    }, { status: 409 });

    if (!result?.ok || !validWorkspace(result.data)) throw new Error('O banco não confirmou a gravação dos dados.');
    return NextResponse.json({ ok: true, revision: Number(result.revision || 0), data: result.data });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Não foi possível salvar os dados.';
    if (message.startsWith('PERMISSION_DENIED:')) return NextResponse.json({ error: message.replace('PERMISSION_DENIED: ', '') }, { status: 403 });
    if (message.startsWith('CHECKLIST_REQUIRED:')) return NextResponse.json({ error: message.replace('CHECKLIST_REQUIRED: ', '') }, { status: 409 });
    if (message.startsWith('RELATED_JOB_INVALID:')) return NextResponse.json({ error: message.replace('RELATED_JOB_INVALID: ', '') }, { status: 400 });
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
