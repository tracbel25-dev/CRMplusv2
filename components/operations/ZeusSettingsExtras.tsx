'use client';

import type { Workspace } from '@/lib/operations/storage';
import type { ZeusPreferences } from '@/lib/operations/zeus';
import { Button } from './ui';
import { SettingsSection } from './SettingsSection';
import { ZeusServiceTypeSettings } from './ZeusServiceTypesCloud';

export function ZeusSettingsExtras({ w, budgetEnabled = true, value, onChange, dirty = false, saving = false, onSave }: { w: Workspace; budgetEnabled?: boolean; value: ZeusPreferences; onChange: (value: ZeusPreferences) => void; dirty?: boolean; saving?: boolean; onSave?: () => void }) {
  return <>
    {budgetEnabled && <SettingsSection title="Orçamento" description="Defina a validade padrão usada nos novos orçamentos.">
      <div className="op-fields"><label className="op-field"><span>Validade padrão do orçamento (dias)</span><input type="number" min="1" max="365" value={value.budgetValidityDays} onChange={event => onChange({ ...value, budgetValidityDays: Number(event.target.value) })} /><small>Novos orçamentos começam com este prazo e podem ser alterados individualmente.</small></label></div>
      {dirty && onSave && <div className="op-settings-section-save"><Button disabled={saving} onClick={onSave}>{saving ? 'Salvando…' : 'Salvar alteração'}</Button></div>}
    </SettingsSection>}

    <ZeusServiceTypeSettings w={w} />
  </>;
}
