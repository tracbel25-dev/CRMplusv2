'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleDollarSign } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { clientMessage } from '@/lib/clientMessage';
import { matches, money } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { Badge, Button, Empty, Modal, RecordForm, Section, Title } from './ui';
import { PostCompletionPayments } from './PostCompletionPayments';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';

type BillingRecord = {
  id: string;
  job_id: string;
  job_number: number;
  customer_id: string;
  amount_cents: number;
  status: 'Pendente' | 'Pago' | 'Baixado' | 'Cancelado';
  payment_method: string;
  payment_provider: string;
  provider_reference: string;
  paid_at: string | null;
  closed_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

async function token() {
  const { data } = await createStoreClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
  return data.session.access_token;
}

export function ZeusBilling({ w }: { w: Workspace }) {
  const access = useStoreAccess();
  const canCollect = access.hasPermission('zeus', 'billing_collect');
  const canManage = access.hasPermission('zeus', 'billing_manage');
  const workspaceRef = useRef(w);
  workspaceRef.current = w;
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [selectedJob, setSelectedJob] = useState('');
  const [manualJob, setManualJob] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Record<string, string[]>>({ Situação: ['Pendente'] });
  const [sort, setSort] = useState('updatedAt');
  const [descending, setDescending] = useState(true);

  const patch = useCallback(async (jobId: string, body: Record<string, unknown>) => {
    const response = await fetch('/api/zeus/faturamento', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, ...body }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o faturamento.');
  }, []);

  const load = useCallback(async () => {
    const current = workspaceRef.current;
    setBusy(true);
    try {
      const response = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await token()}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o faturamento.');
      let rows = (payload.records || []) as BillingRecord[];

      const autoPaid = rows.filter(row => row.status === 'Pendente' && current.data.jobs.find(job => job.id === row.job_id)?.events.some(item => item.code === 'payment.mercadopago.confirmed' || item.text.includes('Pagamento Mercado Pago confirmado')));
      if (autoPaid.length && canManage) {
        await Promise.all(autoPaid.map(row => patch(row.job_id, { status: 'Pago', paymentMethod: 'Mercado Pago', paymentProvider: 'Mercado Pago', notes: 'Pagamento confirmado automaticamente.' })));
        const refreshed = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await token()}` }, cache: 'no-store' });
        const next = await refreshed.json().catch(() => ({}));
        if (refreshed.ok) rows = (next.records || []) as BillingRecord[];
      }
      setRecords(rows);
    } catch (reason) {
      current.setError(clientMessage(reason, 'Não foi possível carregar o faturamento.'));
    } finally { setBusy(false); }
  }, [canManage, patch]);

  useEffect(() => { void load(); }, [load, w.data.revision]);
  useEffect(() => {
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const customerName = (row: BillingRecord) => w.data.customers.find(item => item.id === row.customer_id)?.name || 'Cliente';
  const definitions = useMemo<FilterDefinition[]>(() => {
    const methods = Array.from(new Set(records.map(row => row.payment_method || 'Não informado'))).sort();
    const customers = Array.from(new Set(records.map(row => customerName(row)))).sort();
    return [
      { key: 'Situação', label: 'Situação', options: ['Pendente', 'Pago', 'Baixado', 'Cancelado'] },
      { key: 'Forma de pagamento', label: 'Forma de pagamento', options: methods },
      { key: 'Cliente', label: 'Cliente', options: customers },
    ].filter(item => item.options.length);
  }, [records, w.data.customers]);

  const visible = useMemo(() => records.filter(row => {
    const customer = customerName(row);
    const job = w.data.jobs.find(item => item.id === row.job_id);
    const asset = job ? w.data.assets.find(item => item.id === job.assetId) : undefined;
    if (!matches(query, row.job_number, customer, asset?.identifier, asset?.model, row.payment_method, row.status, row.notes)) return false;
    const checks: Record<string, string> = {
      Situação: row.status,
      'Forma de pagamento': row.payment_method || 'Não informado',
      Cliente: customer,
    };
    return Object.entries(active).every(([key, values]) => !values.length || values.includes(checks[key]));
  }).sort((a, b) => {
    const value = (row: BillingRecord) => sort === 'number' ? row.job_number : sort === 'amount' ? row.amount_cents : sort === 'status' ? row.status : sort === 'createdAt' ? row.created_at : row.updated_at;
    const av = value(a); const bv = value(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR');
    return descending ? -result : result;
  }), [records, query, active, sort, descending, w.data.jobs, w.data.assets, w.data.customers]);

  const pendingTotal = records.filter(row => row.status === 'Pendente').reduce((sum, row) => sum + row.amount_cents, 0);
  const paidTotal = records.filter(row => row.status === 'Pago' || row.status === 'Baixado').reduce((sum, row) => sum + row.amount_cents, 0);
  const selected = canCollect ? records.find(row => row.job_id === selectedJob) : undefined;

  return <>
    <Title eyebrow="Financeiro separado da operação" title="Faturamento">A OS termina no atendimento. Aqui você acompanha somente o que ainda precisa ser recebido ou baixado.</Title>

    <div className="zeus-billing-summary">
      <div><span>Pendente</span><strong>{money(pendingTotal)}</strong><small>{records.filter(row => row.status === 'Pendente').length} OS</small></div>
      <div><span>Recebido / baixado</span><strong>{money(paidTotal)}</strong><small>{records.filter(row => row.status === 'Pago' || row.status === 'Baixado').length} OS</small></div>
    </div>

    <Section title="Ordens encerradas">
      <ZeusFilterBar
        query={query}
        onQuery={setQuery}
        definitions={definitions}
        active={active}
        onActive={setActive}
        sort={sort}
        sortOptions={[{ value: 'updatedAt', label: 'Última atualização' }, { value: 'createdAt', label: 'Data de criação' }, { value: 'number', label: 'Número da OS' }, { value: 'amount', label: 'Valor' }, { value: 'status', label: 'Situação' }]}
        descending={descending}
        onSort={setSort}
        onDescending={setDescending}
        placeholder="Buscar OS, cliente, veículo ou pagamento"
      />
      {busy ? <p className="op-muted">Carregando faturamento…</p> : visible.length === 0 ? <Empty>Nenhuma OS corresponde aos filtros.</Empty> : <div className="zeus-billing-list">{visible.map(row => {
        const job = w.data.jobs.find(item => item.id === row.job_id);
        const customer = w.data.customers.find(item => item.id === row.customer_id);
        const asset = job ? w.data.assets.find(item => item.id === job.assetId) : undefined;
        return <div className="zeus-billing-row" key={row.id}>
          <div><span>OS {String(row.job_number).padStart(4, '0')}</span><strong>{customer?.name || 'Cliente'}</strong><small>{asset ? `${asset.identifier} · ${asset.model}` : 'Atendimento encerrado'}</small></div>
          <div><span>Valor</span><strong>{money(row.amount_cents)}</strong></div>
          <Badge tone={row.status === 'Pendente' ? 'warning' : ''}>{row.status}</Badge>
          {(canCollect || canManage) && <div className="op-actions">
            {row.status === 'Pendente' && canCollect && <Button variant="secondary" onClick={() => setSelectedJob(row.job_id)}><CircleDollarSign size={16}/>Cobrar</Button>}
            {row.status === 'Pendente' && canManage && <Button onClick={() => setManualJob(row.job_id)}><CheckCircle2 size={16}/>Dar baixa</Button>}
          </div>}
        </div>;
      })}</div>}
    </Section>

    {selected && <Modal title={`Cobrança · OS ${String(selected.job_number).padStart(4, '0')}`} wide onClose={() => setSelectedJob('')}><PostCompletionPayments w={w} app="zeus" page="faturamento" recordId={selected.job_id}/></Modal>}

    {manualJob && canManage && <Modal title="Registrar recebimento" onClose={() => setManualJob('')}><RecordForm
      draftKey={`zeus-billing:${manualJob}`}
      fields={[{ name: 'paymentMethod', label: 'Como foi recebido?', required: true, options: [{ value: 'Pix', label: 'Pix' }, { value: 'Dinheiro', label: 'Dinheiro' }, { value: 'Cartão de débito', label: 'Cartão de débito' }, { value: 'Cartão de crédito', label: 'Cartão de crédito' }, { value: 'Mercado Pago', label: 'Mercado Pago' }, { value: 'Outro', label: 'Outro' }] }, { name: 'notes', label: 'Observação', type: 'textarea', wide: true }]}
      submit="Confirmar recebimento"
      onClose={() => setManualJob('')}
      onSave={async form => {
        try {
          await patch(manualJob, { status: 'Pago', paymentMethod: form.paymentMethod, notes: form.notes || '' });
          setManualJob('');
          w.setNotice('Recebimento registrado no faturamento.');
          await load();
          return true;
        } catch (reason) {
          w.setError(clientMessage(reason, 'Não foi possível registrar o recebimento.'));
          return false;
        }
      }}
    /></Modal>}
  </>;
}
