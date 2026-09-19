'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { clientMessage } from '@/lib/clientMessage';
import type { Workspace } from '@/lib/operations/storage';
import { activeJob, effectiveQuoteStatus, matches, money } from '@/lib/operations/model';
import { formatLeadTime, jobLeadTime } from '@/lib/operations/zeus';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { zeusViewHasFeature } from '@/lib/operations/zeusPlans';
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

const DASHBOARD_FILTER_KEYS = ['Número da OS', 'Status', 'Etapa', 'Tipo', 'Responsável', 'Cliente', 'Veículo', 'Orçamento', 'Prazo'];

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  return data.session.access_token;
}

function deadlineBucket(due: string) {
  if (!due) return 'Sem prazo';
  const dueAt = new Date(due);
  if (Number.isNaN(dueAt.getTime())) return 'Sem prazo';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDue = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()).getTime();
  if (startDue < startToday) return 'Atrasado';
  if (startDue === startToday) return 'Vence hoje';
  return 'No prazo';
}

function billingBucket(jobId: string, billing: BillingRecord[]) {
  const record = billing.find(item => item.job_id === jobId);
  if (!record) return 'Sem cobrança';
  if (record.status === 'Pendente') return 'Pendente';
  if (record.status === 'Cancelado') return 'Cancelada';
  return 'Recebido / baixado';
}

function budgetBucket(job: Workspace['data']['jobs'][number]) {
  const hasBudget = job.quote.lines.length > 0 || job.stage === 'Orçamento' || job.quote.status !== 'Rascunho';
  return hasBudget ? effectiveQuoteStatus(job.quote) : 'Sem orçamento';
}

