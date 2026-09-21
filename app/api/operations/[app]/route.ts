import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest, serverPermissionGranted } from '@/lib/server/appAccess';
import { operationalRest, operationalRpc, type CloudOperationalApp } from '@/lib/server/operationalWorkspace';
import { initialData, type Data } from '@/lib/operations/model';
import { zeusChecklistState } from '@/lib/operations/zeusChecklist';
import { ZEUS_RELATED_JOB_KEY } from '@/lib/operations/zeusChecklistKeys';
import { readZeusEntitlements } from '@/lib/server/zeusPlanAccess';
import { validateZeusPlanTransition } from '@/lib/server/zeusPlanTransition';
import { ZEUS_FEATURES, zeusHasFeature, type ZeusPlanCode } from '@/lib/operations/zeusPlans';
import { sanitizeZeusCustomerScope, zeusJobMatchesOwnership } from '@/lib/operations/zeus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ZEUS_TERMINAL_STATUSES = new Set(['Encerrado', 'Cancelado', 'Reprovado']);

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function artemisProductOperationalShape(product: Data['products'][number]) {
  const copy = structuredClone(product) as Data['products'][number];
  copy.stock = 0;
  copy.stockControlled = false;
  copy.dailyStockDate = '';
  copy.soldOutUntil = '';
  copy.variants = (copy.variants || []).map(variant => ({ ...variant, soldOutUntil: '' }));
  return copy;
}

function validateArtemisProductOperationalChanges(current: Data, next: Data) {
  if (current.products.length !== next.products.length) throw new Error('ARTEMIS_MANAGEMENT_REQUIRED: somente a gestão pode adicionar ou remover produtos.');
  const before = new Map(current.products.map(product => [product.id, product]));
  for (const product of next.products) {
    const previous = before.get(product.id);
    if (!previous || !sameJson(artemisProductOperationalShape(previous), artemisProductOperationalShape(product))) {
      throw new Error('ARTEMIS_MANAGEMENT_REQUIRED: somente a gestão pode alterar o cardápio.');
    }
  }
}

function validateArtemisTransition(current: Data | null, next: Data, role: string, permissions: Record<string, boolean>) {
  if (!current) {
    if (!serverPermissionGranted(role, permissions, 'artemis_manage')) throw new Error('ARTEMIS_MANAGEMENT_REQUIRED: somente a gestão pode iniciar o workspace do restaurante.');
    return;
  }

  const currentStaffSwitch = Boolean(current.settings.staffViewSwitchEnabled);
  const nextStaffSwitch = Boolean(next.settings.staffViewSwitchEnabled);
  if (currentStaffSwitch !== nextStaffSwitch && role !== 'owner') {
    throw new Error('ARTEMIS_OWNER_REQUIRED: somente o titular pode decidir se a equipe pode trocar de visão.');
  }

  const manage = serverPermissionGranted(role, permissions, 'artemis_manage');
  if (manage) return;
  const permanentService = serverPermissionGranted(role, permissions, 'artemis_service');
  const permanentKitchen = serverPermissionGranted(role, permissions, 'artemis_kitchen');
  const temporarySwitch = currentStaffSwitch && (permanentService || permanentKitchen);
  const service = permanentService || temporarySwitch;
  const kitchen = permanentKitchen || temporarySwitch;
  if (!service && !kitchen) throw new Error('ARTEMIS_VIEW_REQUIRED: seu perfil não possui uma visão operacional liberada.');

  const allowed = new Set<keyof Data>(['version','revision','orders','products','stockMovements']);
  if (service) {
    for (const key of ['customers','tables','payments','shifts','movements','customFieldValues'] as (keyof Data)[]) allowed.add(key);
  }

  for (const key of Object.keys(current) as (keyof Data)[]) {
    if (key === 'settings') continue;
    if (!allowed.has(key) && !sameJson(current[key], next[key])) {
      throw new Error('ARTEMIS_MANAGEMENT_REQUIRED: esta alteração pertence à visão de Gestão.');
    }
  }

  const currentSettings = structuredClone(current.settings);
  const nextSettings = structuredClone(next.settings);
  currentSettings.theme = nextSettings.theme;
  currentSettings.collapsed = nextSettings.collapsed;
  if (!sameJson(currentSettings, nextSettings)) {
    throw new Error('ARTEMIS_MANAGEMENT_REQUIRED: somente a gestão pode alterar as configurações do restaurante.');
  }

  validateArtemisProductOperationalChanges(current, next);
}


