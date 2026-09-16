import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData, newJob, event } from '../lib/operations/model.ts';
import { assertZeusWorkspacePermissions } from '../lib/server/zeusWorkspacePermissions.ts';
import { ZEUS_ATTACHMENT_META_KEY } from '../lib/operations/zeusChecklistKeys.ts';

const access = permissions => ({ role: 'member', canConfigure: false, permissions });
const clone = value => structuredClone(value);

function workspace() {
  const data = initialData();
  data.customers.push({ id: '11111111-1111-4111-8111-111111111111', name: 'Cliente', phone: '', email: '', notes: '' });
  data.assets.push({ id: '22222222-2222-4222-8222-222222222222', customerId: data.customers[0].id, identifier: 'ABC1D23', model: 'Veículo', year: '', meter: '' });
  newJob(data, { customerId: data.customers[0].id, assetId: data.assets[0].id, type: 'Reparo', technician: '', due: '', complaint: 'Ruído', diagnosis: '', notes: '' });
  return data;
}

test('perfil somente consulta pode mudar apenas apresentação, não a OS', () => {
  const current = workspace();
  const presentation = clone(current);
  presentation.settings.theme = 'dark';
  presentation.settings.collapsed = true;
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ jobs_view: true }), current, presentation));

  const edited = clone(current);
  edited.jobs[0].complaint = 'Alterado';
  assert.throws(() => assertZeusWorkspacePermissions(access({ jobs_view: true }), current, edited), /PERMISSION_DENIED/);
});

test('jobs_create permite abrir OS com cliente e ativo criados no mesmo fluxo', () => {
  const current = initialData();
  const next = clone(current);
  const customerId = '33333333-3333-4333-8333-333333333333';
  const assetId = '44444444-4444-4444-8444-444444444444';
  next.customers.push({ id: customerId, name: 'Novo cliente', phone: '', email: '', notes: '' });
  next.assets.push({ id: assetId, customerId, identifier: 'NOV0A00', model: 'Novo ativo', year: '', meter: '' });
  newJob(next, { customerId, assetId, type: 'Reparo', technician: '', due: '', complaint: 'Teste', diagnosis: '', notes: '' });
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ jobs_create: true }), current, next));
});

test('avançar etapa exige jobs_advance e não apenas jobs_edit', () => {
  const current = workspace();
  const next = clone(current);
  next.jobs[0].stage = 'Diagnóstico';
  next.jobs[0].status = 'Em andamento';
  next.jobs[0].events.push(event('Etapa: Diagnóstico'));
  assert.throws(() => assertZeusWorkspacePermissions(access({ jobs_edit: true }), current, next), /avançar etapas/);
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ jobs_advance: true }), current, next));
});

test('anexo com metadados aceita attachments_manage sem liberar edição geral da OS', () => {
  const current = workspace();
  const next = clone(current);
  const job = next.jobs[0];
  const attachmentId = '55555555-5555-4555-8555-555555555555';
  job.attachments.push({ id: attachmentId, name: 'entrada.jpg', data: 'r2:arquivo|https://exemplo' });
  job.events.push(event('Foto anexada'));
  next.customFieldValues[job.id] = {
    [ZEUS_ATTACHMENT_META_KEY]: JSON.stringify({ [attachmentId]: { stage: 'Identificação', source: 'manual' } }),
  };
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ attachments_manage: true }), current, next));
});

test('compartilhar orçamento exige quotes_share; editar exige quotes_manage', () => {
  const current = workspace();
  current.jobs[0].quote.lines.push({ id: 'line', kind: 'Serviço', description: 'Serviço', brand: '', quantity: 1, price: 10000 });
  current.jobs[0].quote.validUntil = '2099-01-01';

  const shared = clone(current);
  shared.jobs[0].quote.status = 'Enviado';
  shared.jobs[0].quote.events.push(event('Enviado'));
  assert.throws(() => assertZeusWorkspacePermissions(access({ quotes_manage: true }), current, shared), /compartilhar orçamentos/);
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ quotes_share: true }), current, shared));

  const edited = clone(current);
  edited.jobs[0].quote.notes = 'Nova observação';
  assert.throws(() => assertZeusWorkspacePermissions(access({ quotes_share: true }), current, edited), /criar ou editar orçamentos/);
  assert.doesNotThrow(() => assertZeusWorkspacePermissions(access({ quotes_manage: true }), current, edited));
});

test('workspace Zeus rejeita alteração de coleções de outro aplicativo', () => {
  const current = workspace();
  const next = clone(current);
  next.orders.push({ id: 'x' });
  assert.throws(() => assertZeusWorkspacePermissions(access({ jobs_edit: true }), current, next), /não pertence ao fluxo operacional do Zeus/);
});
