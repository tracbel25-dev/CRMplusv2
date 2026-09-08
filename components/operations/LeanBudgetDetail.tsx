'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Quote, customValues, date, decideQuote, effectiveQuoteStatus, event,
  reviseQuote, sendQuote, total, money
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, Modal, QuoteDocument,
  RecordForm, Section, Timeline, Title
} from './ui';
import { WorkflowControl } from './WorkflowControl';
import { LeanInlineQuoteEditor } from './LeanInlineQuoteEditor';

export function LeanBudgetDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  const router = useRouter();
  const operation = useOperationPreferences('athena-orcamentos');
  const [preview, setPreview] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(false);
  const quote = w.data.quotes.find(item => item.id === recordId);

  if (!quote) return <>
    <Button variant="text" onClick={() => router.push('/athena-orcamentos/orcamentos')}><ArrowLeft size={16} />Voltar aos orçamentos</Button>
    <Section title="Orçamento não encontrado"><p>Este registro não existe mais nesta conta.</p></Section>
  </>;

  const customer = w.data.customers.find(item => item.id === quote.customerId);
  const status = effectiveQuoteStatus(quote);
  const final = ['Aprovado', 'Reprovado', 'Expirado'].includes(status);
  const steps = final ? ['Rascunho', 'Enviado', status] : ['Rascunho', 'Enviado', 'Decisão'];
  const currentStep = final ? status : quote.status === 'Enviado' ? 'Enviado' : 'Rascunho';
  const custom = operation.preferences.customFields.filter(field => field.visible && ['Orçamento', 'Condições', 'Aprovação', 'Cliente'].includes(field.group));
  const values = customValues(w.data, quote.id);

  const mutateQuote = (fn: (current: Quote) => void, message?: string) => w.mutate(data => {
    const current = data.quotes.find(item => item.id === quote.id);
    if (!current) throw new Error('Orçamento não encontrado.');
    fn(current);
  }, message);

  const saveDraft = (draft: Quote) => mutateQuote(current => {
    if (current.status !== 'Rascunho') throw new Error('Esta proposta já foi enviada. Crie uma nova versão para alterar.');
    Object.assign(current, draft);
    current.events.push(event('Rascunho atualizado'));
  }, 'Orçamento salvo.');

  const saveAndSend = (draft: Quote) => mutateQuote(current => {
    if (current.status !== 'Rascunho') throw new Error('Esta proposta já foi enviada.');
    Object.assign(current, draft);
    sendQuote(current);
  }, 'Orçamento salvo e marcado como enviado.');

  return <>
    <Button variant="text" onClick={() => router.push('/athena-orcamentos/orcamentos')}><ArrowLeft size={16} />Voltar aos orçamentos</Button>
    <Title eyebrow={`Orçamento ${String(quote.number).padStart(4, '0')} · versão ${quote.version}`} title={quote.title || 'Novo orçamento'} action={quote.lines.length > 0 && operation.actionVisible('document') ? <Button variant="secondary" onClick={() => setPreview(true)}>Ver documento</Button> : undefined}>
      {customer?.name || 'Cliente não encontrado'}
    </Title>

    <WorkflowControl
      label="Fluxo da proposta"
      steps={steps}
      current={currentStep}
      status={status}
      actions={status === 'Enviado' && operation.actionVisible('decision') ? <><Button onClick={() => setDecision(true)}>Registrar aprovação</Button><Button variant="secondary" onClick={() => setDecision(false)}>Registrar reprovação</Button></> : quote.status !== 'Rascunho' && operation.actionVisible('revision') ? <Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar validade / nova versão' : 'Nova versão'}</Button> : undefined}
    />

    {status === 'Expirado' && <p className="op-callout">A validade terminou. Esta versão ficou bloqueada para decisão; abra uma nova versão para revisar prazo ou valores.</p>}

    {quote.status === 'Rascunho' ? <Section title="Montar proposta">
      <LeanInlineQuoteEditor quote={quote} onSave={saveDraft} onSaveAndSend={saveAndSend} />
    </Section> : <div className="budget-workspace">
      <Section title="Proposta comercial">
        <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind}{line.brand ? ` · ${line.brand}` : ''} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div>
        <div className="op-quote-total"><div><small>Total</small><strong>{money(total(quote.lines, quote.discount))}</strong></div></div>
        {quote.notes && <p>{quote.notes}</p>}
        {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
      </Section>
      <aside className="budget-context">
        <span className="op-kicker">Situação</span><h2>{status}</h2>
        <p>Validade: {date(quote.validUntil)}</p><p>Criado em {date(quote.createdAt)}</p>
        {quote.decisionNote && <p className="op-callout">Decisão: {quote.decisionNote}</p>}
        {quote.status !== 'Rascunho' && operation.actionVisible('revision') && <Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar / nova versão' : 'Criar nova versão'}</Button>}
        <details style={{ marginTop: 20 }}><summary>Histórico da proposta</summary><div style={{ marginTop: 14 }}><Timeline events={quote.events} /></div></details>
      </aside>
    </div>}

    {quote.versions && quote.versions.length > 0 && <Section title="Versões anteriores"><details className="op-version-history"><summary>Consultar {quote.versions.length} versão(ões) preservada(s)</summary>{quote.versions.map(version => <div key={version.version}><strong>Versão {version.version} · {version.status} · {money(total(version.lines, version.discount))}</strong><p>{date(version.at, true)} · {version.decisionNote || 'Sem decisão registrada'}</p></div>)}</details></Section>}

    {preview && <QuoteDocument quote={quote} customer={customer} business={w.data.settings} onClose={() => setPreview(false)} />}
    {decision !== null && <Modal title={decision ? 'Registrar aprovação' : 'Registrar reprovação'} onClose={() => setDecision(null)}><RecordForm draftKey={`athena-budget-decision:${quote.id}`} fields={[{ name: 'note', label: operation.label('decisionNote', 'Como a decisão do cliente foi recebida?'), type: 'textarea', required: true, wide: true }]} onClose={() => setDecision(null)} submit={decision ? 'Confirmar aprovação' : 'Confirmar reprovação'} onSave={form => mutateQuote(current => decideQuote(current, decision, form.note), 'Decisão registrada.')} /></Modal>}
    {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => mutateQuote(current => reviseQuote(current), 'Nova versão aberta.')}>A versão atual será preservada no histórico. A nova versão volta a rascunho para revisão e novo envio.</Confirm>}
  </>;
}
