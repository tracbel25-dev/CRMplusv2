import type { Data, Job, Quote } from '@/lib/operations/model';
import { initialData } from '@/lib/operations/model';
import { serverPermissionGranted, type ServerPermissionMap } from './appAccess';
import { ZEUS_ATTACHMENT_META_KEY, ZEUS_CHECKLIST_CONFIG_KEY, ZEUS_SERVICE_TYPES_KEY } from '@/lib/operations/zeusChecklistKeys';

type Access = {
  role: string;
  permissions: ServerPermissionMap;
  canConfigure: boolean;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byId = <T extends { id: string }>(items: T[]) => new Map(items.map(item => [item.id, item]));

function deny(message: string): never {
  throw new Error(`PERMISSION_DENIED: ${message}`);
}

function has(access: Access, permission: string) {
  return serverPermissionGranted(access.role, access.permissions, permission);
}

function requirePermission(access: Access, permission: string, message: string) {
  if (!has(access, permission)) deny(message);
}

function requireConfiguration(access: Access) {
  if (access.role === 'owner' || access.canConfigure || has(access, 'settings_fields') || has(access, 'settings_operation')) return;
  deny('seu perfil não pode alterar as configurações operacionais do Zeus.');
}

function withoutPresentationSettings(data: Data['settings']) {
  const clone = structuredClone(data) as Data['settings'] & Record<string, unknown>;
  delete clone.theme;
  delete clone.collapsed;
  return clone;
}

function quotePermission(access: Access, previous: Quote | undefined, next: Quote | undefined) {
  if (same(previous, next)) return false;
  if (!previous || !next) {
    requirePermission(access, 'quotes_manage', 'seu perfil não pode criar, remover ou editar orçamentos.');
    return true;
  }
  const sharing = previous.status !== 'Enviado' && next.status === 'Enviado';
  requirePermission(access, sharing ? 'quotes_share' : 'quotes_manage', sharing
    ? 'seu perfil não pode compartilhar orçamentos.'
    : 'seu perfil não pode criar ou editar orçamentos.');
  return true;
}

function safeCreatedCustomerAssetChanges(current: Data, next: Data, addedJobs: Job[]) {
  const currentCustomers = byId(current.customers);
  const currentAssets = byId(current.assets);
  const nextCustomers = byId(next.customers);
  const nextAssets = byId(next.assets);

  for (const [id, customer] of currentCustomers) if (!same(customer, nextCustomers.get(id))) return false;
  for (const [id, asset] of currentAssets) if (!same(asset, nextAssets.get(id))) return false;

  const addedCustomerIds = new Set(next.customers.filter(item => !currentCustomers.has(item.id)).map(item => item.id));
  const addedAssetIds = new Set(next.assets.filter(item => !currentAssets.has(item.id)).map(item => item.id));
  if (next.customers.length !== current.customers.length + addedCustomerIds.size) return false;
  if (next.assets.length !== current.assets.length + addedAssetIds.size) return false;

  const jobsByAsset = new Map(addedJobs.map(job => [job.assetId, job]));
  for (const assetId of addedAssetIds) {
    const asset = nextAssets.get(assetId);
    const job = jobsByAsset.get(assetId);
    if (!asset || !job || job.customerId !== asset.customerId) return false;
  }
  for (const customerId of addedCustomerIds) {
    const used = [...addedAssetIds].some(assetId => nextAssets.get(assetId)?.customerId === customerId);
    if (!used) return false;
  }
  return true;
}

function jobCore(job: Job) {
  const clone = structuredClone(job) as Job & Record<string, unknown>;
  delete clone.stage;
  delete clone.status;
  delete clone.events;
  delete clone.quote;
  delete clone.attachments;
  delete clone.tasks;
  return clone;
}

function changedCustomKeys(previous: Record<string, string> | undefined, next: Record<string, string> | undefined) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  return [...keys].filter(key => (previous || {})[key] !== (next || {})[key]);
}

