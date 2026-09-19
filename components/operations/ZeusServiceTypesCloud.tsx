'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { readZeusServiceTypes, saveZeusServiceTypes, zeusServiceTypeSuggestions } from '@/lib/operations/serviceTypes';
import { setCustomValues } from '@/lib/operations/model';
import { ZEUS_SERVICE_TYPES_KEY } from '@/lib/operations/zeusChecklistKeys';
import { Badge, Button } from './ui';
import { SettingsSection } from './SettingsSection';

const DEFAULT_TYPES = ['Diagnóstico', 'Revisão', 'Reparo', 'Retorno / Garantia'];
const eventName = 'crmplus:zeus-service-types';

function parseCloud(raw: string | undefined) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean))) : [];
  } catch { return []; }
}

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function ZeusServiceTypesCloudBridge({ w }: { w: Workspace }) {
  const applying = useRef(false);
  const workspaceRef = useRef(w);
  workspaceRef.current = w;
  const cloud = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
  const cloudSignature = JSON.stringify(cloud);
  const accountId = w.accountId;

  useEffect(() => {
    const current = workspaceRef.current;
    if (!current.accountId || current.accountId === 'guest') return;
    const local = readZeusServiceTypes(current.accountId);
    const latestCloud = parseCloud(current.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
    if (latestCloud.length) {
      if (!same(local, latestCloud)) {
        applying.current = true;
        saveZeusServiceTypes(latestCloud, current.accountId);
        queueMicrotask(() => { applying.current = false; });
      }
      return;
    }
    const seed = local.length ? local : DEFAULT_TYPES;
    void current.mutate(data => setCustomValues(data, ZEUS_SERVICE_TYPES_KEY, { value: JSON.stringify(seed) }), 'Tipos de atendimento sincronizados.');
  }, [accountId, cloudSignature]);

  useEffect(() => {
    if (!accountId || accountId === 'guest') return;
    const syncLocal = () => {
      if (applying.current) return;
      const current = workspaceRef.current;
      const values = readZeusServiceTypes(current.accountId);
      const currentCloud = parseCloud(current.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
      if (same(values, currentCloud)) return;
      void current.mutate(data => setCustomValues(data, ZEUS_SERVICE_TYPES_KEY, { value: JSON.stringify(values) }), 'Tipos de atendimento atualizados para a equipe.');
    };
    window.addEventListener(eventName, syncLocal);
    return () => window.removeEventListener(eventName, syncLocal);
  }, [accountId]);

  return null;
}

export function ZeusServiceTypeSettings({ w }: { w: Workspace }) {
  const cloud = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
  const [types, setTypes] = useState<string[]>(cloud.length ? cloud : readZeusServiceTypes(w.accountId));
  const [newType, setNewType] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
    if (next.length) setTypes(next);
  }, [w.data.revision]);

  const persist = async (next: string[]) => {
    const normalized = Array.from(new Set(next.map(value => value.trim()).filter(Boolean)));
    if (!normalized.length) { w.setError('Mantenha ao menos um tipo de atendimento.'); return; }
    saveZeusServiceTypes(normalized, w.accountId);
    const ok = await w.mutate(data => setCustomValues(data, ZEUS_SERVICE_TYPES_KEY, { value: JSON.stringify(normalized) }), 'Tipos de atendimento salvos para toda a equipe.');
    if (ok) { setTypes(normalized); setSaved(true); }
  };

  const add = async (value = newType) => {
    const clean = value.trim();
    if (!clean) return;
    if (types.some(item => item.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))) { w.setError('Esse tipo de atendimento já existe.'); return; }
    await persist([...types, clean]);
    setNewType('');
  };

  return <SettingsSection title="Tipos de atendimento" description="Lista compartilhada entre OS e agendamentos para toda a equipe da oficina.">
    <div className="zeus-service-type-list">{types.map(type => <div className="op-row" key={type}><strong className="op-grow">{type}</strong><button type="button" className="op-icon" aria-label={`Remover ${type}`} onClick={() => { void persist(types.filter(item => item !== type)); }}><Trash2 size={16} /></button></div>)}</div>
    <div className="op-config-add"><label className="op-field"><span>Novo tipo</span><input value={newType} onChange={event => { setNewType(event.target.value); setSaved(false); }} list="zeus-service-type-suggestions" placeholder="Ex.: Alinhamento, inspeção, revisão" /><datalist id="zeus-service-type-suggestions">{zeusServiceTypeSuggestions.map(item => <option key={item} value={item} />)}</datalist></label><Button variant="secondary" onClick={() => { void add(); }}><Plus size={16} />Adicionar</Button>{saved && <Badge>Salvo</Badge>}</div>
  </SettingsSection>;
}
