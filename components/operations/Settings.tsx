'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileUp, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { AppId, Settings, stages, uid } from '@/lib/operations/model';
import { Workspace, decodeData, download } from '@/lib/operations/storage';
import {
  CustomField, OperationPreferences, defaultOperationPreferences, saveOperationPreferences,
  segmentDefinitions, useOperationPreferences
} from '@/lib/operations/configuration';
import { Badge, Button, Confirm, Section, Title } from './ui';
import { ConfigFieldNameSelect } from './ConfigFieldNameSelect';
import { ZeusSettingsExtras } from './ZeusSettingsExtras';
import { CompactTabs, CompactPanel } from './CompactTabs';
import { LocalAccountSettings } from './LocalAccountSettings';

type PreferencesWithHelp = OperationPreferences & { fieldHelp: Record<string, string> };

function withDefaultHelp(app: AppId, value: OperationPreferences): PreferencesWithHelp {
  const defaults = Object.fromEntries(segmentDefinitions[app].fields.map(field => [field.key, field.description]));
  const current = value as PreferencesWithHelp;
  return { ...value, fieldHelp: { ...defaults, ...(current.fieldHelp || {}) } };
}

function dependencyMessage(app: AppId, key: string) {
  if (app !== 'artemis') return '';
  if (key === 'payments' || key === 'refunds') return 'Acompanha o módulo Caixa.';
  if (key === 'dineIn' || key === 'transferTable') return 'Acompanha Mesas e comandas.';
  if (key === 'delivery') return 'Ao ativar, o endereço de entrega fica disponível.';
  return '';
}

function normalizeDependencies(app: AppId, current: PreferencesWithHelp) {
  const next: PreferencesWithHelp = {
    ...current,
    fieldLabels: { ...current.fieldLabels },
    fieldVisibility: { ...current.fieldVisibility },
    actionVisibility: { ...current.actionVisibility },
    fieldHelp: { ...(current.fieldHelp || {}) },
    customFields: current.customFields.map(item => ({ ...item })),
  };
  if (app === 'artemis') {
    if (next.actionVisibility['module:caixa'] === false) {
      next.actionVisibility.payments = false;
      next.actionVisibility.refunds = false;
    }
    if (next.actionVisibility['module:mesas'] === false) {
      next.actionVisibility.dineIn = false;
      next.actionVisibility.transferTable = false;
    }
    if (next.actionVisibility.delivery !== false) next.fieldVisibility.deliveryAddress = true;
  }
  return next;
}