export function assertZeusWorkspacePermissions(access: Access, currentValue: Data | null, next: Data) {
  if (access.role === 'owner' || !Object.keys(access.permissions || {}).length) return;
  const current = currentValue || initialData();

  if (!same(withoutPresentationSettings(current.settings), withoutPresentationSettings(next.settings))) requireConfiguration(access);

  const forbiddenCollections: (keyof Data)[] = ['products','orders','tables','payments','shifts','movements','stockMovements','surveys','responses','deals','tasks'];
  for (const key of forbiddenCollections) {
    if (!same(current[key], next[key])) deny(`a coleção “${String(key)}” não pertence ao fluxo operacional do Zeus.`);
  }

  const currentJobs = byId(current.jobs);
  const nextJobs = byId(next.jobs);
  const addedJobs = next.jobs.filter(job => !currentJobs.has(job.id));
  const removedJobs = current.jobs.filter(job => !nextJobs.has(job.id));
  if (addedJobs.length) requirePermission(access, 'jobs_create', 'seu perfil não pode abrir novas ordens de serviço.');
  if (removedJobs.length) requirePermission(access, 'jobs_edit', 'seu perfil não pode remover ordens de serviço.');

  if (!same(current.customers, next.customers) || !same(current.assets, next.assets)) {
    const safeCreation = addedJobs.length > 0 && safeCreatedCustomerAssetChanges(current, next, addedJobs);
    if (!safeCreation) requirePermission(access, 'customers_manage', 'seu perfil não pode alterar clientes ou veículos/equipamentos.');
  }

  if (!same(current.appointments, next.appointments)) {
    requirePermission(access, 'appointments_manage', 'seu perfil não pode criar ou alterar agendamentos.');
  }

  for (const [id, nextJob] of nextJobs) {
    const previous = currentJobs.get(id);
    if (!previous) continue;

    let covered = false;
    const quoteChanged = quotePermission(access, previous.quote, nextJob.quote);
    covered ||= quoteChanged;
    const quoteStatusChanged = previous.quote.status !== nextJob.quote.status;

    if (!same(previous.attachments, nextJob.attachments)) {
      requirePermission(access, 'attachments_manage', 'seu perfil não pode adicionar ou remover fotos e anexos.');
      covered = true;
    }
    if (!same(previous.tasks, nextJob.tasks)) {
      requirePermission(access, 'jobs_edit', 'seu perfil não pode alterar a execução da OS.');
      covered = true;
    }
    if (!same(jobCore(previous), jobCore(nextJob))) {
      requirePermission(access, 'jobs_edit', 'seu perfil não pode editar os dados da OS.');
      covered = true;
    }
    if (previous.stage !== nextJob.stage && !quoteStatusChanged) {
      requirePermission(access, 'jobs_advance', 'seu perfil não pode avançar etapas da OS.');
      covered = true;
    } else if (previous.stage !== nextJob.stage) covered = true;

    if (previous.status !== nextJob.status && previous.stage === nextJob.stage && !quoteStatusChanged) {
      requirePermission(access, 'jobs_edit', 'seu perfil não pode alterar a situação da OS.');
      covered = true;
    } else if (previous.status !== nextJob.status) covered = true;

    if (!same(previous.events, nextJob.events) && !covered) {
      requirePermission(access, 'jobs_edit', 'seu perfil não pode alterar o histórico da OS.');
    }
  }

  const currentQuotes = byId(current.quotes);
  const nextQuotes = byId(next.quotes);
  for (const [id, quote] of nextQuotes) quotePermission(access, currentQuotes.get(id), quote);
  for (const [id, quote] of currentQuotes) if (!nextQuotes.has(id)) quotePermission(access, quote, undefined);

  const currentCustom = current.customFieldValues || {};
  const nextCustom = next.customFieldValues || {};
  const customTargets = new Set([...Object.keys(currentCustom), ...Object.keys(nextCustom)]);
  const addedJobIds = new Set(addedJobs.map(job => job.id));
  const currentCustomerIds = new Set(current.customers.map(item => item.id));
  const currentAssetIds = new Set(current.assets.map(item => item.id));
  const nextCustomerIds = new Set(next.customers.map(item => item.id));
  const nextAssetIds = new Set(next.assets.map(item => item.id));

  for (const target of customTargets) {
    const changedKeys = changedCustomKeys(currentCustom[target], nextCustom[target]);
    if (!changedKeys.length) continue;
    if (target === ZEUS_CHECKLIST_CONFIG_KEY || target === ZEUS_SERVICE_TYPES_KEY) {
      requireConfiguration(access);
      continue;
    }
    if (addedJobIds.has(target)) continue;
    if (currentJobs.has(target) || nextJobs.has(target)) {
      const previousJob = currentJobs.get(target);
      const nextJob = nextJobs.get(target);
      const onlyAttachmentMeta = changedKeys.every(key => key === ZEUS_ATTACHMENT_META_KEY);
      if (onlyAttachmentMeta && previousJob && nextJob && !same(previousJob.attachments, nextJob.attachments)) {
        requirePermission(access, 'attachments_manage', 'seu perfil não pode alterar metadados de anexos.');
      } else {
        requirePermission(access, 'jobs_edit', 'seu perfil não pode alterar dados complementares da OS.');
      }
      continue;
    }
    if (currentCustomerIds.has(target) || currentAssetIds.has(target) || nextCustomerIds.has(target) || nextAssetIds.has(target)) {
      const createdWithJob = !currentCustomerIds.has(target) && !currentAssetIds.has(target) && addedJobs.length > 0;
      if (!createdWithJob) requirePermission(access, 'customers_manage', 'seu perfil não pode alterar dados complementares de clientes ou ativos.');
      continue;
    }
    requireConfiguration(access);
  }
}
