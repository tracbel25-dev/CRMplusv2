'use client';

import { useEffect, useState } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { Asset, date, uid } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { ZEUS_DASHBOARD_FILTERS, ZEUS_JOB_FILTERS, ZEUS_QUOTE_FILTERS, readZeusPreferences, writeZeusPreferences, type ZeusPreferences } from '@/lib/operations/zeus';
import { Badge, Button, CustomerManager, Empty, Modal, RecordForm, Section } from './ui';
import { PaymentIntegrationSetting } from './PaymentIntegrationSetting';

const assetKey = (value: string) => value.replace(/\W/g, '').toUpperCase();

function FilterChoices({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  return <div className="zeus-setting-block"><strong>{title}</strong><small className="op-muted">Escolha quais filtros aparecem nesta tela.</small><div className="zeus-setting-choices">{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div></div>;
}

function AssetForm({ w, customerId, onClose }: { w: Workspace; customerId: string; onClose: () => void }) {
  const operation = useOperationPreferences('zeus');
  const s = w.data.settings;
  return <RecordForm draftKey={`zeus-asset:${customerId}:new`} fields={[
    { name: 'identifier', label: s.identifierLabel, required: true, configKey: 'identifier' },
    { name: 'model', label: s.assetLabel, required: true, configKey: 'asset' },
    { name: 'year', label: operation.label('year', 'Ano'), configKey: 'year' },
    { name: 'meter', label: s.meterLabel, configKey: 'meter' }
  ]} onClose={onClose} onSave={form => w.mutate(data => {
    if (data.assets.some(asset => assetKey(asset.identifier) === assetKey(form.identifier))) throw new Error('Esta identificação já está cadastrada.');
    data.assets.push({ id: uid(), customerId, identifier: form.identifier, model: form.model, year: form.year || '', meter: form.meter || '' } as Asset);
  }, `${s.assetLabel} cadastrado.`)} />;
}

export function ZeusSettingsExtras({ w, budgetEnabled = true }: { w: Workspace; budgetEnabled?: boolean }) {
  const [draft, setDraft] = useState<ZeusPreferences>(() => readZeusPreferences(w.data));
  const [saved, setSaved] = useState(false);
  const [assetCustomer, setAssetCustomer] = useState('');
  useEffect(() => setDraft(readZeusPreferences(w.data)), [w.data.revision]);
  const save = async () => {
    const ok = await w.mutate(data => writeZeusPreferences(data, draft), 'Preferências do Zeus salvas.');
    if (ok) setSaved(true);
  };
  const s = w.data.settings;
  return <>
    <Section title={budgetEnabled ? 'Orçamento e filtros' : 'Filtros das telas'}>
      <p className="op-muted">Essas opções acompanham o fluxo que você ativou para a oficina.</p>
      {budgetEnabled && <div className="op-fields"><label className="op-field"><span>Validade padrão do orçamento (dias)</span><input type="number" min="1" max="365" value={draft.budgetValidityDays} onChange={event => { setSaved(false); setDraft({ ...draft, budgetValidityDays: Number(event.target.value) }); }} /><small>Novos orçamentos começam com este prazo e podem ser alterados individualmente.</small></label></div>}
      <div className="zeus-settings-filter-grid">
        <FilterChoices title="Atendimentos e Histórico" options={ZEUS_JOB_FILTERS} selected={draft.jobFilters} onChange={jobFilters => { setSaved(false); setDraft({ ...draft, jobFilters }); }} />
        {budgetEnabled && <FilterChoices title="Orçamentos" options={ZEUS_QUOTE_FILTERS} selected={draft.quoteFilters} onChange={quoteFilters => { setSaved(false); setDraft({ ...draft, quoteFilters }); }} />}
        <FilterChoices title="Dashboard" options={ZEUS_DASHBOARD_FILTERS} selected={draft.dashboardFilters} onChange={dashboardFilters => { setSaved(false); setDraft({ ...draft, dashboardFilters }); }} />
      </div>
      <div className="op-form-footer">{saved && <Badge>Salvo</Badge>}<Button onClick={() => { void save(); }}>Salvar preferências</Button></div>
    </Section>

    <CustomerManager w={w} title={`Clientes e ${s.assetLabel.toLowerCase()}s`} onOpen={customer => <>
      <Section title={`${s.assetLabel}s`} action={<Button variant="secondary" onClick={() => setAssetCustomer(customer.id)}>Adicionar</Button>}>
        {w.data.assets.filter(asset => asset.customerId === customer.id).map(asset => <div className="op-row" key={asset.id}><div className="op-grow"><strong className="op-identifier">{asset.identifier}</strong><span>{asset.model} · {asset.year || 'Ano não informado'}</span></div><Badge>{w.data.jobs.filter(job => job.assetId === asset.id).length} OS</Badge></div>)}
        {!w.data.assets.some(asset => asset.customerId === customer.id) && <Empty>Nenhum cadastro associado.</Empty>}
      </Section>
      <Section title="Histórico do cliente">
        {w.data.jobs.filter(job => job.customerId === customer.id).map(job => <div className="op-row" key={job.id}><strong>OS {job.number}</strong><span>{job.type} · {date(job.createdAt)}</span><Badge>{job.status}</Badge></div>)}
        {!w.data.jobs.some(job => job.customerId === customer.id) && <Empty>Nenhum atendimento registrado.</Empty>}
      </Section>
    </>} />

    <PaymentIntegrationSetting app="zeus" />
    {assetCustomer && <Modal title={`Cadastrar ${s.assetLabel.toLowerCase()}`} onClose={() => setAssetCustomer('')}><AssetForm w={w} customerId={assetCustomer} onClose={() => setAssetCustomer('')} /></Modal>}
  </>;
}
