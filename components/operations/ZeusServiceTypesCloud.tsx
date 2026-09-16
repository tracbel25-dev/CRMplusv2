'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { readZeusServiceTypes, saveZeusServiceTypes, zeusServiceTypeSuggestions } from '@/lib/operations/serviceTypes';
import { setCustomValues } from '@/lib/operations/model';
import { ZEUS_SERVICE_TYPES_KEY } from '@/lib/operations/zeusChecklistKeys';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Button, Section } from './ui';

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
  const access = useStoreAccess();
  const applying = useRef(false);
  const cloud = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
  const canWriteConfiguration = access.ready && access.canConfigureApp('zeus');

  useEffect(() => {
    if (!w.accountId || w.accountId === 'guest') return;
    const local = readZeusServiceTypes();
    if (cloud.length) {
      if (!same(local, cloud)) {
        applying.current = true;
        saveZeusServiceTypes(cloud);
        queueMicrotask(() => { applying.current = false; });
      }
      return;
    }
    if (!canWriteConfiguration) return;
    const seed = local.length ? local : DEFAULT_TYPES;
    void w.mutate(data => setCustomValues(data, ZEUS_SERVICE_TYPES_KEY, { value: JSON.stringify(seed) }), 'Tipos de atendimento sincronizados.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.accountId, w.data.revision, canWriteConfiguration]);

  useEffect(() => {
    if (!w.accountId || w.accountId === 'guest' || !canWriteConfiguration) return;
    const syncLocal = () => {
      if (applying.current) return;
      const values = readZeusServiceTypes();
      const current = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
      if (same(values, current)) return;
      void w.mutate(data => setCustomValues(data, ZEUS_SERVICE_TYPES_KEY, { value: JSON.stringify(values) }), 'Tipos de atendimento atualizados para a equipe.');
    };
    window.addEventListener(eventName, syncLocal);
    return () => window.removeEventListener(eventName, syncLocal);
  }, [w, canWriteConfiguration]);

  return null;
}

export function ZeusServiceTypeSettings({ w }: { w: Workspace }) {
  const cloud = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
  const [types, setTypes] = useState<string[]>(cloud.length ? cloud : readZeusServiceTypes());
  const [newType, setNewType] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const next = parseCloud(w.data.customFieldValues?.[ZEUS_SERVICE_TYPES_KEY]?.value);
    if (next.length) setTypes(next);
  }, [w.data.revision]);

  const persist = async (next: string[]) => {
    const normalized = Array.from(new Set(next.map(value => value.trim()).filter(Boolean)));
    if (!normalized.length) { w.setError('Mantenha ao menos um tipo de atendimento.'); return; }
    saveZeusServiceTypes(normalized);
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

  return <Section title="Tipos de atendimento">
    <p className="op-muted">A lista agora é compartilhada no Zeus. Todos os usuários da oficina recebem os mesmos tipos em OS e agendamentos.</p>
    <div className="zeus-service-type-list">{types.map(type => <div className="op-row" key={type}><strong className="op-grow">{type}</strong><button type="button" className="op-icon" aria-label={`Remover ${type}`} onClick={() => { void persist(types.filter(item => item !== type)); }}><Trash2 size={16} /></button></div>)}</div>
    <div className="op-config-add"><label className="op-field"><span>Novo tipo</span><input value={newType} onChange={event => { setNewType(event.target.value); setSaved(false); }} list="zeus-service-type-suggestions" placeholder="Ex.: Alinhamento, inspeção, revisão" /><datalist id="zeus-service-type-suggestions">{zeusServiceTypeSuggestions.map(item => <option key={item} value={item} />)}</datalist></label><Button variant="secondary" onClick={() => { void add(); }}><Plus size={16} />Adicionar</Button>{saved && <Badge>Salvo</Badge>}</div>
  </Section>;
}