export function ZeusDashboard({ w }: { w: Workspace }) {
  const router = useRouter();
  const access = useStoreAccess();
  const operation = useOperationPreferences('zeus');
  const canViewJobs = access.hasPermission('zeus', 'jobs_view');
  const canViewBilling = access.hasPermission('zeus', 'billing_view');
  const workspaceRef = useRef(w);
  workspaceRef.current = w;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('lead');
  const [descending, setDescending] = useState(true);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [billingBusy, setBillingBusy] = useState(canViewBilling);
  const leads = w.data.jobs.map(job => jobLeadTime(job));

  const loadBilling = useCallback(async () => {
    const current = workspaceRef.current;
    if (!canViewBilling || !current.accountId || current.accountId === 'guest') { setBilling([]); setBillingBusy(false); return; }
    setBillingBusy(true);
    try {
      const response = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o faturamento.');
      setBilling(Array.isArray(payload.records) ? payload.records : []);
    } catch (reason) {
      current.setError(clientMessage(reason, 'Não foi possível carregar o faturamento.'));
    } finally { setBillingBusy(false); }
  }, [canViewBilling]);

  useEffect(() => {
    void loadBilling();
    const onFocus = () => { void loadBilling(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadBilling, w.data.revision]);

  const definitions = useMemo<FilterDefinition[]>(() => {
    const customerNames = w.data.jobs.map(job => w.data.customers.find(customer => customer.id === job.customerId)?.name || 'Cliente não identificado');
    const assetNames = w.data.jobs.map(job => {
      const asset = w.data.assets.find(current => current.id === job.assetId);
      return asset ? [asset.identifier, asset.model].filter(Boolean).join(' · ') || 'Sem identificação' : 'Sem identificação';
    });
    const values: Record<string, string[]> = {
      'Número da OS': Array.from(new Set(w.data.jobs.map(job => String(job.number).padStart(4, '0')))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      Status: Array.from(new Set(w.data.jobs.map(job => job.status))).sort(),
      Etapa: Array.from(new Set(w.data.jobs.map(job => job.stage))).sort(),
      Tipo: Array.from(new Set(w.data.jobs.map(job => job.type))).sort(),
      Responsável: Array.from(new Set(w.data.jobs.map(job => job.technician || 'Sem responsável'))).sort(),
      Cliente: Array.from(new Set(customerNames)).sort(),
      Veículo: Array.from(new Set(assetNames)).sort(),
      Orçamento: Array.from(new Set(w.data.jobs.map(budgetBucket))).sort(),
      Prazo: ['Atrasado', 'Vence hoje', 'No prazo', 'Sem prazo'],
      Cobrança: ['Pendente', 'Recebido / baixado', 'Sem cobrança', 'Cancelada']
    };
    const keys = (canViewBilling ? [...DASHBOARD_FILTER_KEYS, 'Cobrança'] : DASHBOARD_FILTER_KEYS).filter(key => {
      if (key === 'Cliente') return operation.fieldVisible('customer');
      if (key === 'Veículo') return operation.fieldVisible('asset');
      if (key === 'Tipo') return operation.fieldVisible('type');
      if (key === 'Responsável') return operation.fieldVisible('technician');
      if (key === 'Prazo') return operation.fieldVisible('due');
      if (key === 'Orçamento') return zeusViewHasFeature(w.data.settings, 'budgets');
      return true;
    });
    const labels:Record<string,string>={
      Cliente:operation.label('customer','Cliente'),
      Veículo:w.data.settings.assetLabel,
      Tipo:operation.label('type','Tipo'),
      Responsável:operation.label('technician','Responsável'),
      Prazo:operation.label('due','Prazo previsto')
    };
    return keys.map(key => ({ key, label: labels[key] || key, options: values[key] || [] })).filter(item => item.key !== 'Cobrança' || !billingBusy);
  }, [w.data.jobs, w.data.customers, w.data.assets, w.data.settings.assetLabel, w.data.settings.planCode, w.data.settings.planFeatures, canViewBilling, billingBusy, operation]);

  const filtered = leads.filter(item => {
    const job = item.job;
    const customer = w.data.customers.find(current => current.id === job.customerId)?.name || 'Cliente não identificado';
    const asset = w.data.assets.find(current => current.id === job.assetId);
    const assetLabel = asset ? [asset.identifier, asset.model].filter(Boolean).join(' · ') || 'Sem identificação' : 'Sem identificação';
    if (!matches(query, job.number, customer, asset?.identifier, asset?.model, job.type, operation.fieldVisible('technician') ? job.technician : '', job.stage, job.status)) return false;
    const checks: Record<string, string> = {
      'Número da OS': String(job.number).padStart(4, '0'),
      Status: job.status,
      Etapa: job.stage,
      Tipo: job.type,
      Responsável: job.technician || 'Sem responsável',
      Cliente: customer,
      Veículo: assetLabel,
      Orçamento: budgetBucket(job),
      Prazo: deadlineBucket(job.due),
      Cobrança: billingBucket(job.id, billing)
    };
    return Object.entries(active).every(([key, values]) => !values.length || values.includes(checks[key]));
  }).sort((a, b) => {
    const value = (item: typeof a) => sort === 'number' ? item.job.number : sort === 'createdAt' ? item.job.createdAt : sort === 'due' ? item.job.due || '9999-12-31' : item.totalMs;
    const av = value(a); const bv = value(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return descending ? -result : result;
  });

  const completed = filtered.filter(item => item.finished && item.job.status === 'Encerrado');
  const average = completed.length ? completed.reduce((sum, item) => sum + item.totalMs, 0) / completed.length : 0;
  const open = filtered.filter(item => activeJob(item.job));
  const overdue = open.filter(item => deadlineBucket(item.job.due) === 'Atrasado');
  const dueToday = open.filter(item => deadlineBucket(item.job.due) === 'Vence hoje');
  const stageMap = new Map<string, number[]>();
  for (const item of filtered) for (const segment of item.segments) {
    const list = stageMap.get(segment.stage) || [];
    list.push(segment.durationMs);
    stageMap.set(segment.stage, list);
  }
  const stageStats = [...stageMap.entries()].map(([stage, values]) => ({ stage, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length })).sort((a, b) => b.average - a.average);
  const maxStage = Math.max(1, ...stageStats.map(item => item.average));
  const statusStats = Array.from(new Map(filtered.map(item => [item.job.status, 0])).keys()).map(status => ({ status, count: filtered.filter(item => item.job.status === status).length })).sort((a, b) => b.count - a.count);
  const maxStatus = Math.max(1, ...statusStats.map(item => item.count));
  const pendingBilling = billing.filter(item => item.status === 'Pendente');
  const paidBilling = billing.filter(item => item.status === 'Pago' || item.status === 'Baixado');
  const cancelledBilling = billing.filter(item => item.status === 'Cancelado');
  const pendingValue = pendingBilling.reduce((sum, item) => sum + item.amount_cents, 0);
  const paidValue = paidBilling.reduce((sum, item) => sum + item.amount_cents, 0);

  return <>
    <Title eyebrow="Visão gerencial" title="Dashboard">Acompanhe a operação da oficina{canViewBilling ? ' e, quando seu perfil permite, o faturamento' : ''} sem misturar andamento da OS com recebimento.</Title>

    <Section title="Visão das OS">
      <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={active} onActive={setActive} sort={sort} sortOptions={[{ value: 'lead', label: 'Lead time' }, { value: 'createdAt', label: 'Data de abertura' }, { value: 'due', label: 'Prazo previsto' }, { value: 'number', label: 'Número da OS' }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder={operation.fieldVisible('technician') ? `Buscar OS, cliente, ${w.data.settings.assetLabel.toLowerCase()} ou ${operation.label('technician','responsável').toLowerCase()}` : `Buscar OS, cliente ou ${w.data.settings.assetLabel.toLowerCase()}`} />

      <section className="zeus-dashboard-kpis">
        <div><span>OS no filtro</span><strong>{filtered.length}</strong><small>{open.length} aberta(s) · {completed.length} encerrada(s)</small></div>
        <div><span>Lead time médio concluído</span><strong>{completed.length ? formatLeadTime(average) : 'Sem base'}</strong><small>somente OS encerradas</small></div>
        <div><span>Prazo vencido</span><strong>{overdue.length}</strong><small>{dueToday.length} vence(m) hoje</small></div>
        <div><span>Maior lead time</span><strong>{filtered.length ? formatLeadTime(Math.max(...filtered.map(item => item.totalMs))) : 'Sem dados'}</strong><small>considerando o filtro atual</small></div>
      </section>

      <div className="zeus-dashboard-grid zeus-dashboard-grid-top">
        <div><h3>Tempo por etapa</h3>{stageStats.length ? <div className="zeus-stage-time-list">{stageStats.map(item => <div key={item.stage}><div><strong>{item.stage}</strong><span>{formatLeadTime(item.average)} · {item.count} passagem(ns)</span></div><i><b style={{ width: `${Math.max(4, (item.average / maxStage) * 100)}%` }} /></i></div>)}</div> : <Empty>Ainda não há movimentações suficientes para calcular tempo por etapa.</Empty>}</div>
        <div><h3>OS por maior lead time</h3>{filtered.length ? <div className="zeus-lead-list">{filtered.slice(0, 12).map(item => {
          const customer = w.data.customers.find(current => current.id === item.job.customerId)?.name || 'Cliente';
          const asset = w.data.assets.find(current => current.id === item.job.assetId);
          return <button key={item.job.id} disabled={!canViewJobs} onClick={canViewJobs ? () => router.push(`/zeus/atendimentos/${item.job.id}`) : undefined}><span><strong>OS {String(item.job.number).padStart(4, '0')} · {asset?.identifier || ''}</strong><small>{customer} · {item.job.stage}</small></span><span><b>{formatLeadTime(item.totalMs)}</b><Badge>{item.job.status}</Badge></span>{canViewJobs && <ArrowRight size={17} />}</button>;
        })}</div> : <Empty>Nenhuma OS corresponde aos filtros.</Empty>}</div>
      </div>

      <div className="zeus-dashboard-grid zeus-dashboard-secondary">
        <div>
          <h3>Distribuição por status</h3>
          {statusStats.length ? <div className="zeus-status-list">{statusStats.map(item => <div key={item.status}><div><strong>{item.status}</strong><span>{item.count} OS</span></div><i><b style={{ width: `${Math.max(5, (item.count / maxStatus) * 100)}%` }} /></i></div>)}</div> : <Empty>Sem dados para exibir.</Empty>}
        </div>
        <div>
          <h3>Atenção necessária</h3>
          {overdue.length || dueToday.length ? <div className="zeus-attention-list">
            {[...overdue, ...dueToday].slice(0, 8).map(item => {
              const customer = w.data.customers.find(current => current.id === item.job.customerId)?.name || 'Cliente';
              return <button key={item.job.id} disabled={!canViewJobs} onClick={canViewJobs ? () => router.push(`/zeus/atendimentos/${item.job.id}`) : undefined}><span><strong>OS {String(item.job.number).padStart(4, '0')}</strong><small>{customer} · {deadlineBucket(item.job.due)}</small></span><Badge tone={deadlineBucket(item.job.due) === 'Atrasado' ? 'warning' : ''}>{item.job.stage}</Badge>{canViewJobs && <ArrowRight size={16} />}</button>;
            })}
          </div> : <Empty>Nenhuma OS aberta com prazo vencido ou vencendo hoje.</Empty>}
        </div>
      </div>
    </Section>

    {canViewBilling && <Section title="Faturamento" action={<Button variant="secondary" onClick={() => router.push('/zeus/faturamento')}>Abrir faturamento <ArrowRight size={16} /></Button>}>
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
    </Section>}
  </>;
}