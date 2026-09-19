'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, FileUp, HelpCircle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { clientMessage } from '@/lib/clientMessage';
import { AppId, Settings, stages, uid } from '@/lib/operations/model';
import { Workspace, decodeData, download } from '@/lib/operations/storage';
import {
  CustomField, OperationPreferences, defaultOperationPreferences, saveOperationPreferences,
  segmentDefinitions, useOperationPreferences
} from '@/lib/operations/configuration';
import { readZeusPreferences, writeZeusPreferences, type ZeusPreferences } from '@/lib/operations/zeus';
import { zeusViewHasFeature } from '@/lib/operations/zeusPlans';
import { Badge, Button, Confirm, Title } from './ui';
import { ConfigFieldNameSelect, resetFieldLabelOptions } from './ConfigFieldNameSelect';
import { ZeusSettingsExtras } from './ZeusSettingsExtras';
import { CompactTabs, CompactPanel } from './CompactTabs';
import { LocalAccountSettings } from './LocalAccountSettings';
import { SettingsSection } from './SettingsSection';
import { FieldHelpAISuggestions } from './FieldHelpAISuggestions';
import { PaymentIntegrationSetting } from './PaymentIntegrationSetting';

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
  const [zeusPreferences, setZeusPreferences] = useState<ZeusPreferences>(() => readZeusPreferences(w.data));
  const [importData, setImportData] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirtySections, setDirtySections] = useState<Set<string>>(() => new Set());
  const [savingSection, setSavingSection] = useState('');
  const [customName, setCustomName] = useState('');
  const [customGroup, setCustomGroup] = useState(definition.customFieldGroups[0]);
  const [newStage, setNewStage] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const flowPreviewRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);

  const markDirty = (section = 'geral') => {
    dirtyRef.current = true;
    setSaved(false);
    if (app === 'zeus') setDirtySections(current => {
      const next = new Set(current);
      next.add(section);
      return next;
    });
  };

  useEffect(() => {
    dirtyRef.current = false;
    setSaved(false);
    setDirtySections(new Set());
    setSavingSection('');
    setPreferences(withDefaultHelp(app, operation.preferences));
    setDraft({ ...w.data.settings, salesStages: [...w.data.settings.salesStages] });
    setZeusPreferences(readZeusPreferences(w.data));
    setCustomGroup(definition.customFieldGroups[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  useEffect(() => {
    if (!dirtyRef.current) setPreferences(withDefaultHelp(app, operation.preferences));
  }, [app, operation.preferences]);
  useEffect(() => {
    if (!dirtyRef.current) {
      setDraft({ ...w.data.settings, salesStages: [...w.data.settings.salesStages] });
      if (app === 'zeus') setZeusPreferences(readZeusPreferences(w.data));
    }
  }, [app, w.data]);

  const fieldGroups = useMemo(() => Array.from(new Set(definition.fields.map(field => field.group))), [definition.fields]);
  const actionGroups = useMemo(() => Array.from(new Set(definition.actions.map(action => action.group))), [definition.actions]);

  const field = (key: keyof Settings, label: string, type = 'text', section = 'dados') => (
    <label className="op-field">
      <span>{label}</span>
      <input type={type} value={Array.isArray(draft[key]) || typeof draft[key] === 'object' ? '' : String(draft[key] ?? '')} onChange={event => {
        markDirty(section);
        setDraft({ ...draft, [key]: event.target.value });
      }} />
    </label>
  );

  const setFieldLabel = (key: string, value: string, section = 'personalizacao') => {
    markDirty(section);
    setPreferences(current => ({ ...current, fieldLabels: { ...current.fieldLabels, [key]: value } }));
  };
  const setFieldHelp = (key: string, value: string) => {
    markDirty('personalizacao');
    setPreferences(current => ({ ...current, fieldHelp: { ...(current.fieldHelp || {}), [key]: value } }));
  };
  const setFieldVisible = (key: string, value: boolean) => {
    markDirty('personalizacao');
    setPreferences(current => ({ ...current, fieldVisibility: { ...current.fieldVisibility, [key]: value } }));
  };
  const scrollToFlowPreview = () => {
    if (app !== 'zeus') return;
    window.requestAnimationFrame(() => flowPreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const setActionVisible = (key: string, value: boolean) => {
    markDirty('fluxo');
    setPreferences(current => normalizeDependencies(app, { ...current, actionVisibility: { ...current.actionVisibility, [key]: value } }));
    scrollToFlowPreview();
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
    markDirty('campos-adicionais');
  };

  const moveStage = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.salesStages.length) return;
    const copy = [...draft.salesStages];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setDraft({ ...draft, salesStages: copy });
    markDirty('pipeline');
  };

  const addStage = () => {
    const value = newStage.trim();
    if (!value) return;
    if (['Ganha', 'Perdida'].includes(value)) { w.setError('“Ganha” e “Perdida” são resultados finais e não entram no pipeline aberto.'); return; }
    if (draft.salesStages.some(stage => stage.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))) { w.setError('Essa etapa já existe.'); return; }
    setDraft({ ...draft, salesStages: [...draft.salesStages, value] });
    setNewStage('');
    markDirty('pipeline');
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
    try { validate(nextPreferences); } catch (error) { w.setError(clientMessage(error, 'Revise as configurações antes de salvar.')); return false; }

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
        writeZeusPreferences(data, zeusPreferences);
      }

      data.settings = next;
    }, 'Configurações salvas.');

    if (!ok) return false;
    saveOperationPreferences(app, nextPreferences);
    setPreferences(nextPreferences);
    dirtyRef.current = false;
    setDirtySections(new Set());
    setSaved(true);
    return true;
  };

  const saveSection = async (section: string) => {
    if (savingSection) return false;
    setSavingSection(section);
    try { return await save(); }
    finally { setSavingSection(''); }
  };

  const sectionSave = (section: string) => app === 'zeus' && dirtySections.has(section)
    ? <div className="op-settings-section-save"><Button disabled={!!savingSection} onClick={() => { void saveSection(section); }}>{savingSection === section ? 'Salvando…' : 'Salvar alteração'}</Button></div>
    : null;

  const restorePersonalization = async () => {
    const defaults = withDefaultHelp(app, defaultOperationPreferences(app));
    const nextPreferences = normalizeDependencies(app, {
      ...preferences,
      fieldLabels: { ...defaults.fieldLabels },
      fieldVisibility: { ...defaults.fieldVisibility },
      actionVisibility: { ...preferences.actionVisibility },
      fieldHelp: { ...defaults.fieldHelp },
      customFields: defaults.customFields.map(item => ({ ...item })),
    });
    setRestoring(true);
    try {
      const ok = await w.mutate(data => {
        const next: Settings = { ...data.settings, operationPreferences: nextPreferences };
        if (app === 'zeus') {
          next.identifierLabel = nextPreferences.fieldLabels.identifier || 'Placa';
          next.assetLabel = nextPreferences.fieldLabels.asset || 'Veículo';
          next.meterLabel = nextPreferences.fieldLabels.meter || 'Quilometragem';
        }
        data.settings = next;
      }, 'Personalização restaurada ao padrão.');
      if (!ok) return false;
      saveOperationPreferences(app, nextPreferences);
      resetFieldLabelOptions(app, definition.fields.map(field => field.key));
      setPreferences(nextPreferences);
      setCustomName('');
      dirtyRef.current = false;
      setDirtySections(new Set());
      setSaved(true);
      return true;
    } finally {
      setRestoring(false);
    }
  };

  const cloudCanonical = (app === 'zeus' || app === 'artemis') && w.accountId !== 'guest';
  const fullOperationalSettings = app !== 'zeus' || zeusViewHasFeature(w.data.settings, 'full_operational_settings');
  const teamSettings = app !== 'zeus' || zeusViewHasFeature(w.data.settings, 'team_management');
  const dataExport = app !== 'zeus' || zeusViewHasFeature(w.data.settings, 'export');
  const settingsTabs = [
    { id:'dados', label:'Dados' },
    ...(fullOperationalSettings ? [{ id:'campos', label:'Personalização' }, { id:'operacao', label:'Fluxo do processo' }] : []),
    ...(teamSettings ? [{ id:'acessos', label:'Acessos' }] : []),
    ...(dataExport ? [{ id:'backup', label:'Cópias de dados' }] : []),
  ];

  return <>
    <Title eyebrow="Sua operação" title="Configurações">{definition.description}</Title>
    <CompactTabs label="Áreas de configuração" tabs={settingsTabs}>
    <form onSubmit={async event => { event.preventDefault(); if (app !== 'zeus') await save(); }}>
      <CompactPanel value="dados">
        <SettingsSection title={app === 'zeus' ? 'Dados da oficina' : app === 'artemis' ? 'Dados do restaurante' : 'Dados do negócio'} description="Informações principais usadas no cadastro e na operação.">
          <div className="op-fields">{field('business', 'Nome do negócio')}{field('operator', 'Seu nome')}{field('phone', 'Telefone', 'tel')}{field('email', 'E-mail', 'email')}<div className="span-full">{field('address', 'Endereço')}</div></div>
          {sectionSave('dados')}
        </SettingsSection>
        {app === 'zeus' && zeusViewHasFeature(w.data.settings, 'billing') && <PaymentIntegrationSetting app="zeus" />}
      </CompactPanel>

      <CompactPanel value="campos">
        <SettingsSection title="Personalize como sua operação identifica cada item" description="Defina nomes, visibilidade e dicas dos campos usados pela equipe.">
          <div className="op-actions"><Button variant="secondary" onClick={() => setRestoreConfirm(true)}><RotateCcw size={16}/>Restaurar padrão</Button></div>
          <div className="op-config-groups">{fieldGroups.map(group => <details className="op-config-group" key={group}>
            <summary><strong>{group}</strong><span>{definition.fields.filter(configField => configField.group === group).length} campos</span></summary>
            {definition.fields.filter(configField => configField.group === group).map(configField => {
              const visible = configField.required || preferences.fieldVisibility[configField.key] !== false;
              const currentLabel = preferences.fieldLabels[configField.key] ?? configField.label;
              const currentHelp = preferences.fieldHelp?.[configField.key] ?? configField.description;
              return <div className="op-config-row" key={configField.key}>
                <label className="op-config-switch"><input type="checkbox" checked={visible} disabled={configField.required} onChange={event => setFieldVisible(configField.key, event.target.checked)} /><span>{visible ? 'Mostrar' : 'Ocultar'}</span></label>
                <div className="op-config-name-stack">
                  <div className="op-field op-config-name"><span>Nome no aplicativo</span><ConfigFieldNameSelect app={app} fieldKey={configField.key} fallback={configField.label} value={currentLabel} onChange={value => setFieldLabel(configField.key, value)} /></div>
                  <div className="op-field op-config-help">
                    <div className="op-config-help-head"><span><HelpCircle size={14} /> Personalizar dica</span><FieldHelpAISuggestions app={app} fieldKey={configField.key} label={currentLabel} description={configField.description} currentHelp={currentHelp} onApply={value => setFieldHelp(configField.key, value)} /></div>
                    <input value={currentHelp} onChange={event => setFieldHelp(configField.key, event.target.value)} maxLength={240} />
                    <small>Essa dica orienta o preenchimento e não altera o nome do campo.</small>
                  </div>
                </div>
                <div className="op-config-description"><strong>{configField.label}{configField.required && <Badge>Essencial</Badge>}</strong><small>{configField.description}</small></div>
              </div>;
            })}
          </details>)}</div>
          {sectionSave('personalizacao')}
        </SettingsSection>

        <SettingsSection title="Adicionar mais um campo" description="Crie campos extras e escolha como eles aparecem para a equipe.">
          <div className="op-config-add"><label className="op-field"><span>Nome do novo campo</span><input value={customName} onChange={event => setCustomName(event.target.value)} placeholder="Ex.: Frota, número do motor, ocasião, CNPJ…" /></label><label className="op-field"><span>Onde esse campo pertence?</span><select value={customGroup} onChange={event => setCustomGroup(event.target.value)}>{definition.customFieldGroups.map(group => <option key={group}>{group}</option>)}</select></label><Button variant="secondary" onClick={addCustomField}><Plus size={16} />Adicionar campo</Button></div>
          {preferences.customFields.length > 0 && <div className="op-custom-fields">{preferences.customFields.map(custom => <div className="op-row op-custom-field-edit" key={custom.id}><label className="op-config-switch"><input type="checkbox" checked={custom.visible} onChange={event => { markDirty('campos-adicionais'); setPreferences(current => ({ ...current, customFields: current.customFields.map(item => item.id === custom.id ? { ...item, visible: event.target.checked } : item) })); }} /><span>{custom.visible ? 'Mostrar' : 'Ocultar'}</span></label><label className="op-field op-grow"><span>Nome no aplicativo</span><input value={custom.label} onChange={event => { markDirty('campos-adicionais'); setPreferences(current => ({ ...current, customFields: current.customFields.map(item => item.id === custom.id ? { ...item, label: event.target.value } : item) })); }} /></label><small>{custom.group}</small><button className="op-icon" type="button" aria-label={`Remover ${custom.label}`} onClick={() => { markDirty('campos-adicionais'); setPreferences(current => ({ ...current, customFields: current.customFields.filter(item => item.id !== custom.id) })); }}><Trash2 size={16} /></button></div>)}</div>}
          {sectionSave('campos-adicionais')}
        </SettingsSection>

        {app === 'zeus' && <ZeusSettingsExtras w={w} budgetEnabled={preferences.actionVisibility.budget !== false} value={zeusPreferences} onChange={value => { markDirty('filtros'); setZeusPreferences(value); }} dirty={dirtySections.has('filtros')} saving={savingSection === 'filtros'} onSave={() => { void saveSection('filtros'); }} />}
      </CompactPanel>

      <CompactPanel value="operacao">
      {app === 'zeus' && <SettingsSection title="Linguagem da oficina" description="Defina como sua equipe chama o item atendido no Zeus.">
        <div className="op-fields"><label className="op-field"><span>Como você chama o item atendido?</span><input value={preferences.fieldLabels.asset || 'Veículo'} onChange={event => setFieldLabel('asset', event.target.value, 'linguagem')} placeholder="Ex.: Veículo, Equipamento, Máquina, Moto" /></label></div>
        {sectionSave('linguagem')}
      </SettingsSection>}
      <SettingsSection title="Etapas, recursos e ações do processo" description="Escolha o que faz parte do fluxo real da operação e o que fica fora dele.">
        <div className="op-config-groups op-flow-groups">{actionGroups.map(group => {
          const groupActions = definition.actions.filter(action => action.group === group);
          const activeCount = groupActions.filter(action => action.required || preferences.actionVisibility[action.key] !== false).length;
          return <details className="op-config-group op-flow-group" key={group}>
            <summary><span><strong>{group}</strong><small>Toque para consultar</small></span><Badge>{activeCount}/{groupActions.length} ativos</Badge></summary>
            <div className="op-flow-group-body">{groupActions.map(action => {
              const visible = action.required || preferences.actionVisibility[action.key] !== false;
              const dependency = dependencyMessage(app, action.key);
              return <label className="op-module-choice" key={action.key}><input type="checkbox" checked={visible} disabled={action.required} onChange={event => setActionVisible(action.key, event.target.checked)} /><span><strong>{action.label}</strong><small>{action.description}</small>{dependency && <small>{dependency}</small>}<small className="op-flow-state">{action.required ? 'Etapa essencial do processo.' : visible ? 'Faz parte do fluxo atual.' : 'Fora do fluxo atual.'}</small></span><Badge>{action.required ? 'Essencial' : visible ? 'Ativo' : 'Oculto'}</Badge></label>;
            })}</div>
          </details>;
        })}</div>
        {sectionSave('fluxo')}
      </SettingsSection>

      {app === 'zeus' && <div ref={flowPreviewRef} className="op-flow-preview-anchor"><SettingsSection title="Prévia do fluxo da oficina" description="Veja a sequência atual das etapas e como a identificação aparecerá para a equipe."><div className="zeus-settings-preview"><span className="op-kicker">Prévia da identificação</span><div><strong>{preferences.fieldLabels.identifier || 'Placa'}</strong><span>{preferences.fieldLabels.asset || 'Veículo'}</span><small>{preferences.fieldLabels.meter || 'Quilometragem'}</small></div></div><div className="zeus-process compact">{stages({ ...draft, scheduleEnabled: preferences.actionVisibility['module:agendamentos'] !== false, diagnosisEnabled: preferences.actionVisibility.diagnosis !== false, budgetEnabled: preferences.actionVisibility.budget !== false }).map((value, index) => <span key={value}><b>{String(index + 1).padStart(2, '0')}</b>{value}</span>)}</div></SettingsSection></div>}

      {app === 'kronos' && <SettingsSection title="Etapas do pipeline" description="Organize a sequência real da venda e mantenha as etapas em uso disponíveis."><div className="op-custom-fields">{draft.salesStages.map((stage, index) => <div className="op-row" key={`${stage}-${index}`}><strong className="op-grow">{index + 1}. {stage}</strong><button type="button" className="op-icon" aria-label={`Mover ${stage} para cima`} disabled={index === 0} onClick={() => moveStage(index, -1)}><ArrowUp size={16} /></button><button type="button" className="op-icon" aria-label={`Mover ${stage} para baixo`} disabled={index === draft.salesStages.length - 1} onClick={() => moveStage(index, 1)}><ArrowDown size={16} /></button><button type="button" className="op-icon" aria-label={`Remover ${stage}`} disabled={draft.salesStages.length <= 2} onClick={() => { setDraft({ ...draft, salesStages: draft.salesStages.filter((_, current) => current !== index) }); markDirty('pipeline'); }}><Trash2 size={16} /></button></div>)}</div><div className="op-config-add"><label className="op-field"><span>Nova etapa</span><input value={newStage} onChange={event => setNewStage(event.target.value)} placeholder="Ex.: Demonstração, validação técnica…" /></label><Button variant="secondary" onClick={addStage}><Plus size={16} />Adicionar etapa</Button></div></SettingsSection>}

      {app === 'artemis' && <SettingsSection title="Delivery e atendimento online" description="Defina taxa, pedido mínimo, regiões atendidas e horários do delivery."><div className="op-fields"><label className="op-field"><span>Taxa de entrega padrão (R$)</span><input type="number" min="0" step="0.01" value={draft.deliveryFee / 100} onChange={event => { markDirty('delivery'); setDraft({ ...draft, deliveryFee: Math.round(Number(event.target.value) * 100) }); }} /></label><label className="op-field"><span>Pedido mínimo de delivery (R$)</span><input type="number" min="0" step="0.01" value={draft.minimumOrder / 100} onChange={event => { markDirty('delivery'); setDraft({ ...draft, minimumOrder: Math.round(Number(event.target.value) * 100) }); }} /></label>{field('deliveryAreas', 'Bairros / zonas atendidas', 'text', 'delivery')}{field('hours', 'Horários de atendimento', 'text', 'delivery')}</div></SettingsSection>}

      </CompactPanel>{app !== 'zeus' && <div className="op-form-footer op-settings-actions">{saved && <span role="status">Configurações salvas.</span>}<Button type="submit">Salvar configurações</Button></div>}
    </form>

    <CompactPanel value="acessos"><LocalAccountSettings /></CompactPanel>
    <CompactPanel value="backup">
      <SettingsSection title="Cópia dos seus dados" description={cloudCanonical ? 'Exporte uma cópia adicional dos dados sincronizados para seu próprio arquivo.' : 'Exporte uma cópia antes de trocar de dispositivo ou limpar os dados locais.'}><div className="op-actions"><Button variant="secondary" onClick={() => { const config = localStorage.getItem(`crmplus:${app}:configuration:v1`); download(`${app}-backup.json`, JSON.stringify({ app, exportedAt: new Date().toISOString(), data: w.data, configuration: config ? JSON.parse(config) : preferences }, null, 2)); }}><Download size={17} />Exportar dados</Button><label className="op-button secondary"><FileUp size={17} />Restaurar cópia<input hidden type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { const raw = JSON.parse(await file.text()); if (raw.app !== app) throw new Error('Esta cópia pertence a outro aplicativo.'); decodeData(JSON.stringify(raw.data)); setImportData(JSON.stringify(raw)); } catch (error) { w.setError(clientMessage(error, 'Não foi possível ler esta cópia.')); } event.target.value = ''; }} /></label></div></SettingsSection>
    </CompactPanel>
    </CompactTabs>

    {restoreConfirm && <div className="op-restore-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !restoring) setRestoreConfirm(false); }}><section className="op-restore-confirm" role="dialog" aria-modal="true" aria-labelledby="restore-personalization-title"><div><span className="op-kicker">Restaurar padrão</span><h2 id="restore-personalization-title">Restaurar a personalização?</h2><p>Você tem certeza que gostaria de restaurar? Essa ação é irreversível.</p></div><div className="op-form-footer"><Button variant="secondary" disabled={restoring} onClick={() => setRestoreConfirm(false)}>Cancelar</Button><Button disabled={restoring} onClick={async () => { if (await restorePersonalization()) setRestoreConfirm(false); }}>{restoring ? 'Restaurando…' : 'Restaurar padrão'}</Button></div></section></div>}
    {importData && <Confirm title="Restaurar esta cópia?" label="Substituir dados deste aplicativo" onClose={() => setImportData(null)} onConfirm={async () => { const raw = JSON.parse(importData); const ok = await w.restore(JSON.stringify(raw.data)); if (ok && raw.configuration) saveOperationPreferences(app, raw.configuration); return ok; }}>Os registros e configurações atuais deste app serão substituídos pelos da cópia. Exporte os dados atuais antes de continuar, se precisar preservá-los.</Confirm>}

    <style jsx global>{`
      .op-config-help{margin-top:2px;padding:0;border:0;background:transparent}.op-config-help-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.op-config-help-head>span{display:flex;align-items:center;gap:6px;color:var(--op-ink);font-weight:750}.op-config-help>small{color:var(--op-muted);line-height:1.4}
      .op-ai-help-control{position:relative;display:flex;align-items:center;gap:8px}.op-ai-help-control>.op-button{min-height:32px;padding:0 10px;font-size:12px}.op-ai-help-suggestions{position:absolute;z-index:40;top:calc(100% + 8px);right:0;width:min(420px,80vw);display:grid;gap:6px;padding:10px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-paper);box-shadow:0 18px 45px rgba(15,23,42,.14)}.op-ai-help-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2px 4px}.op-ai-help-option{padding:10px 11px;border:1px solid var(--op-line);border-radius:9px;background:var(--op-paper);color:var(--op-ink);text-align:left;line-height:1.4;cursor:pointer}.op-ai-help-option:hover{border-color:var(--op-accent);background:var(--op-tint)}
      .op-flow-group{padding:0!important;overflow:hidden}.op-flow-group>summary{min-height:66px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;list-style:none}.op-flow-group>summary::-webkit-details-marker{display:none}.op-flow-group>summary>span{display:grid;gap:3px}.op-flow-group>summary>span small{color:var(--op-muted);font-size:12px}.op-flow-group[open]>summary{border-bottom:1px solid var(--op-line)}.op-flow-group-body{padding:4px 16px 16px}.op-flow-state{font-weight:700;color:var(--op-accent)!important}.op-flow-preview-anchor{scroll-margin-top:88px}
      .op-restore-backdrop{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:20px;background:rgba(7,13,24,.48);backdrop-filter:blur(3px)}.op-restore-confirm{width:min(470px,100%);display:grid;gap:20px;padding:22px;border:1px solid var(--op-line);border-radius:16px;background:var(--op-paper);box-shadow:0 24px 70px rgba(0,0,0,.22);color:var(--op-ink)}.op-restore-confirm h2,.op-restore-confirm p{margin:0}.op-restore-confirm>div:first-child{display:grid;gap:9px}.op-restore-confirm p{color:var(--op-muted);line-height:1.55}
      @media(max-width:720px){.op-flow-group>summary{align-items:flex-start}.op-restore-confirm{padding:18px}.op-ai-help-control{width:100%}.op-ai-help-control>.op-button{width:100%}.op-ai-help-suggestions{left:0;right:auto;width:min(360px,calc(100vw - 72px))}}
    `}</style>
  </>;
}
