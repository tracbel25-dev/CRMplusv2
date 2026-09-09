'use client';

import { useEffect, useState } from 'react';
import type { Workspace } from '@/lib/operations/storage';
import { ZEUS_DASHBOARD_FILTERS, ZEUS_JOB_FILTERS, ZEUS_QUOTE_FILTERS, readZeusPreferences, writeZeusPreferences, type ZeusPreferences } from '@/lib/operations/zeus';
import { Badge, Button, Section } from './ui';

function FilterChoices({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  return <div className="zeus-setting-block"><strong>{title}</strong><small className="op-muted">Escolha quais filtros estarão disponíveis nesta tela.</small><div className="zeus-setting-choices">{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div></div>;
}

export function ZeusSettingsExtras({ w }: { w: Workspace }) {
  const [draft, setDraft] = useState<ZeusPreferences>(() => readZeusPreferences(w.data));
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(readZeusPreferences(w.data)), [w.data.revision]);
  const save = async () => {
    const ok = await w.mutate(data => writeZeusPreferences(data, draft), 'Preferências do Zeus salvas.');
    if (ok) setSaved(true);
  };
  return <Section title="Orçamentos, filtros e análise">
    <p className="op-muted">Configure aqui a estrutura das telas. A equipe continuará aplicando e limpando os valores dos filtros diretamente na rotina, sem alterar esta configuração.</p>
    <div className="op-fields"><label className="op-field"><span>Validade padrão do orçamento (dias)</span><input type="number" min="1" max="365" value={draft.budgetValidityDays} onChange={event => { setSaved(false); setDraft({ ...draft, budgetValidityDays: Number(event.target.value) }); }} /><small>Novos orçamentos de OS e balcão começam com este prazo, mas podem ser alterados individualmente.</small></label></div>
    <div className="zeus-settings-filter-grid">
      <FilterChoices title="Atendimentos e Histórico" options={ZEUS_JOB_FILTERS} selected={draft.jobFilters} onChange={jobFilters => { setSaved(false); setDraft({ ...draft, jobFilters }); }} />
      <FilterChoices title="Orçamentos" options={ZEUS_QUOTE_FILTERS} selected={draft.quoteFilters} onChange={quoteFilters => { setSaved(false); setDraft({ ...draft, quoteFilters }); }} />
      <FilterChoices title="Dashboard" options={ZEUS_DASHBOARD_FILTERS} selected={draft.dashboardFilters} onChange={dashboardFilters => { setSaved(false); setDraft({ ...draft, dashboardFilters }); }} />
    </div>
    <div className="op-form-footer">{saved && <Badge>Salvo</Badge>}<Button onClick={() => { void save(); }}>Salvar configuração dos filtros</Button></div>
  </Section>;
}
