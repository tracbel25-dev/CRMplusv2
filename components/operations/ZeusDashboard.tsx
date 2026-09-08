'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { activeJob, matches } from '@/lib/operations/model';
import { formatLeadTime, jobLeadTime, readZeusPreferences } from '@/lib/operations/zeus';
import { Badge, Empty, Section, Title } from './ui';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';

export function ZeusDashboard({ w }: { w: Workspace }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('lead');
  const [descending, setDescending] = useState(true);
  const prefs = readZeusPreferences(w.data);
  const leads = w.data.jobs.map(job => jobLeadTime(job));

  const definitions = useMemo<FilterDefinition[]>(() => {
    const values = {
      Status: Array.from(new Set(w.data.jobs.map(job => job.status))).sort(),
      Etapa: Array.from(new Set(w.data.jobs.map(job => job.stage))).sort(),
      Tipo: Array.from(new Set(w.data.jobs.map(job => job.type))).sort(),
      Responsável: Array.from(new Set(w.data.jobs.map(job => job.technician || 'Sem responsável'))).sort()
    };
    return prefs.dashboardFilters.map(label => ({ key: label, label, options: values[label as keyof typeof values] || [] })).filter(item => item.options.length);
  }, [prefs.dashboardFilters, w.data.jobs]);

  const filtered = leads.filter(item => {
    const job = item.job;
    const customer = w.data.customers.find(current => current.id === job.customerId)?.name || '';
    const asset = w.data.assets.find(current => current.id === job.assetId);
    if (!matches(query, job.number, customer, asset?.identifier, asset?.model, job.type, job.technician)) return false;
    const checks: Record<string, string> = { Status: job.status, Etapa: job.stage, Tipo: job.type, Responsável: job.technician || 'Sem responsável' };
    return Object.entries(active).every(([key, values]) => !values.length || values.includes(checks[key]));
  }).sort((a, b) => {
    const value = (item: typeof a) => sort === 'number' ? item.job.number : sort === 'createdAt' ? item.job.createdAt : item.totalMs;
    const av = value(a); const bv = value(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return descending ? -result : result;
  });

  const completed = filtered.filter(item => item.finished && item.job.status === 'Encerrado');
  const average = completed.length ? completed.reduce((sum, item) => sum + item.totalMs, 0) / completed.length : 0;
  const open = filtered.filter(item => activeJob(item.job));
  const stageMap = new Map<string, number[]>();
  for (const item of filtered) for (const segment of item.segments) {
    const list = stageMap.get(segment.stage) || [];
    list.push(segment.durationMs);
    stageMap.set(segment.stage, list);
  }
  const stages = [...stageMap.entries()].map(([stage, values]) => ({ stage, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length })).sort((a, b) => b.average - a.average);
  const maxStage = Math.max(1, ...stages.map(item => item.average));

  return <>
    <Title eyebrow="Tempo real do processo" title="Dashboard">Lead time fica aqui, fora da OS. A tela compara o fluxo completo da oficina sem transformar cada atendimento em um painel analítico.</Title>
    <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={active} onActive={setActive} sort={sort} sortOptions={[{ value: 'lead', label: 'Lead time' }, { value: 'createdAt', label: 'Data de abertura' }, { value: 'number', label: 'Número da OS' }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder="Buscar OS, cliente, veículo ou técnico" />

    <section className="zeus-lead-summary">
      <div><span>Lead time médio concluído</span><strong>{completed.length ? formatLeadTime(average) : 'Sem base concluída'}</strong><small>{completed.length} OS encerrada(s) no filtro</small></div>
      <div><span>Em processo agora</span><strong>{open.length}</strong><small>OS ainda abertas</small></div>
      <div><span>Maior lead time</span><strong>{filtered.length ? formatLeadTime(Math.max(...filtered.map(item => item.totalMs))) : 'Sem dados'}</strong><small>considerando o filtro atual</small></div>
    </section>

    <div className="zeus-dashboard-grid">
      <Section title="Onde o processo consome mais tempo">
        {stages.length ? <div className="zeus-stage-time-list">{stages.map(item => <div key={item.stage}><div><strong>{item.stage}</strong><span>{formatLeadTime(item.average)} · {item.count} passagem(ns)</span></div><i><b style={{ width: `${Math.max(4, (item.average / maxStage) * 100)}%` }} /></i></div>)}</div> : <Empty>Ainda não há movimentações suficientes para calcular tempo por etapa.</Empty>}
      </Section>
      <Section title="OS por maior lead time">
        {filtered.length ? <div className="zeus-lead-list">{filtered.slice(0, 12).map(item => {
          const customer = w.data.customers.find(current => current.id === item.job.customerId)?.name || 'Cliente';
          const asset = w.data.assets.find(current => current.id === item.job.assetId);
          return <button key={item.job.id} onClick={() => router.push(`/zeus/atendimentos/${item.job.id}`)}><span><strong>OS {String(item.job.number).padStart(4, '0')} · {asset?.identifier || ''}</strong><small>{customer} · {item.job.stage}</small></span><span><b>{formatLeadTime(item.totalMs)}</b><Badge>{item.job.status}</Badge></span><ArrowRight size={17} /></button>;
        })}</div> : <Empty>Nenhuma OS corresponde aos filtros.</Empty>}
      </Section>
    </div>
  </>;
}