function validateZeusCustomerOwnership(next: Data) {
  const assets = new Map(next.assets.map(asset => [asset.id, asset]));

  for (const asset of next.assets) {
    if (!next.customers.some(customer => customer.id === asset.customerId)) {
      throw new Error('CUSTOMER_RELATION_INVALID: veículo/equipamento sem cliente válido.');
    }
  }

  for (const job of next.jobs) {
    const asset = assets.get(job.assetId);
    const quoteMatches = !job.quote?.customerId || job.quote.customerId === job.customerId;
    if (!zeusJobMatchesOwnership(next, job) || !quoteMatches || !asset) {
      throw new Error('CUSTOMER_RELATION_INVALID: cliente, veículo/equipamento e OS precisam pertencer ao mesmo cadastro.');
    }
  }

  const jobIds = new Set(next.jobs.map(job => job.id));
  for (const appointment of next.appointments) {
    const asset = assets.get(appointment.assetId);
    const valid = !!asset &&
      asset.customerId === appointment.customerId &&
      next.customers.some(customer => customer.id === appointment.customerId) &&
      (!appointment.jobId || jobIds.has(appointment.jobId));
    if (!valid) {
      throw new Error('CUSTOMER_RELATION_INVALID: o agendamento precisa usar um veículo/equipamento e OS do mesmo cliente.');
    }
  }
}

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

function applyZeusPlanView(data: Record<string, unknown>, plan: ZeusPlanCode) {
  const hydrated = structuredClone(data) as Record<string, unknown>;
  const settings = { ...((hydrated.settings || {}) as Record<string, unknown>) };
  settings.planCode = plan;
  settings.planFeatures = Object.fromEntries(ZEUS_FEATURES.map(feature => [feature, zeusHasFeature(plan, feature)]));
  settings.scheduleEnabled = zeusHasFeature(plan, 'scheduling') && settings.scheduleEnabled !== false;
  settings.budgetEnabled = zeusHasFeature(plan, 'budgets') && settings.budgetEnabled !== false;
  settings.diagnosisEnabled = zeusHasFeature(plan, 'diagnosis') && settings.diagnosisEnabled !== false;
  hydrated.settings = settings;

  // Downgrade preserva dados históricos, mas a OS ativa segue apenas as etapas liberadas.
  const jobs = Array.isArray(hydrated.jobs) ? hydrated.jobs as Array<Record<string, unknown>> : [];
  for (const job of jobs) {
    if (['Encerrado', 'Cancelado', 'Reprovado'].includes(String(job.status || ''))) continue;
    if (!zeusHasFeature(plan, 'diagnosis') && job.stage === 'Diagnóstico') {
      job.stage = zeusHasFeature(plan, 'budgets') ? 'Orçamento' : 'Execução';
      if (String(job.status || '').toLowerCase().includes('diagnóstico')) job.status = 'Em andamento';
    }
    if (!zeusHasFeature(plan, 'budgets') && job.stage === 'Orçamento') {
      job.stage = 'Execução';
      if (String(job.status || '').toLowerCase().includes('orçamento') || job.status === 'Aguardando aprovação') job.status = 'Em andamento';
    }
    if (!zeusHasFeature(plan, 'checklist') && job.status === 'Aguardando checklist') {
      job.status = settings.diagnosisEnabled ? 'Aguardando diagnóstico' : settings.budgetEnabled ? 'Aguardando orçamento' : 'Em andamento';
    }
  }

  return hydrated;
}

function prepareZeusWriteData(input: Data, current: Data | null, plan: ZeusPlanCode) {
  const next = structuredClone(input);
  delete next.settings.planCode;
  delete next.settings.planFeatures;

  // Flags forçadas pela visualização do plano nunca viram preferência persistida.
  if (!zeusHasFeature(plan, 'scheduling')) next.settings.scheduleEnabled = current?.settings.scheduleEnabled ?? true;
  if (!zeusHasFeature(plan, 'budgets')) next.settings.budgetEnabled = current?.settings.budgetEnabled ?? true;
  if (!zeusHasFeature(plan, 'diagnosis')) next.settings.diagnosisEnabled = current?.settings.diagnosisEnabled ?? true;
  return next;
}

