'use client';

import { useMemo, useState } from 'react';
import { Download, MessageCircle } from 'lucide-react';
import type { Job, Quote } from '@/lib/operations/model';
import { advanceJob, decideQuote, effectiveQuoteStatus, event, money, reviseQuote, sendQuote, total } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { createExternalLink } from '@/lib/operations/externalLinks';
import { downloadQuotePdf } from '@/lib/operations/pdf';
import { budgetLabel, defaultQuoteValidity } from '@/lib/operations/zeus';
import { Button, Confirm, Empty, LineEditor, Modal, RecordForm, Timeline } from './ui';

function phoneForWhatsapp(phone: string) {
  let value = phone.replace(/\D/g, '');
  if ((value.length === 10 || value.length === 11) && !value.startsWith('55')) value = `55${value}`;
  return value;
}

function locateQuote(data: Workspace['data'], quoteId: string, jobId?: string) {
  if (jobId) return data.jobs.find(item => item.id === jobId)?.quote;
  return data.quotes.find(item => item.id === quoteId);
}

function QuoteEditor({ w, quote, job, onSaved }: { w: Workspace; quote: Quote; job?: Job; onSaved: (draft: Quote) => void }) {
  const [draft, setDraft] = useState(() => ({ ...structuredClone(quote), validUntil: quote.validUntil || defaultQuoteValidity(w.data) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let sum = 0;
  try { sum = total(draft.lines, draft.discount); } catch {}
  const save = async () => {
    if (busy) return;
    setError('');
    try {
      if (!draft.lines.length) throw new Error('Adicione ao menos um serviço ou peça.');
      total(draft.lines, draft.discount);
      if (!draft.validUntil) throw new Error('Informe a validade do orçamento.');
      setBusy(true);
      const ok = await w.mutate(data => {
        const current = locateQuote(data, quote.id, job?.id);
        if (!current) throw new Error('Orçamento não encontrado.');
        if (current.status !== 'Rascunho') throw new Error('Esta versão já foi compartilhada. Crie uma nova versão para editar.');
        Object.assign(current, structuredClone(draft));
        current.title = '';
        current.events.push(event('Orçamento salvo'));
      }, 'Orçamento salvo.');
      if (ok) onSaved(structuredClone(draft));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="zeus-quote-editor">
    <div className="op-fields"><label className="op-field"><span>Validade</span><input type="date" value={draft.validUntil} onChange={e => setDraft({ ...draft, validUntil: e.target.value })} /></label></div>
    <LineEditor lines={draft.lines} onChange={lines => setDraft({ ...draft, lines })} parts customerId={draft.customerId} />
    <div className="op-quote-total"><label className="op-field"><span>Desconto (R$)</span><input type="number" min="0" step="0.01" value={draft.discount / 100} onChange={e => setDraft({ ...draft, discount: Math.round(Number(e.target.value) * 100) })} /></label><div><small>Total</small><strong>{money(sum)}</strong></div></div>
    <label className="op-field"><span>Observações para o cliente</span><textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
    {error && <p className="op-error">{error}</p>}
    <div className="op-form-footer"><Button disabled={busy} onClick={() => { void save(); }}>{busy ? 'Salvando…' : 'Salvar orçamento'}</Button></div>
  </div>;
}

export function ZeusQuotePanel({ w, quote, job }: { w: Workspace; quote: Quote; job?: Job }) {
  const [sharePrompt, setSharePrompt] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(false);
  const [busy, setBusy] = useState(false);
  const customer = w.data.customers.find(item => item.id === quote.customerId);
  const status = effectiveQuoteStatus(quote);
  const record = useMemo(() => ({ quote, origin: job ? 'OS' as const : 'Balcão' as const, job }), [quote, job]);
  const label = budgetLabel(record);
  const reference = job ? `OS ${String(job.number).padStart(4, '0')}` : 'Venda de balcão';
  const value = quote.lines.length ? total(quote.lines, quote.discount) : 0;
  const download = () => downloadQuotePdf({ quote, customer, business: w.data.settings, label, reference });

  const share = async () => {
    if (busy) return;
    if (!customer?.phone) { w.setError('Cadastre o telefone do cliente antes de compartilhar pelo WhatsApp.'); return; }
    if (!quote.lines.length) { w.setError('Adicione os itens antes de compartilhar.'); return; }
    setBusy(true);
    try {
      let externalQuote = structuredClone(quote);
      if (quote.status === 'Rascunho') {
        const ok = await w.mutate(data => {
          const current = locateQuote(data, quote.id, job?.id);
          if (!current) throw new Error('Orçamento não encontrado.');
          if (!current.validUntil) current.validUntil = defaultQuoteValidity(data);
          sendQuote(current);
          externalQuote = structuredClone(current);
          if (job) {
            const currentJob = data.jobs.find(item => item.id === job.id)!;
            currentJob.status = 'Aguardando aprovação';
            currentJob.stage = 'Orçamento';
            currentJob.events.push(event('Orçamento compartilhado com o cliente'));
          }
        }, 'Orçamento preparado para compartilhamento.');
        if (!ok) return;
      }
      const url = await createExternalLink(w, 'zeus', {
        kind: 'zeus-quote',
        recordId: job?.id || quote.id,
        title: label,
        payload: {
          business: w.data.settings.business,
          customer: customer.name,
          asset: job ? (() => { const asset = w.data.assets.find(item => item.id === job.assetId); return asset ? `${asset.identifier} · ${asset.model}` : ''; })() : '',
          quote: { ...externalQuote, status: 'Enviado' }, quoteId: quote.id, jobId: job?.id || '', origin: job ? 'os' : 'balcao', version: externalQuote.version
        }
      });
      const phone = phoneForWhatsapp(customer.phone);
      const message = `${w.data.settings.business || 'Oficina'}\n${label}\nTotal: ${money(value)}\nAcesse para conferir e aprovar ou reprovar:\n${url}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      setSharePrompt(false);
    } catch (reason) { w.setError(reason instanceof Error ? reason.message : 'Não foi possível compartilhar o orçamento.'); }
    finally { setBusy(false); }
  };

  return <div className="zeus-quote-panel">
    <div className="zeus-quote-heading"><div><span className="op-kicker">{label}</span><strong>{status}</strong><small>Versão {quote.version}</small></div><strong className="op-price">{money(value)}</strong></div>
    {quote.status === 'Rascunho' ? <QuoteEditor w={w} quote={quote} job={job} onSaved={() => setSharePrompt(true)} /> : <>
      {quote.lines.length ? <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind}{line.brand ? ` · ${line.brand}` : ''} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div> : <Empty>Este orçamento ainda não possui itens.</Empty>}
      {quote.discount > 0 && <p>Desconto: {money(quote.discount)}</p>}{quote.notes && <p className="op-prewrap">{quote.notes}</p>}
    </>}
    <div className="op-actions zeus-quote-actions">
      {quote.lines.length > 0 && <Button variant="secondary" onClick={download}><Download size={16} />Baixar PDF</Button>}
      {quote.lines.length > 0 && ['Rascunho', 'Enviado'].includes(quote.status) && <Button variant="secondary" onClick={() => { void share(); }} disabled={busy}><MessageCircle size={16} />{quote.status === 'Rascunho' ? 'Compartilhar' : 'Compartilhar novamente'}</Button>}
      {status === 'Enviado' && <><Button onClick={() => setDecision(true)}>Registrar aprovação</Button><Button variant="secondary" onClick={() => setDecision(false)}>Registrar reprovação</Button></>}
      {(!['Rascunho', 'Enviado'].includes(quote.status) || status === 'Expirado') && <Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar validade / nova versão' : 'Criar nova versão'}</Button>}
    </div>
    {quote.versions?.length ? <details className="op-version-history"><summary>Versões anteriores ({quote.versions.length})</summary>{quote.versions.map(version => <div key={version.version}><strong>Versão {version.version} · {version.status}</strong><p>{version.decisionNote || 'Sem decisão registrada'}</p></div>)}</details> : null}
    {quote.events.length > 0 && <details><summary>Histórico do orçamento</summary><div style={{ marginTop: 12 }}><Timeline events={quote.events} /></div></details>}

    {sharePrompt && <Modal title="Orçamento salvo" onClose={() => setSharePrompt(false)}><p>Gostaria de compartilhar o orçamento agora?</p><div className="op-form-footer"><Button variant="secondary" onClick={() => setSharePrompt(false)}>{job ? 'Continuar editando a OS' : 'Deixar para depois'}</Button><Button onClick={() => { void share(); }} disabled={busy}><MessageCircle size={16} />Compartilhar pelo WhatsApp</Button></div></Modal>}
    {decision !== null && <Modal title={decision ? 'Registrar aprovação' : 'Registrar reprovação'} onClose={() => setDecision(null)}><RecordForm draftKey={`zeus-quote-decision:${quote.id}`} fields={[{ name: 'note', label: 'Como a decisão do cliente foi recebida?', type: 'textarea', required: true, wide: true }]} onClose={() => setDecision(null)} submit={decision ? 'Confirmar aprovação' : 'Confirmar reprovação'} onSave={form => w.mutate(data => {
      const current = locateQuote(data, quote.id, job?.id); if (!current) throw new Error('Orçamento não encontrado.'); decideQuote(current, decision, form.note);
      if (job) { const currentJob = data.jobs.find(item => item.id === job.id)!; currentJob.status = decision ? 'Em andamento' : 'Reprovado'; currentJob.events.push(event(`Decisão do orçamento: ${current.status}`)); if (decision && currentJob.stage === 'Orçamento') advanceJob(data, currentJob.id, 'Orçamento'); }
    }, decision && job ? 'Orçamento aprovado e OS liberada para execução.' : 'Decisão registrada.')} /></Modal>}
    {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => w.mutate(data => {
      const current = locateQuote(data, quote.id, job?.id); if (!current) throw new Error('Orçamento não encontrado.'); reviseQuote(current); current.validUntil = defaultQuoteValidity(data);
      if (job) { const currentJob = data.jobs.find(item => item.id === job.id)!; if (!['Encerrado', 'Cancelado'].includes(currentJob.status)) { currentJob.stage = 'Orçamento'; currentJob.status = 'Em andamento'; currentJob.events.push(event(`Nova versão ${current.version} do orçamento aberta`)); } }
    }, 'Nova versão aberta.')}>A versão atual será preservada. A nova versão volta a rascunho e exigirá novo compartilhamento.</Confirm>}
  </div>;
}
