'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { clientMessage } from '@/lib/clientMessage';
import type { Workspace } from '@/lib/operations/storage';
import { normalize } from '@/lib/operations/model';
import { ZEUS_CHECKLIST_SEGMENTS, ZEUS_CHECKLIST_TEMPLATES, type ZeusChecklistSegment } from '@/lib/operations/checklistTemplates';
import type { ZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import {
  ZEUS_CHECKLIST_CATEGORIES,
  ZEUS_CHECKLIST_FOLDER_LABELS,
  readZeusChecklistConfig,
  writeZeusChecklistConfig,
  zeusChecklistCategoryForFolder,
  zeusChecklistState,
  type ZeusChecklistCategoryId,
  type ZeusChecklistConfig,
} from '@/lib/operations/zeusChecklist';
import { listZeusChecklists, syncZeusChecklistResponse, type ChecklistResponseRow } from '@/lib/operations/zeusChecklistClient';
import { Badge, Button, Empty, Section, Title } from './ui';

export function ZeusCheckIn({ w }: { w: Workspace }) {
  const access = useStoreAccess();
  const canConfigure = access.hasPermission('zeus', 'settings_operation');
  const [tab, setTab] = useState<'checklists' | 'config'>('checklists');
  const [responses, setResponses] = useState<ChecklistResponseRow[]>([]);
  const [configSegment, setConfigSegment] = useState<ZeusChecklistSegment>('auto');
  const [newItem, setNewItem] = useState('');
  const config = readZeusChecklistConfig(w.data);
  const [category, setCategory] = useState<ZeusChecklistCategoryId>(() => zeusChecklistCategoryForFolder(config.defaultAssetFolder));

  const load = async () => {
    if (!w.accountId || w.accountId === 'guest') return;
    try {
      const result = await listZeusChecklists();
      setResponses(result.responses);
      for (const row of result.responses) {
        if (w.data.customFieldValues?.[row.job_id]?.__zeus_checklist_completed__ !== 'true') await syncZeusChecklistResponse(w, row.job_id, row);
      }
    } catch (reason) {
      w.setError(clientMessage(reason, 'Não foi possível atualizar os checklists.'));
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [w.accountId]);

  const responseJobs = useMemo(() => new Set(responses.map(row => row.job_id)), [responses]);
  const pendingJobs = useMemo(() => w.data.jobs.filter(job => {
    if (['Encerrado','Cancelado','Reprovado'].includes(job.status)) return false;
    const state = zeusChecklistState(w.data, job.id);
    return state.enabled && !state.completed && !responseJobs.has(job.id);
  }), [w.data, responseJobs]);

  const saveConfig = async (next: ZeusChecklistConfig, message = 'Configuração do checklist salva.') => {
    if (!canConfigure) { w.setError('Seu perfil não possui permissão para alterar o fluxo do checklist.'); return; }
    await w.mutate(data => writeZeusChecklistConfig(data, next), message);
  };

  const currentItems = config.itemsBySegment[configSegment];
  const setCurrentItems = async (items: string[], message = 'Itens do checklist atualizados.') => {
    await saveConfig({ ...config, itemsBySegment: { ...config.itemsBySegment, [configSegment]: items } }, message);
  };
  const addItem = async () => {
    const value = newItem.trim();
    if (!value) return;
    if (currentItems.some(item => normalize(item) === normalize(value))) { w.setError('Esse item já existe neste modelo.'); return; }
    await setCurrentItems([...currentItems, value]);
    setNewItem('');
  };
  const removeItem = async (index: number) => {
    if (currentItems.length <= 1) { w.setError('O checklist precisa ter ao menos um item.'); return; }
    await setCurrentItems(currentItems.filter((_, current) => current !== index));
  };
  const renameItem = async (index: number, raw: string) => {
    const value = raw.trim();
    const original = currentItems[index];
    if (!value || value === original) return;
    if (currentItems.some((item, current) => current !== index && normalize(item) === normalize(value))) {
      w.setError('Esse item já existe neste modelo.');
      return;
    }
    const next = [...currentItems];
    next[index] = value;
    await setCurrentItems(next, 'Item do checklist atualizado.');
  };

  const activeCategory = ZEUS_CHECKLIST_CATEGORIES.find(item => item.id === category) || ZEUS_CHECKLIST_CATEGORIES[0];

  return <>
    <Title eyebrow="Recepção" title="Checklist de entrada">A central mostra somente as inspeções ainda pendentes. Checklist concluído passa a fazer parte da própria OS.</Title>
    <div className="op-compact-tabs zeus-checkin-tabs" style={{ marginBottom: 18 }}><button aria-current={tab === 'checklists' ? 'page' : undefined} onClick={() => setTab('checklists')}>Pendentes</button>{canConfigure && <button aria-current={tab === 'config' ? 'page' : undefined} onClick={() => setTab('config')}>Configuração</button>}</div>

    {tab === 'checklists' && <Section title="Inspeções pendentes">
      <p className="op-muted">A execução do checklist acontece dentro da etapa Identificação da OS. Esta lista serve apenas para enxergar o que ainda precisa ser concluído.</p>
      {pendingJobs.length ? <div className="zeus-checkin-list">{pendingJobs.map(job => {
        const customer = w.data.customers.find(item => item.id === job.customerId);
        const asset = w.data.assets.find(item => item.id === job.assetId);
        const state = zeusChecklistState(w.data, job.id);
        return <div className="zeus-checkin-row" key={job.id}><div className="zeus-checkin-identity"><small>OS {String(job.number).padStart(4, '0')}</small><strong>{asset?.identifier || 'Sem identificação'}</strong><span>{customer?.name || 'Cliente'} · {asset?.model || ''}</span></div><div className="zeus-checkin-status"><Badge tone="warning">Pendente</Badge><small>{state.folder ? ZEUS_CHECKLIST_FOLDER_LABELS[state.folder] : 'Modelo não definido'}</small></div><a className="op-button secondary" href={`/zeus/atendimentos/${job.id}`}>Abrir OS</a></div>;
      })}</div> : !config.enabled ? <Empty>O checklist de entrada está desativado para novas OS e não há inspeções antigas pendentes.</Empty> : <Empty icon={<CheckCircle2 size={28} />}>Nenhum checklist pendente.</Empty>}
    </Section>}

    {tab === 'config' && canConfigure && <>
      <Section title="Comportamento do checklist">
        <div className="op-module-choice"><input type="checkbox" checked={config.enabled} onChange={event => { void saveConfig({ ...config, enabled: event.target.checked }); }} /><span><strong>Usar checklist de entrada</strong><small>Quando ativo, o modelo padrão é sugerido nas novas OS. Uma OS que já iniciou checklist preserva sua escolha.</small></span><Badge>{config.enabled ? 'Ativo' : 'Desativado'}</Badge></div>
        <div className="op-module-choice"><input type="checkbox" checked={config.requireSignature} disabled={!config.enabled} onChange={event => { void saveConfig({ ...config, requireSignature: event.target.checked }); }} /><span><strong>Exigir assinatura</strong><small>Impede a conclusão do checklist sem assinatura do cliente/responsável.</small></span><Badge>{config.requireSignature ? 'Obrigatória' : 'Opcional'}</Badge></div>
        <div className="zeus-checklist-config-picker">
          <strong>Modelo sugerido por padrão</strong>
          <div className="zeus-checklist-categories">{ZEUS_CHECKLIST_CATEGORIES.map(item => <button type="button" key={item.id} disabled={!config.enabled} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
          <div className="zeus-checklist-model-grid">{activeCategory.folders.map(folder => <button type="button" key={folder} disabled={!config.enabled} className={config.defaultAssetFolder === folder ? 'active' : ''} onClick={() => { void saveConfig({ ...config, defaultAssetFolder: folder as ZeusChecklistAssetFolder }, 'Modelo padrão do checklist atualizado.'); }}><strong>{ZEUS_CHECKLIST_FOLDER_LABELS[folder]}</strong>{config.defaultAssetFolder === folder && <em>Padrão</em>}</button>)}</div>
        </div>
      </Section>

      <Section title="Itens por segmento">
        <div className="zeus-template-tabs">{ZEUS_CHECKLIST_SEGMENTS.map(item => <button type="button" className={configSegment === item.id ? 'active' : ''} onClick={() => setConfigSegment(item.id)} key={item.id}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
        <div className="zeus-template-head"><div><strong>{ZEUS_CHECKLIST_TEMPLATES[configSegment].label}</strong><p className="op-muted">Edite os itens deste segmento sem alterar os demais.</p></div><Button variant="secondary" onClick={() => { void setCurrentItems([...ZEUS_CHECKLIST_TEMPLATES[configSegment].items], 'Modelo padrão restaurado.'); }}><RotateCcw size={16} />Restaurar padrão</Button></div>
        <div className="zeus-checkin-config-list">{currentItems.map((item, index) => <div key={`${configSegment}-${index}-${item}`}><span>{String(index + 1).padStart(2, '0')}</span><input defaultValue={item} onBlur={event => { void renameItem(index, event.currentTarget.value); }} /><button className="op-icon" type="button" aria-label={`Remover ${item}`} onClick={() => { void removeItem(index); }}><Trash2 size={16} /></button></div>)}</div>
        <div className="op-config-add"><label className="op-field"><span>Novo item para {ZEUS_CHECKLIST_TEMPLATES[configSegment].shortLabel.toLowerCase()}</span><input value={newItem} onChange={event => setNewItem(event.target.value)} placeholder="Adicionar item de inspeção" /></label><Button variant="secondary" onClick={() => { void addItem(); }}><Plus size={16} />Adicionar</Button></div>
      </Section>
    </>}
  </>;
}