export function AppSettings({ w, app }: { w: Workspace; app: AppId }) {
  const operation = useOperationPreferences(app);
  const definition = segmentDefinitions[app];
  const [draft, setDraft] = useState<Settings>(() => ({ ...w.data.settings, salesStages: [...w.data.settings.salesStages] }));
  const [preferences, setPreferences] = useState<PreferencesWithHelp>(() => withDefaultHelp(app, defaultOperationPreferences(app)));
  const [importData, setImportData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customGroup, setCustomGroup] = useState(definition.customFieldGroups[0]);
  const [newStage, setNewStage] = useState('');

  useEffect(() => setPreferences(withDefaultHelp(app, operation.preferences)), [app, operation.preferences]);
  useEffect(() => setDraft({ ...w.data.settings, salesStages: [...w.data.settings.salesStages] }), [w.data.settings]);

  const fieldGroups = useMemo(() => Array.from(new Set(definition.fields.map(field => field.group))), [definition.fields]);
  const actionGroups = useMemo(() => Array.from(new Set(definition.actions.map(action => action.group))), [definition.actions]);

  const field = (key: keyof Settings, label: string, type = 'text') => (
    <label className="op-field">
      <span>{label}</span>
      <input type={type} value={Array.isArray(draft[key]) || typeof draft[key] === 'object' ? '' : String(draft[key] ?? '')} onChange={event => {
        setSaved(false);
        setDraft({ ...draft, [key]: event.target.value });
      }} />
    </label>
  );

  const setFieldLabel = (key: string, value: string) => {
    setSaved(false);
    setPreferences(current => ({ ...current, fieldLabels: { ...current.fieldLabels, [key]: value } }));
  };
  const setFieldHelp = (key: string, value: string) => {
    setSaved(false);
    setPreferences(current => ({ ...current, fieldHelp: { ...(current.fieldHelp || {}), [key]: value } }));
  };
  const setFieldVisible = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => ({ ...current, fieldVisibility: { ...current.fieldVisibility, [key]: value } }));
  };
  const setActionVisible = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => normalizeDependencies(app, { ...current, actionVisibility: { ...current.actionVisibility, [key]: value } }));
  };

  const addCustomField = () => {
    const label = customName.trim();
    if (!label) return;
    if (preferences.customFields.some(item => item.group === customGroup && item.label.toLocaleLowerCase('pt-BR') === label.toLocaleLowerCase('pt-BR'))) {
      w.setError('Já existe um campo adicional com esse nome nesta área.');
      return;
    }
    const newField: CustomField = { id: uid(), label, group: customGroup, visible: true };
    setPreferences(current => ({ ...current, customFields: [...current.customFields, newField] }));
    setCustomName('');
    setSaved(false);
  };

  const moveStage = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.salesStages.length) return;
    const copy = [...draft.salesStages];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setDraft({ ...draft, salesStages: copy });
    setSaved(false);
  };

  const addStage = () => {
    const value = newStage.trim();
    if (!value) return;
    if (['Ganha', 'Perdida'].includes(value)) { w.setError('“Ganha” e “Perdida” são resultados finais e não entram no pipeline aberto.'); return; }
    if (draft.salesStages.some(stage => stage.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))) { w.setError('Essa etapa já existe.'); return; }
    setDraft({ ...draft, salesStages: [...draft.salesStages, value] });
    setNewStage('');
    setSaved(false);
  };

  const validate = (nextPreferences: PreferencesWithHelp) => {
    if (app === 'kronos') {
      if (draft.salesStages.length < 2) throw new Error('O pipeline precisa ter pelo menos duas etapas abertas.');
      const activeStages = new Set(w.data.deals.filter(deal => !['Ganha', 'Perdida'].includes(deal.stage)).map(deal => deal.stage));
      const removedInUse = [...activeStages].find(stage => !draft.salesStages.includes(stage));
      if (removedInUse) throw new Error(`A etapa “${removedInUse}” ainda possui oportunidades abertas. Mova ou encerre essas oportunidades antes de remover a etapa.`);
    }
    if (app === 'zeus' && w.data.settings.budgetEnabled && nextPreferences.actionVisibility.budget === false && w.data.jobs.some(job => job.status === 'Aguardando aprovação')) {
      throw new Error('Resolva os orçamentos que aguardam decisão antes de desativar essa etapa.');
    }
  };

  const save = async () => {
    const normalizedLabels = Object.fromEntries(Object.entries(preferences.fieldLabels).map(([key, value]) => [key, value.trim()]));
    const requiredEmpty = definition.fields.find(configField => configField.required && !normalizedLabels[configField.key]);
    if (requiredEmpty) { w.setError(`O nome do campo “${requiredEmpty.label}” não pode ficar vazio.`); return false; }

    const nextPreferences = normalizeDependencies(app, { ...preferences, fieldLabels: normalizedLabels });
    try { validate(nextPreferences); } catch (error) { w.setError((error as Error).message); return false; }

    const ok = await w.mutate(data => {
      const theme = data.settings.theme;
      const collapsed = data.settings.collapsed;
      const next: Settings = { ...draft, theme, collapsed, salesStages: [...draft.salesStages], operationPreferences: nextPreferences };

      if (app === 'zeus') {
        next.identifierLabel = normalizedLabels.identifier || 'Placa';
        next.assetLabel = normalizedLabels.asset || 'Veículo';
        next.meterLabel = normalizedLabels.meter || 'Quilometragem';
        next.scheduleEnabled = nextPreferences.actionVisibility['module:agendamentos'] !== false;
        next.diagnosisEnabled = nextPreferences.actionVisibility.diagnosis !== false;
        next.budgetEnabled = nextPreferences.actionVisibility.budget !== false;
        for (const job of data.jobs) {
          if (['Encerrado', 'Cancelado', 'Reprovado'].includes(job.status)) continue;
          if (!next.budgetEnabled && job.stage === 'Orçamento') {
            job.stage = 'Execução';
            if (job.status === 'Aguardando aprovação' || job.status === 'Aguardando orçamento') job.status = 'Em andamento';
          }
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

  const cloudCanonical = (app === 'zeus' || app === 'artemis') && w.accountId !== 'guest';

  return <>
    <Title eyebrow="Sua operação" title="Configurações">{definition.description}</Title>
    <CompactTabs label="Áreas de configuração" tabs={[{id:'dados',label:'Dados'},{id:'campos',label:'Campos'},{id:'operacao',label:'Operação'},{id:'acessos',label:'Acessos'},{id:'backup',label:'Cópias de dados'}]}>
    <form onSubmit={async event => { event.preventDefault(); await save(); }}>
      <CompactPanel value="dados"><Section title={app === 'zeus' ? 'Dados da oficina' : app === 'artemis' ? 'Dados do restaurante' : 'Dados do negócio'}>
        <div className="op-fields">{field('business', 'Nome do negócio')}{field('operator', 'Seu nome')}{field('phone', 'Telefone', 'tel')}{field('email', 'E-mail', 'email')}<div className="span-full">{field('address', 'Endereço')}</div></div>
      </Section></CompactPanel>

      <CompactPanel value="campos"><Section title="Campos, nomes e ajuda">
        <p className="op-muted">Escolha o que aparece, como cada campo se chama e o texto curto mostrado no ícone de ajuda. O histórico já registrado não é apagado.</p>
        <div className="op-config-groups">{fieldGroups.map(group => <details className="op-config-group" key={group}>
          <summary><strong>{group}</strong><span>{definition.fields.filter(configField => configField.group === group).length} campos</span></summary>
          {definition.fields.filter(configField => configField.group === group).map(configField => {
            const visible = configField.required || preferences.fieldVisibility[configField.key] !== false;
            const currentLabel = preferences.fieldLabels[configField.key] ?? configField.label;
            return <div className="op-config-row" key={configField.key}>
              <label className="op-config-switch"><input type="checkbox" checked={visible} disabled={configField.required} onChange={event => setFieldVisible(configField.key, event.target.checked)} /><span>{visible ? 'Mostrar' : 'Ocultar'}</span></label>
              <div className="op-config-name-stack">
                <div className="op-field op-config-name"><span>Nome no aplicativo</span><ConfigFieldNameSelect app={app} fieldKey={configField.key} fallback={configField.label} value={currentLabel} onChange={value => setFieldLabel(configField.key, value)} /></div>
                <label className="op-field"><span><HelpCircle size={14} /> Ajuda do campo</span><input value={preferences.fieldHelp?.[configField.key] ?? configField.description} onChange={event => setFieldHelp(configField.key, event.target.value)} maxLength={240} /></label>
              </div>
              <div className="op-config-description"><strong>{configField.label}{configField.required && <Badge>Essencial</Badge>}</strong><small>{configField.description}</small></div>
            </div>;
          })}
        </details>)}</div>
      </Section>

      <Section title="Adicionar mais um campo">
        <p className="op-muted">Campos adicionais também podem ser renomeados ou ocultados depois.</p>
        <div className="op-config-add"><label className="op-field"><span>Nome do novo campo</span><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Ex.: Frota, número do motor, ocasião, CNPJ…" /></label><label className="op-field"><span>Onde esse campo pertence?</span><select value={customGroup} onChange={event => setCustomGroup(event.target.value)}>{definition.customFieldGroups.map(group => <option key={group}>{group}</option>)}</select></label><Button variant="secondary" onClick={addCustomField}><Plus size={16} />Adicionar campo</Button></div>
        {preferences.customFields.length > 0 && <div className="op-custom-fields">{preferences.customFields.map(custom => <div className="op-row op-custom-field-edit" key={custom.id}><label className="op-config-switch"><input type="checkbox" checked={custom.visible} onChange={event => { setSaved(false); setPreferences(current => ({ ...current, customFields: current.customFields.map(item => item.id === custom.id ? { ...item, visible: event.target.checked } : item) })); }} /><span>{custom.visible ? 'Mostrar' : 'Ocultar'}</span></label><label className="op-field op-grow"><span>Nome no aplicativo</span><input value={custom.label} onChange={event => { setSaved(false); setPreferences(current => ({ ...current, customFields: current.customFields.map(item => item.id === custom.id ? { ...item, label: event.target.value } : item) })); }} /></label><small>{custom.group}</small><button className="op-icon" type="button" aria-label={`Remover ${custom.label}`} onClick={() => { setSaved(false); setPreferences(current => ({ ...current, customFields: current.customFields.filter(item => item.id !== custom.id) })); }}><Trash2 size={16} /></button></div>)}</div>}
      </Section></CompactPanel>

      <CompactPanel value="operacao">
      {app === 'zeus' && <Section title="Linguagem da oficina">
        <p className="op-muted">Defina como sua equipe chama o item atendido. Esse nome também é usado na área de clientes e no menu do Zeus.</p>
        <div className="op-fields"><label className="op-field"><span>Como você chama o item atendido?</span><input value={preferences.fieldLabels.asset || 'Veículo'} onChange={event => setFieldLabel('asset', event.target.value)} placeholder="Ex.: Veículo, Equipamento, Máquina, Moto" /></label></div>
      </Section>}
      <Section title="Ações e módulos disponíveis">
        <p className="op-muted">Desative o que a equipe não usa. Quando uma função depende de outra, o Zeus ou Artemis ajusta as opções relacionadas automaticamente.</p>
        <div className="op-config-groups">{actionGroups.map(group => <div className="op-config-group" key={group}><div className="op-config-group-title"><strong>{group}</strong></div>{definition.actions.filter(action => action.group === group).map(action => {
          const visible = action.required || preferences.actionVisibility[action.key] !== false;
          const dependency = dependencyMessage(app, action.key);
          return <label className="op-module-choice" key={action.key}><input type="checkbox" checked={visible} disabled={action.required} onChange={event => setActionVisible(action.key, event.target.checked)} /><span><strong>{action.label}</strong><small>{action.description}</small>{dependency && <small>{dependency}</small>}</span><Badge>{action.required ? 'Essencial' : visible ? 'Ativo' : 'Oculto'}</Badge></label>;
        })}</div>)}</div>
      </Section>

      {app === 'zeus' && <><Section title="Prévia do fluxo da oficina"><p className="op-muted">A sequência se recompõe automaticamente quando Diagnóstico ou Orçamento não fazem parte da operação.</p><div className="zeus-settings-preview"><span className="op-kicker">Prévia da identificação</span><div><strong>{preferences.fieldLabels.identifier || 'Placa'}</strong><span>{preferences.fieldLabels.asset || 'Veículo'}</span><small>{preferences.fieldLabels.meter || 'Quilometragem'}</small></div></div><div className="zeus-process compact">{stages({ ...draft, scheduleEnabled: preferences.actionVisibility['module:agendamentos'] !== false, diagnosisEnabled: preferences.actionVisibility.diagnosis !== false, budgetEnabled: preferences.actionVisibility.budget !== false }).map((value, index) => <span key={value}><b>{String(index + 1).padStart(2, '0')}</b>{value}</span>)}</div></Section><ZeusSettingsExtras w={w} budgetEnabled={preferences.actionVisibility.budget !== false} /></>}

      {app === 'kronos' && <Section title="Etapas do pipeline"><p className="op-muted">Organize a sequência real da sua venda. Etapas com oportunidades abertas não podem ser removidas até que esses registros sejam movidos ou encerrados.</p><div className="op-custom-fields">{draft.salesStages.map((stage, index) => <div className="op-row" key={`${stage}-${index}`}><strong className="op-grow">{index + 1}. {stage}</strong><button type="button" className="op-icon" aria-label={`Mover ${stage} para cima`} disabled={index === 0} onClick={() => moveStage(index, -1)}><ArrowUp size={16} /></button><button type="button" className="op-icon" aria-label={`Mover ${stage} para baixo`} disabled={index === draft.salesStages.length - 1} onClick={() => moveStage(index, 1)}><ArrowDown size={16} /></button><button type="button" className="op-icon" aria-label={`Remover ${stage}`} disabled={draft.salesStages.length <= 2} onClick={() => { setDraft({ ...draft, salesStages: draft.salesStages.filter((_, current) => current !== index) }); setSaved(false); }}><Trash2 size={16} /></button></div>)}</div><div className="op-config-add"><label className="op-field"><span>Nova etapa</span><input value={newStage} onChange={event => setNewStage(event.target.value)} placeholder="Ex.: Demonstração, validação técnica…" /></label><Button variant="secondary" onClick={addStage}><Plus size={16} />Adicionar etapa</Button></div></Section>}

      {app === 'artemis' && <Section title="Delivery e atendimento online"><div className="op-fields"><label className="op-field"><span>Taxa de entrega padrão (R$)</span><input type="number" min="0" step="0.01" value={draft.deliveryFee / 100} onChange={event => setDraft({ ...draft, deliveryFee: Math.round(Number(event.target.value) * 100) })} /></label><label className="op-field"><span>Pedido mínimo de delivery (R$)</span><input type="number" min="0" step="0.01" value={draft.minimumOrder / 100} onChange={event => setDraft({ ...draft, minimumOrder: Math.round(Number(event.target.value) * 100) })} /></label>{field('deliveryAreas', 'Bairros / zonas atendidas')}{field('hours', 'Horários de atendimento')}</div></Section>}

      </CompactPanel><div className="op-form-footer op-settings-actions">{saved && <span role="status">Configurações salvas.</span>}<Button type="submit">Salvar configurações</Button></div>
    </form>

    <CompactPanel value="acessos"><LocalAccountSettings /></CompactPanel>
    <CompactPanel value="backup">
      <Section title="Cópia dos seus dados"><p>{cloudCanonical ? 'Seus dados operacionais ficam salvos na nuvem. A exportação abaixo é uma cópia adicional para arquivo próprio.' : 'Exporte uma cópia antes de trocar de dispositivo ou limpar os dados locais.'}</p><div className="op-actions"><Button variant="secondary" onClick={() => { const config = localStorage.getItem(`crmplus:${app}:configuration:v1`); download(`${app}-backup.json`, JSON.stringify({ app, exportedAt: new Date().toISOString(), data: w.data, configuration: config ? JSON.parse(config) : preferences }, null, 2)); }}><Download size={17} />Exportar dados</Button><label className="op-button secondary"><FileUp size={17} />Restaurar cópia<input hidden type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 15000000) throw new Error('A cópia excede o limite de 15 MB.'); const raw = JSON.parse(await file.text()); if (raw.app !== app) throw new Error('Esta cópia pertence a outro aplicativo.'); decodeData(JSON.stringify(raw.data)); setImportData(JSON.stringify(raw)); } catch (error) { w.setError((error as Error).message); } event.target.value = ''; }} /></label></div></Section>
      <Section title="Onde seus dados ficam"><p>{cloudCanonical ? `Os dados desta conta são gravados no projeto Supabase exclusivo do ${app === 'zeus' ? 'Zeus' : 'Artemis'}. O navegador não é mais a fonte principal desses registros.` : 'Este ambiente ainda usa armazenamento local.'}</p></Section>
    </CompactPanel>
    </CompactTabs>
    {importData && <Confirm title="Restaurar esta cópia?" label="Substituir dados deste aplicativo" onClose={() => setImportData(null)} onConfirm={async () => { const raw = JSON.parse(importData); const ok = await w.restore(JSON.stringify(raw.data)); if (ok && raw.configuration) saveOperationPreferences(app, raw.configuration); return ok; }}>Os registros e configurações atuais deste app serão substituídos pelos da cópia. Exporte os dados atuais antes de continuar, se precisar preservá-los.</Confirm>}
  </>;
}