function validateZeusTransition(current: Data | null, next: Data, plan: ZeusPlanCode) {
  validateZeusCustomerOwnership(next);
  const currentJobs = new Map((current?.jobs || []).map(job => [job.id, job]));
  for (const job of next.jobs) {
    const previous = currentJobs.get(job.id);

    if (previous && ZEUS_TERMINAL_STATUSES.has(previous.status) && JSON.stringify(previous) !== JSON.stringify(job)) {
      throw new Error('TERMINAL_JOB_IMMUTABLE: atendimentos encerrados, cancelados ou reprovados são somente leitura.');
    }

    if (zeusHasFeature(plan, 'checklist') && previous?.stage === 'Identificação' && job.stage !== 'Identificação') {
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
    if (!row) {
      if (app === 'zeus') {
        const entitlements = await readZeusEntitlements(access.accountId);
        const empty = initialData();
        return NextResponse.json({ data: applyZeusPlanView(empty as unknown as Record<string, unknown>, entitlements.plan), revision: 0 });
      }
      return NextResponse.json({ data: null, revision: 0 });
    }

    let data = row.data;
    if (app === 'artemis' && validWorkspace(data)) data = await hydrateArtemisProductImages(data, access.accountId);
    if (app === 'zeus' && validWorkspace(data)) {
      const entitlements = await readZeusEntitlements(access.accountId);
      data = applyZeusPlanView(sanitizeZeusCustomerScope(data as unknown as Data) as unknown as Record<string, unknown>, entitlements.plan);
    }
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
  if (!rawBody) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  if (!validWorkspace(body.data)) return NextResponse.json({ error: 'Os dados operacionais enviados são inválidos.' }, { status: 400 });
  const expectedRevision = Math.max(0, Math.trunc(Number(body.expectedRevision) || 0));
  let zeusResponsePlan: ZeusPlanCode | null = null;
  let writeData = body.data as unknown as Data;

  try {
    if (app === 'zeus') {
      const rows = await operationalRest('zeus', `workspace_state?${query({ select: 'data', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ data: unknown }>;
      const current = rows?.[0]?.data && validWorkspace(rows[0].data) ? rows[0].data as unknown as Data : null;
      const entitlements = await readZeusEntitlements(access.accountId);
      zeusResponsePlan = entitlements.plan;
      writeData = prepareZeusWriteData(body.data as unknown as Data, current, entitlements.plan);
      validateZeusPlanTransition(current, writeData, entitlements.plan);
      validateZeusTransition(current, writeData, entitlements.plan);
    } else {
      const rows = await operationalRest('artemis', `workspace_state?${query({ select: 'data', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ data: unknown }>;
      const current = rows?.[0]?.data && validWorkspace(rows[0].data) ? rows[0].data as unknown as Data : null;
      validateArtemisTransition(current, body.data as unknown as Data, access.role, access.permissions);
    }

    const result = await operationalRpc(app, 'save_workspace_state', {
      p_tenant_key: access.accountId,
      p_expected_revision: expectedRevision,
      p_data: app === 'zeus' ? writeData : body.data,
      p_updated_by: access.userId,
    }) as { ok?: boolean; conflict?: boolean; revision?: number; data?: unknown };

    if (result?.conflict) return NextResponse.json({
      error: 'Outra pessoa atualizou estes dados ao mesmo tempo.',
      conflict: true,
      revision: Number(result.revision || 0),
      data: app === 'zeus' && zeusResponsePlan && result.data && validWorkspace(result.data)
        ? applyZeusPlanView(result.data as Record<string, unknown>, zeusResponsePlan)
        : result.data || null,
    }, { status: 409 });

    if (!result?.ok || !validWorkspace(result.data)) throw new Error('O banco não confirmou a gravação dos dados.');
    const responseData = app === 'zeus' && zeusResponsePlan
      ? applyZeusPlanView(result.data as Record<string, unknown>, zeusResponsePlan)
      : result.data;
    return NextResponse.json({ ok: true, revision: Number(result.revision || 0), data: responseData });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Não foi possível salvar os dados.';
    if (message.startsWith('PLAN_FEATURE_REQUIRED:')) return NextResponse.json({ error: 'Este recurso não está disponível no plano atual do Zeus.' }, { status: 403 });
    if (message.startsWith('CHECKLIST_REQUIRED:')) return NextResponse.json({ error: message.replace('CHECKLIST_REQUIRED: ', '') }, { status: 409 });
    if (message.startsWith('TERMINAL_JOB_IMMUTABLE:')) return NextResponse.json({ error: message.replace('TERMINAL_JOB_IMMUTABLE: ', '') }, { status: 409 });
    if (message.startsWith('RELATED_JOB_INVALID:')) return NextResponse.json({ error: message.replace('RELATED_JOB_INVALID: ', '') }, { status: 400 });
    if (message.startsWith('CUSTOMER_RELATION_INVALID:')) return NextResponse.json({ error: message.replace('CUSTOMER_RELATION_INVALID: ', '') }, { status: 400 });
    if (message.startsWith('ARTEMIS_MANAGEMENT_REQUIRED:')) return NextResponse.json({ error: message.replace('ARTEMIS_MANAGEMENT_REQUIRED: ', '') }, { status: 403 });
    if (message.startsWith('ARTEMIS_VIEW_REQUIRED:')) return NextResponse.json({ error: message.replace('ARTEMIS_VIEW_REQUIRED: ', '') }, { status: 403 });
    if (message.startsWith('ARTEMIS_OWNER_REQUIRED:')) return NextResponse.json({ error: message.replace('ARTEMIS_OWNER_REQUIRED: ', '') }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
