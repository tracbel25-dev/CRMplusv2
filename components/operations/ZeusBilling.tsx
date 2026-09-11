'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDollarSign, RefreshCw } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { money } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { Badge, Button, Empty, Modal, RecordForm, Section, Title } from './ui';
import { PostCompletionPayments } from './PostCompletionPayments';

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
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [busy, setBusy] = useState(true);
  const [selectedJob, setSelectedJob] = useState('');
  const [manualJob, setManualJob] = useState('');
  const [filter, setFilter] = useState<'Todos' | BillingRecord['status']>('Pendente');

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
    setBusy(true);
    try {
      const response = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await token()}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o faturamento.');
      let rows = (payload.records || []) as BillingRecord[];

      const autoPaid = rows.filter(row => row.status === 'Pendente' && w.data.jobs.find(job => job.id === row.job_id)?.events.some(item => item.text.includes('Pagamento Mercado Pago confirmado')));
      if (autoPaid.length) {
        await Promise.all(autoPaid.map(row => patch(row.job_id, { status: 'Pago', paymentMethod: 'Mercado Pago', paymentProvider: 'Mercado Pago', notes: 'Pagamento confirmado automaticamente.' })));
        const refreshed = await fetch('/api/zeus/faturamento', { headers: { authorization: `Bearer ${await token()}` }, cache: 'no-store' });
        const next = await refreshed.json().catch(() => ({}));
        if (refreshed.ok) rows = (next.records || []) as BillingRecord[];
      }
      setRecords(rows);
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o faturamento.');
    } finally { setBusy(false); }
  }, [patch, w]);

  useEffect(() => { void load(); }, [load, w.data.revision]);

  const visible = useMemo(() => filter === 'Todos' ? records : records.filter(row => row.status === filter), [filter, records]);
  const pendingTotal = records.filter(row => row.status === 'Pendente').reduce((sum, row) => sum + row.amount_cents, 0);
  const paidTotal = records.filter(row => row.status === 'Pago' || row.status === 'Baixado').reduce((sum, row) => sum + row.amount_cents, 0);
  const selected = records.find(row => row.job_id === selectedJob);

  return <>
    <Title eyebrow="Financeiro separado da operação" title="Faturamento">A OS termina no atendimento. Aqui você acompanha somente o que ainda precisa ser recebido ou baixado.</Title>

    <div className="zeus-billing-summary">
      <div><span>Pendente</span><strong>{money(pendingTotal)}</strong><small>{records.filter(row => row.status === 'Pendente').length} OS</small></div>
      <div><span>Recebido / baixado</span><strong>{money(paidTotal)}</strong><small>{records.filter(row => row.status === 'Pago' || row.status === 'Baixado').length} OS</small></div>
    </div>

    <Section title="Ordens encerradas" action={<Button variant="secondary" disabled={busy} onClick={() => { void load(); }}><RefreshCw size={16} />Atualizar</Button>}>
      <div className="op-filter-row"><label className="op-field"><span>Situação</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option>Todos</option><option>Pendente</option><option>Pago</option><option>Baixado</option><option>Cancelado</option></select></label></div>
      {busy ? <p className="op-muted">Carregando faturamento…</p> : visible.length === 0 ? <Empty>Nenhuma OS nesta situação.</Empty> : <div className="zeus-billing-list">{visible.map(row => {
        const job = w.data.jobs.find(item => item.id === row.job_id);
        const customer = w.data.customers.find(item => item.id === row.customer_id);
        const asset = job ? w.data.assets.find(item => item.id === job.assetId) : undefined;
        return <div className="zeus-billing-row" key={row.id}>
          <div><span>OS {String(row.job_number).padStart(4, '0')}</span><strong>{customer?.name || 'Cliente'}</strong><small>{asset ? `${asset.identifier} · ${asset.model}` : 'Atendimento encerrado'}</small></div>
          <div><span>Valor</span><strong>{money(row.amount_cents)}</strong></div>
          <Badge tone={row.status === 'Pendente' ? 'warning' : ''}>{row.status}</Badge>
          <div className="op-actions">
            {row.status === 'Pendente' && <Button variant="secondary" onClick={() => setSelectedJob(row.job_id)}><CircleDollarSign size={16} />Cobrar</Button>}
            {row.status === 'Pendente' && <Button onClick={() => setManualJob(row.job_id)}><CheckCircle2 size={16} />Dar baixa</Button>}
          </div>
        </div>;
      })}</div>}
    </Section>

    {selected && <Modal title={`Cobrança · OS ${String(selected.job_number).padStart(4, '0')}`} wide onClose={() => setSelectedJob('')}><PostCompletionPayments w={w} app="zeus" page="faturamento" recordId={selected.job_id} /></Modal>}

    {manualJob && <Modal title="Registrar recebimento" onClose={() => setManualJob('')}><RecordForm
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
          w.setError(reason instanceof Error ? reason.message : 'Não foi possível registrar o recebimento.');
          return false;
        }
      }}
    /></Modal>}
  </>;
}
