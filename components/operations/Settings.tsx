'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, Plus, Trash2 } from 'lucide-react';
import { AppId, Settings, stages, uid } from '@/lib/operations/model';
import { Workspace, decodeData, download, storageKey } from '@/lib/operations/storage';
import {
  CustomField,
  OperationPreferences,
  defaultOperationPreferences,
  saveOperationPreferences,
  segmentDefinitions,
  useOperationPreferences
} from '@/lib/operations/configuration';
import { Badge, Button, Confirm, Section, Title } from './ui';
import { ConfigFieldNameSelect } from './ConfigFieldNameSelect';
import { LocalAccountSettings } from './LocalAccountSettings';

export function AppSettings({ w, app }: { w: Workspace; app: AppId }) {
  const operation = useOperationPreferences(app);
  const definition = segmentDefinitions[app];
  const [draft, setDraft] = useState<Settings>(() => ({ ...w.data.settings }));
  const [preferences, setPreferences] = useState<OperationPreferences>(() => defaultOperationPreferences(app));
  const [importData, setImportData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customGroup, setCustomGroup] = useState(definition.customFieldGroups[0]);

  useEffect(() => setPreferences(operation.preferences), [operation.preferences]);

  const fieldGroups = useMemo(() => Array.from(new Set(definition.fields.map(field => field.group))), [definition.fields]);
  const actionGroups = useMemo(() => Array.from(new Set(definition.actions.map(action => action.group))), [definition.actions]);

  const field = (key: keyof Settings, label: string, type = 'text') => (
    <label className="op-field">
      <span>{label}</span>
      <input type={type} value={String(draft[key])} onChange={event => {
        setSaved(false);
        setDraft({ ...draft, [key]: event.target.value });
      }} />
    </label>
  );

  const setFieldLabel = (key: string, value: string) => {
    setSaved(false);
    setPreferences(current => ({
      ...current,
      fieldLabels: { ...current.fieldLabels, [key]: value }
    }));
  };

  const setFieldVisible = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => ({
      ...current,
      fieldVisibility: { ...current.fieldVisibility, [key]: value }
    }));
  };

  const setActionVisible = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => ({
      ...current,
      actionVisibility: { ...current.actionVisibility, [key]: value }
    }));
  };

  const addCustomField = () => {
    const label = customName.trim();
    if (!label) return;
    const newField: CustomField = { id: uid(), label, group: customGroup, visible: true };
    setPreferences(current => ({ ...current, customFields: [...current.customFields, newField] }));
    setCustomName('');
    setSaved(false);
  };

  const save = async () => {
    const normalizedLabels = Object.fromEntries(
      Object.entries(preferences.fieldLabels).map(([key, value]) => [key, value.trim()])
    );
    const requiredEmpty = definition.fields.find(configField => configField.required && !normalizedLabels[configField.key]);
    if (requiredEmpty) {
      w.setError(`O nome do campo “${requiredEmpty.label}” não pode ficar vazio.`);
      return false;
    }

    const nextPreferences = { ...preferences, fieldLabels: normalizedLabels };
    const ok = await w.mutate(data => {
      const theme = data.settings.theme;
      const collapsed = data.settings.collapsed;
      const next = { ...draft, theme, collapsed };

      if (app === 'zeus') {
        next.identifierLabel = normalizedLabels.identifier || 'Placa';
        next.assetLabel = normalizedLabels.asset || 'Veículo';
        next.meterLabel = normalizedLabels.meter || 'Quilometragem';
        next.scheduleEnabled = nextPreferences.actionVisibility['module:agendamentos'] !== false;
        next.diagnosisEnabled = nextPreferences.actionVisibility.diagnosis !== false;
        next.budgetEnabled = nextPreferences.actionVisibility.budget !== false;

        if (data.settings.budgetEnabled && !next.budgetEnabled && data.jobs.some(job => job.status === 'Aguardando aprovação')) {
          throw new Error('Resolva os orçamentos aguardando aprovação antes de ocultar essa etapa.');
        }
        for (const job of data.jobs) {
          if (['Encerrado', 'Cancelado', 'Reprovado'].includes(job.status)) continue;
          if (!next.budgetEnabled && job.stage === 'Orçamento') job.stage = 'Execução';
          if (!next.diagnosisEnabled && job.stage === 'Diagnóstico') job.stage = next.budgetEnabled ? 'Orçamento' : 'Execução';
        }
      }

      data.settings = next;
    }, 'Configurações salvas.');

    if (!ok) return false;
    saveOperationPreferences(app, nextPreferences);
    setPreferences(nextPreferences);
    setSaved(true);
    return true;
  };

  return <>
    <Title eyebrow="Sua operação" title="Configurações">{definition.description}</Title>

    <form onSubmit={async event => { event.preventDefault(); await save(); }}>
      <Section title={app === 'zeus' ? 'Dados da oficina' : app === 'artemis' ? 'Dados do restaurante' : 'Dados do negócio'}>
        <div className="op-fields">
          {field('business', 'Nome do negócio')}
          {field('operator', 'Seu nome')}
          {field('phone', 'Telefone', 'tel')}
          {field('email', 'E-mail', 'email')}
          <div className="span-full">{field('address', 'Endereço')}</div>
        </div>
      </Section>

      <Section title="Campos e nomes">
        <p className="op-muted">Digite o nome que a sua operação usa. O campo sugere termos comuns do segmento enquanto você escreve; se criar um termo novo, use “Incluir opção” para deixá-lo disponível nas próximas configurações. Campos essenciais continuam ativos para não quebrar os registros.</p>
        <div className="op-config-groups">
          {fieldGroups.map(group => <div className="op-config-group" key={group}>
            <div className="op-config-group-title"><strong>{group}</strong><span>{definition.fields.filter(configField => configField.group === group).length} campos</span></div>
            {definition.fields.filter(configField => configField.group === group).map(configField => {
              const visible = configField.required || preferences.fieldVisibility[configField.key] !== false;
              const currentLabel = preferences.fieldLabels[configField.key] ?? configField.label;
              return <div className="op-config-row" key={configField.key}>
                <label className="op-config-switch">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={configField.required}
                    onChange={event => setFieldVisible(configField.key, event.target.checked)}
                  />
                  <span>{visible ? 'Mostrar' : 'Ocultar'}</span>
                </label>
                <div className="op-field op-config-name">
                  <span>Nome no aplicativo</span>
                  <ConfigFieldNameSelect app={app} fieldKey={configField.key} fallback={configField.label} value={currentLabel} onChange={value => setFieldLabel(configField.key, value)} />
                </div>
                <div className="op-config-description">
                  <strong>{configField.label}{configField.required && <Badge>Essencial</Badge>}</strong>
                  <small>{configField.description}</small>
                </div>
              </div>;
            })}
          </div>)}
        </div>
      </Section>

      <Section title="Adicionar mais um campo">
        <p className="op-muted">Use esta área somente quando a sua operação precisa de uma informação que ainda não existe. Para apenas renomear um campo existente, digite diretamente no campo acima; para guardar uma nova sugestão, use “Incluir opção”.</p>
        <div className="op-config-add">
          <label className="op-field">
            <span>Nome do novo campo</span>
            <input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Ex.: Frota, número do motor, ocasião, CNPJ…" />
          </label>
          <label className="op-field">
            <span>Onde esse campo pertence?</span>
            <select value={customGroup} onChange={event => setCustomGroup(event.target.value)}>
              {definition.customFieldGroups.map(group => <option key={group}>{group}</option>)}
            </select>
          </label>
          <Button variant="secondary" onClick={addCustomField}><Plus size={16} />Adicionar campo</Button>
        </div>
        {preferences.customFields.length > 0 && <div className="op-custom-fields">
          {preferences.customFields.map(custom => <div className="op-row" key={custom.id}>
            <label className="op-config-switch">
              <input type="checkbox" checked={custom.visible} onChange={event => { setSaved(false); setPreferences(current => ({
                ...current,
                customFields: current.customFields.map(item => item.id === custom.id ? { ...item, visible: event.target.checked } : item)
              })); }} />
              <span>{custom.visible ? 'Mostrar' : 'Ocultar'}</span>
            </label>
            <div className="op-grow"><strong>{custom.label}</strong><small>{custom.group}</small></div>
            <button className="op-icon" type="button" aria-label={`Remover ${custom.label}`} onClick={() => { setSaved(false); setPreferences(current => ({
              ...current,
              customFields: current.customFields.filter(item => item.id !== custom.id)
            })); }}><Trash2 size={16} /></button>
          </div>)}
        </div>}
      </Section>

      <Section title="Ações e módulos disponíveis">
        <p className="op-muted">Desative o que a sua equipe não usa. O item deixa de aparecer na experiência em vez de ficar como uma função vazia ou desabilitada.</p>
        <div className="op-config-groups">
          {actionGroups.map(group => <div className="op-config-group" key={group}>
            <div className="op-config-group-title"><strong>{group}</strong></div>
            {definition.actions.filter(action => action.group === group).map(action => {
              const visible = action.required || preferences.actionVisibility[action.key] !== false;
              return <label className="op-module-choice" key={action.key}>
                <input type="checkbox" checked={visible} disabled={action.required} onChange={event => setActionVisible(action.key, event.target.checked)} />
                <span><strong>{action.label}</strong><small>{action.description}</small></span>
                <Badge>{action.required ? 'Essencial' : visible ? 'Ativo' : 'Oculto'}</Badge>
              </label>;
            })}
          </div>)}
        </div>
      </Section>

      {app === 'zeus' && <Section title="Prévia do fluxo da oficina">
        <p className="op-muted">A sequência se recompõe automaticamente quando Diagnóstico, Orçamento ou Agendamento não fazem parte da operação. “Tipo de atendimento” também faz parte da área Atendimento acima: você pode digitar um tipo, usar uma sugestão ou incluir outro tipo para a oficina.</p>
        <div className="zeus-settings-preview">
          <span className="op-kicker">Prévia da identificação</span>
          <div>
            <strong>{preferences.fieldLabels.identifier || 'Placa'}</strong>
            <span>{preferences.fieldLabels.asset || 'Veículo'}</span>
            <small>{preferences.fieldLabels.meter || 'Quilometragem'}</small>
          </div>
        </div>
        <div className="zeus-process compact">{stages({
          ...draft,
          scheduleEnabled: preferences.actionVisibility['module:agendamentos'] !== false,
          diagnosisEnabled: preferences.actionVisibility.diagnosis !== false,
          budgetEnabled: preferences.actionVisibility.budget !== false
        }).map((value, index) => <span key={value}><b>{String(index + 1).padStart(2, '0')}</b>{value}</span>)}</div>
      </Section>}

      {app === 'artemis' && <Section title="Delivery e atendimento online">
        <div className="op-fields">
          <label className="op-field"><span>Taxa de entrega padrão (R$)</span><input type="number" min="0" step="0.01" value={draft.deliveryFee / 100} onChange={event => setDraft({ ...draft, deliveryFee: Math.round(Number(event.target.value) * 100) })} /></label>
          <label className="op-field"><span>Pedido mínimo de delivery (R$)</span><input type="number" min="0" step="0.01" value={draft.minimumOrder / 100} onChange={event => setDraft({ ...draft, minimumOrder: Math.round(Number(event.target.value) * 100) })} /></label>
          {field('deliveryAreas', 'Bairros / zonas atendidas')}
          {field('hours', 'Horários de atendimento')}
        </div>
      </Section>}

      <div className="op-form-footer">
        {saved && <span role="status">Configurações salvas.</span>}
        <Button type="submit">Salvar configurações</Button>
      </div>
    </form>

    <LocalAccountSettings />

    <Section title="Cópia dos seus dados">
      <p>Os registros operacionais ainda são mantidos neste navegador nesta versão. Exporte uma cópia antes de trocar de dispositivo ou limpar os dados locais.</p>
      <div className="op-actions">
        <Button variant="secondary" onClick={() => {
          const raw = localStorage.getItem(storageKey(app)) || JSON.stringify(w.data);
          const config = localStorage.getItem(`crmplus:${app}:configuration:v1`);
          download(`${app}-backup.json`, JSON.stringify({ app, exportedAt: new Date().toISOString(), data: JSON.parse(raw), configuration: config ? JSON.parse(config) : preferences }, null, 2));
        }}><Download size={17} />Exportar dados</Button>
        <label className="op-button secondary"><FileUp size={17} />Restaurar cópia<input hidden type="file" accept="application/json,.json" onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 15000000) throw new Error('A cópia excede o limite de 15 MB.');
            const raw = JSON.parse(await file.text());
            if (raw.app !== app) throw new Error('Esta cópia pertence a outro aplicativo.');
            decodeData(JSON.stringify(raw.data));
            setImportData(JSON.stringify(raw));
          } catch (error) {
            w.setError((error as Error).message);
          }
          event.target.value = '';
        }} /></label>
      </div>
    </Section>

    <Section title="Persistência e acesso">
      <p>A CRM PLUS Store centralizará login, conta, assinatura e permissões no Supabase central. Os dados operacionais deste aplicativo continuarão separados e serão ligados depois ao projeto Supabase próprio do app.</p>
    </Section>

    {importData && <Confirm title="Restaurar esta cópia?" label="Substituir dados deste aplicativo" onClose={() => setImportData(null)} onConfirm={async () => {
      const raw = JSON.parse(importData);
      const ok = await w.restore(JSON.stringify(raw.data));
      if (ok && raw.configuration) saveOperationPreferences(app, raw.configuration);
      return ok;
    }}>Os registros e configurações atuais deste app serão substituídos pelos da cópia. Exporte os dados atuais antes de continuar, se precisar preservá-los.</Confirm>}
  </>;
}
