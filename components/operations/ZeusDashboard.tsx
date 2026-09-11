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
    const customerNames = w.data.jobs.map(job => w.data.customers.find(customer => customer.id === job.customerId)?.name || 'Cliente não identificado');
    const assetNames = w.data.jobs.map(job => {
      const asset = w.data.assets.find(current => current.id === job.assetId);
      return asset ? [asset.identifier, asset.model].filter(Boolean).join(' · ') || 'Sem identificação' : 'Sem identificação';
    });
    const values: Record<string, string[]> = {
      Status: Array.from(new Set(w.data.jobs.map(job => job.status))).sort(),
      Etapa: Array.from(new Set(w.data.jobs.map(job => job.stage))).sort(),
      Tipo: Array.from(new Set(w.data.jobs.map(job => job.type))).sort(),
      Responsável: Array.from(new Set(w.data.jobs.map(job => job.technician || 'Sem responsável'))).sort(),
      Cliente: Array.from(new Set(customerNames)).sort(),
      Veículo: Array.from(new Set(assetNames)).sort(),
      Prazo: ['Atrasado', 'Vence hoje', 'No prazo', 'Sem prazo'],
      Cobrança: ['Pendente', 'Recebido / baixado', 'Sem cobrança', 'Cancelada']
    };
    const keys = Array.from(new Set([...prefs.dashboardFilters, 'Cliente', 'Veículo', 'Prazo', 'Cobrança']));
    return keys.map(key => ({ key, label: key === 'Veículo' ? w.data.settings.assetLabel : key, options: values[key] || [] })).filter(item => item.options.length && (item.key !== 'Cobrança' || !billingBusy));
  }, [prefs.dashboardFilters, w.data.jobs, w.data.customers, w.data.assets, w.data.settings.assetLabel, billingBusy]);

  const filtered = leads.filter(item => {
    const job = item.job;
    const customer = w.data.customers.find(current => current.id === job.customerId)?.name || 'Cliente não identificado';
    const asset = w.data.assets.find(current => current.id === job.assetId);
    const assetLabel = asset ? [asset.identifier, asset.model].filter(Boolean).join(' · ') || 'Sem identificação' : 'Sem identificação';
    if (!matches(query, job.number, customer, asset?.identifier, asset?.model, job.type, job.technician, job.stage, job.status)) return false;
    const checks: Record<string, string> = {
      Status: job.status,
      Etapa: job.stage,
      Tipo: job.type,
      Responsável: job.technician || 'Sem responsável',
      Cliente: customer,
      Veículo: assetLabel,
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
    <Title eyebrow="Visão gerencial" title="Dashboard">Operação e faturamento aparecem separados para você analisar a oficina sem misturar andamento da OS com recebimento.</Title>

    <Section title="Relatório de OS">
      <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={active} onActive={setActive} sort={sort} sortOptions={[{ value: 'lead', label: 'Lead time' }, { value: 'createdAt', label: 'Data de abertura' }, { value: 'due', label: 'Prazo previsto' }, { value: 'number', label: 'Número da OS' }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder={`Buscar OS, cliente, ${w.data.settings.assetLabel.toLowerCase()} ou técnico`} />

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
          return <button key={item.job.id} onClick={() => router.push(`/zeus/atendimentos/${item.job.id}`)}><span><strong>OS {String(item.job.number).padStart(4, '0')} · {asset?.identifier || ''}</strong><small>{customer} · {item.job.stage}</small></span><span><b>{formatLeadTime(item.totalMs)}</b><Badge>{item.job.status}</Badge></span><ArrowRight size={17} /></button>;
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
              return <button key={item.job.id} onClick={() => router.push(`/zeus/atendimentos/${item.job.id}`)}><span><strong>OS {String(item.job.number).padStart(4, '0')}</strong><small>{customer} · {deadlineBucket(item.job.due)}</small></span><Badge tone={deadlineBucket(item.job.due) === 'Atrasado' ? 'warning' : ''}>{item.job.stage}</Badge><ArrowRight size={16} /></button>;
            })}
          </div> : <Empty>Nenhuma OS aberta com prazo vencido ou vencendo hoje.</Empty>}
        </div>
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

    <style jsx global>{`
      .zeus-dashboard-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--op-line);margin:18px 0 24px;background:var(--op-paper)}
      .zeus-dashboard-kpis>div{padding:18px 20px;display:grid;gap:4px;border-right:1px solid var(--op-line)}
      .zeus-dashboard-kpis>div:last-child{border-right:0}
      .zeus-dashboard-kpis span{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--op-muted)}
      .zeus-dashboard-kpis strong{font-size:27px;letter-spacing:-.04em;line-height:1.2}
      .zeus-dashboard-kpis small{color:var(--op-muted)}
      .zeus-dashboard-grid-top{padding-bottom:24px;border-bottom:1px solid var(--op-line)}
      .zeus-dashboard-secondary{margin-top:24px}
      .zeus-status-list{display:grid;gap:14px}
      .zeus-status-list>div{display:grid;gap:7px}
      .zeus-status-list>div>div{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .zeus-status-list span{color:var(--op-muted);font-size:12px}
      .zeus-status-list i{height:7px;background:var(--op-soft);overflow:hidden;border-radius:999px}
      .zeus-status-list i b{display:block;height:100%;background:var(--op-accent);border-radius:999px}
      .zeus-attention-list{display:grid;border-top:1px solid var(--op-line)}
      .zeus-attention-list button{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:13px 0;border:0;border-bottom:1px solid var(--op-line);background:none;color:inherit;text-align:left}
      .zeus-attention-list button:hover{background:var(--op-soft)}
      .zeus-attention-list button>span{display:grid;gap:2px}
      .zeus-attention-list small{color:var(--op-muted)}
      @media(max-width:1050px){.zeus-dashboard-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.zeus-dashboard-kpis>div:nth-child(2){border-right:0}.zeus-dashboard-kpis>div:nth-child(-n+2){border-bottom:1px solid var(--op-line)}}
      @media(max-width:720px){.zeus-dashboard-kpis{grid-template-columns:1fr}.zeus-dashboard-kpis>div{border-right:0;border-bottom:1px solid var(--op-line)}.zeus-dashboard-kpis>div:last-child{border-bottom:0}.zeus-attention-list button{grid-template-columns:minmax(0,1fr) auto}.zeus-attention-list button>svg{display:none}}
    `}</style>
  </>;
}
