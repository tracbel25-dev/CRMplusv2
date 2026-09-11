'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Workspace } from '@/lib/operations/storage';
import { activeJob, matches, money } from '@/lib/operations/model';
import { formatLeadTime, jobLeadTime, readZeusPreferences } from '@/lib/operations/zeus';
import { Badge, Button, Empty, Section, Title } from './ui';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';

type BillingRecord = {
  id: string;
  job_id: string;
  job_number: number;
  customer_id: string;
  amount_cents: number;
  status: 'Pendente' | 'Pago' | 'Baixado' | 'Cancelado';
  created_at: string;
  paid_at: string | null;
};

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  return data.session.access_token;
}

export function ZeusDashboard({ w }: { w: Workspace }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('lead');
  const [descending, setDescending] = useState(true);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [billingBusy, setBillingBusy] = useState(true);
  const prefs = readZeusPreferences(w.data);
  const leads = w.data.jobs.map(job => jobLeadTime(job));

  const loadBilling = useCallback(async () => {
    if (!w.accountId || w.accountId === 'guest') { setBilling([]); setBillingBusy(false); return; }
    setBillingBusy(true);
    try {
      const response = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o faturamento.');
      setBilling(Array.isArray(payload.records) ? payload.records : []);
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o faturamento.');
    } finally { setBillingBusy(false); }
  }, [w]);

  useEffect(() => { void loadBilling(); }, [loadBilling, w.data.revision]);

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
  const stageStats = [...stageMap.entries()].map(([stage, values]) => ({ stage, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length })).sort((a, b) => b.average - a.average);
  const maxStage = Math.max(1, ...stageStats.map(item => item.average));
  const pendingBilling = billing.filter(item => item.status === 'Pendente');
  const paidBilling = billing.filter(item => item.status === 'Pago' || item.status === 'Baixado');
  const cancelledBilling = billing.filter(item => item.status === 'Cancelado');
  const pendingValue = pendingBilling.reduce((sum, item) => sum + item.amount_cents, 0);
  const paidValue = paidBilling.reduce((sum, item) => sum + item.amount_cents, 0);

  return <>
    <Title eyebrow="Visão gerencial" title="Dashboard">Operação e faturamento aparecem separados para você analisar a oficina sem misturar andamento da OS com recebimento.</Title>

    <Section title="Relatório de OS">
      <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={active} onActive={setActive} sort={sort} sortOptions={[{ value: 'lead', label: 'Lead time' }, { value: 'createdAt', label: 'Data de abertura' }, { value: 'number', label: 'Número da OS' }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder="Buscar OS, cliente, veículo ou técnico" />
      <section className="zeus-lead-summary">
        <div><span>Lead time médio concluído</span><strong>{completed.length ? formatLeadTime(average) : 'Sem base concluída'}</strong><small>{completed.length} OS encerrada(s) no filtro</small></div>
        <div><span>Em processo agora</span><strong>{open.length}</strong><small>OS ainda abertas</small></div>
        <div><span>Maior lead time</span><strong>{filtered.length ? formatLeadTime(Math.max(...filtered.map(item => item.totalMs))) : 'Sem dados'}</strong><small>considerando o filtro atual</small></div>
      </section>
      <div className="zeus-dashboard-grid">
        <div><h3>Tempo por etapa</h3>{stageStats.length ? <div className="zeus-stage-time-list">{stageStats.map(item => <div key={item.stage}><div><strong>{item.stage}</strong><span>{formatLeadTime(item.average)} · {item.count} passagem(ns)</span></div><i><b style={{ width: `${Math.max(4, (item.average / maxStage) * 100)}%` }} /></i></div>)}</div> : <Empty>Ainda não há movimentações suficientes para calcular tempo por etapa.</Empty>}</div>
        <div><h3>OS por maior lead time</h3>{filtered.length ? <div className="zeus-lead-list">{filtered.slice(0, 12).map(item => {
          const customer = w.data.customers.find(current => current.id === item.job.customerId)?.name || 'Cliente';
          const asset = w.data.assets.find(current => current.id === item.job.assetId);
          return <button key={item.job.id} onClick={() => router.push(`/zeus/atendimentos/${item.job.id}`)}><span><strong>OS {String(item.job.number).padStart(4, '0')} · {asset?.identifier || ''}</strong><small>{customer} · {item.job.stage}</small></span><span><b>{formatLeadTime(item.totalMs)}</b><Badge>{item.job.status}</Badge></span><ArrowRight size={17} /></button>;
        })}</div> : <Empty>Nenhuma OS corresponde aos filtros.</Empty>}</div>
      </div>
    </Section>

    <Section title="Relatório de faturamento" action={<div className="op-actions"><Button variant="secondary" disabled={billingBusy} onClick={() => { void loadBilling(); }}><RefreshCw size={16} />Atualizar</Button><Button variant="secondary" onClick={() => router.push('/zeus/faturamento')}>Abrir faturamento <ArrowRight size={16} /></Button></div>}>
      {billingBusy ? <p className="op-muted">Carregando valores…</p> : <>
        <div className="zeus-billing-summary">
          <div><span>Pendente de recebimento</span><strong>{money(pendingValue)}</strong><small>{pendingBilling.length} OS pendente(s)</small></div>
          <div><span>Recebido / baixado</span><strong>{money(paidValue)}</strong><small>{paidBilling.length} OS · {cancelledBilling.length} cancelada(s)</small></div>
        </div>
        {billing.length ? <div className="zeus-billing-list">{billing.slice(0, 8).map(row => {
          const customer = w.data.customers.find(item => item.id === row.customer_id)?.name || 'Cliente';
          return <button type="button" className="zeus-billing-row" key={row.id} onClick={() => router.push('/zeus/faturamento')}><div><span>OS {String(row.job_number).padStart(4, '0')}</span><strong>{customer}</strong><small>{new Date(row.created_at).toLocaleString('pt-BR')}</small></div><div><span>Valor</span><strong>{money(row.amount_cents)}</strong></div><Badge tone={row.status === 'Pendente' ? 'warning' : ''}>{row.status}</Badge><ArrowRight size={17} /></button>;
        })}</div> : <Empty>As OS encerradas com valor aparecerão aqui separadas da operação.</Empty>}
      </>}
    </Section>
  </>;
}
