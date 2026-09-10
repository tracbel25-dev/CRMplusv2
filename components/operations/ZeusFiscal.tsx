'use client';

import { useEffect, useMemo, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Workspace } from '@/lib/operations/storage';
import { money } from '@/lib/operations/model';

const emptyProfile = { cnpj: '', municipal_registration: '', municipality_ibge: '', tax_regime: '', dps_series: '1', provider: 'national' };

type InvoiceRow = {
  id: string;
  job_id: string | null;
  customer_name: string;
  service_code: string;
  description: string;
  amount_cents: number;
  status: string;
  invoice_number: string | null;
  access_key: string | null;
  error_message: string | null;
  created_at: string;
};

async function token() {
  const supabase = createStoreClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Entre novamente para usar o módulo fiscal.');
  return data.session.access_token;
}

async function api(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const accessToken = await token();
  const response = await fetch('/api/zeus/nfse', {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) throw new Error(data.error || 'Não foi possível concluir a operação fiscal.');
  return { ...data, warning: response.status === 409 ? data.error : '' };
}

export function ZeusFiscal({ w }: { w: Workspace }) {
  const [profile, setProfile] = useState<Record<string, string>>(emptyProfile);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const jobs = useMemo(() => [...w.data.jobs].sort((a, b) => b.number - a.number), [w.data.jobs]);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const data = await api('GET');
      setProfile(data.profile || emptyProfile);
      setInvoices(data.invoices || []);
    } catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  function chooseJob(id: string) {
    setJobId(id);
    const job = w.data.jobs.find(item => item.id === id);
    if (!job) return;
    const customer = w.data.customers.find(item => item.id === job.customerId);
    const asset = w.data.assets.find(item => item.id === job.assetId);
    setCustomerName(customer?.name || '');
    setCustomerEmail(customer?.email || '');
    setDescription([job.type, asset ? `${w.data.settings.assetLabel}: ${asset.identifier} — ${asset.model}` : '', job.diagnosis || job.complaint].filter(Boolean).join(' | '));
    const total = job.quote?.lines?.reduce((sum, line) => sum + Math.round(line.quantity * line.price), 0) || 0;
    setAmount(total ? (total / 100).toFixed(2).replace('.', ',') : '');
  }

  async function saveProfile() {
    setSaving(true); setError(''); setMessage('');
    try {
      await api('POST', {
        action: 'save-profile', cnpj: profile.cnpj, municipalRegistration: profile.municipal_registration,
        municipalityIbge: profile.municipality_ibge, taxRegime: profile.tax_regime, dpsSeries: profile.dps_series,
        provider: profile.provider,
      });
      setMessage('Configuração fiscal salva.');
      await refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function createDraft() {
    setSaving(true); setError(''); setMessage('');
    try {
      const amountCents = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100);
      await api('POST', { action: 'create-draft', jobId: jobId || null, customerName, customerDocument, customerEmail, serviceCode, description, amountCents, provider: profile.provider || 'national' });
      setMessage('NFS-e preparada e salva no histórico fiscal.');
      setJobId(''); setCustomerName(''); setCustomerDocument(''); setCustomerEmail(''); setServiceCode(''); setDescription(''); setAmount('');
      await refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  async function issue(invoiceId: string) {
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await api('POST', { action: 'issue', invoiceId });
      setMessage(data.warning || 'Solicitação de emissão enviada.');
      await refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  const field = (key: string, label: string, placeholder = '') => <label className="op-field"><span>{label}</span><input value={profile[key] || ''} placeholder={placeholder} onChange={e => setProfile(current => ({ ...current, [key]: e.target.value }))} /></label>;

  return <div className="op-stack">
    <section className="op-section">
      <div className="op-section-head"><div><h2>Nota fiscal de serviço</h2><p className="op-muted">Emissão ligada ao atendimento da oficina, com histórico por empresa.</p></div></div>
      {loading && <div className="op-loading">Carregando módulo fiscal…</div>}
      {error && <div className="op-alert" role="alert"><span>{error}</span></div>}
      {message && <div className="op-help"><strong>{message}</strong></div>}
    </section>

    <section className="op-section">
      <div className="op-section-head"><div><h2>Configuração da empresa</h2><p className="op-muted">Dados usados para identificar o prestador na prefeitura/emissor nacional.</p></div></div>
      <div className="op-form-grid">
        {field('cnpj', 'CNPJ', 'Somente números')}
        {field('municipal_registration', 'Inscrição municipal')}
        {field('municipality_ibge', 'Código IBGE do município', '7 dígitos')}
        {field('tax_regime', 'Regime tributário')}
        {field('dps_series', 'Série da DPS', '1')}
        <label className="op-field"><span>Emissor</span><select value={profile.provider || 'national'} onChange={e => setProfile(current => ({ ...current, provider: e.target.value }))}><option value="national">NFS-e Padrão Nacional</option><option value="municipal">Prefeitura / provedor municipal</option></select></label>
      </div>
      <div className="op-actions"><button className="op-button" disabled={saving} onClick={() => void saveProfile()}>{saving ? 'Salvando…' : 'Salvar configuração fiscal'}</button></div>
    </section>

    <section className="op-section">
      <div className="op-section-head"><div><h2>Preparar NFS-e</h2><p className="op-muted">Selecione uma OS para reaproveitar cliente, serviço e valor do orçamento.</p></div></div>
      <div className="op-form-grid">
        <label className="op-field"><span>Ordem de serviço</span><select value={jobId} onChange={e => chooseJob(e.target.value)}><option value="">Sem OS vinculada</option>{jobs.map(job => <option key={job.id} value={job.id}>OS {job.number} — {w.data.assets.find(a => a.id === job.assetId)?.identifier || 'Sem identificação'}</option>)}</select></label>
        <label className="op-field"><span>Cliente</span><input value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
        <label className="op-field"><span>CPF/CNPJ do tomador</span><input value={customerDocument} onChange={e => setCustomerDocument(e.target.value)} /></label>
        <label className="op-field"><span>E-mail do tomador</span><input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} /></label>
        <label className="op-field"><span>Código do serviço</span><input value={serviceCode} onChange={e => setServiceCode(e.target.value)} /></label>
        <label className="op-field"><span>Valor</span><input inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      </div>
      <label className="op-field"><span>Descrição do serviço</span><textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="op-actions"><button className="op-button" disabled={saving} onClick={() => void createDraft()}>{saving ? 'Salvando…' : 'Preparar nota fiscal'}</button></div>
    </section>

    <section className="op-section">
      <div className="op-section-head"><div><h2>Histórico fiscal</h2><p className="op-muted">Rascunhos e emissões ficam separados por conta da oficina.</p></div></div>
      {!loading && !invoices.length && <div className="op-empty">Nenhuma nota fiscal preparada.</div>}
      <div className="op-list">
        {invoices.map(invoice => <article className="op-list-row" key={invoice.id}>
          <div><strong>{invoice.customer_name}</strong><small>{invoice.service_code} · {new Date(invoice.created_at).toLocaleString('pt-BR')}</small><p>{invoice.description}</p></div>
          <div><strong>{money(invoice.amount_cents)}</strong><small>{invoice.invoice_number ? `NFS-e ${invoice.invoice_number}` : invoice.status}</small>{invoice.error_message && <small>{invoice.error_message}</small>}<button className="op-button secondary" disabled={saving || invoice.status === 'authorized'} onClick={() => void issue(invoice.id)}>{invoice.status === 'authorized' ? 'Emitida' : 'Emitir NFS-e'}</button></div>
        </article>)}
      </div>
    </section>
  </div>;
}
