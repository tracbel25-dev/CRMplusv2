'use client';

import type { Workspace } from '@/lib/operations/storage';
import { ZEUS_DASHBOARD_FILTERS, ZEUS_JOB_FILTERS, ZEUS_QUOTE_FILTERS, type ZeusPreferences } from '@/lib/operations/zeus';
import { Button } from './ui';
import { SettingsSection } from './SettingsSection';
import { ZeusServiceTypeSettings } from './ZeusServiceTypesCloud';

function FilterChoices({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value]);
  return <div className="zeus-setting-block"><strong>{title}</strong><small className="op-muted">Escolha quais filtros aparecem nesta tela.</small><div className="zeus-setting-choices">{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div></div>;
}

export function ZeusSettingsExtras({ w, budgetEnabled = true, value, onChange, dirty = false, saving = false, onSave }: { w: Workspace; budgetEnabled?: boolean; value: ZeusPreferences; onChange: (value: ZeusPreferences) => void; dirty?: boolean; saving?: boolean; onSave?: () => void }) {
  return <>
    <SettingsSection title={budgetEnabled ? 'Orçamento e filtros' : 'Filtros das telas'} description="Defina a validade padrão dos orçamentos e quais filtros ficam disponíveis para a equipe.">
      {budgetEnabled && <div className="op-fields"><label className="op-field"><span>Validade padrão do orçamento (dias)</span><input type="number" min="1" max="365" value={value.budgetValidityDays} onChange={event => onChange({ ...value, budgetValidityDays: Number(event.target.value) })} /><small>Novos orçamentos começam com este prazo e podem ser alterados individualmente.</small></label></div>}
      <div className="zeus-settings-filter-grid">
        <FilterChoices title="Atendimentos e Histórico" options={ZEUS_JOB_FILTERS} selected={value.jobFilters} onChange={jobFilters => onChange({ ...value, jobFilters })} />
        {budgetEnabled && <FilterChoices title="Orçamentos" options={ZEUS_QUOTE_FILTERS} selected={value.quoteFilters} onChange={quoteFilters => onChange({ ...value, quoteFilters })} />}
        <FilterChoices title="Dashboard" options={ZEUS_DASHBOARD_FILTERS} selected={value.dashboardFilters} onChange={dashboardFilters => onChange({ ...value, dashboardFilters })} />
      </div>
      {dirty && onSave && <div className="op-settings-section-save"><Button disabled={saving} onClick={onSave}>{saving ? 'Salvando…' : 'Salvar alteração'}</Button></div>}
    </SettingsSection>

    <ZeusServiceTypeSettings w={w} />
  </>;
}
