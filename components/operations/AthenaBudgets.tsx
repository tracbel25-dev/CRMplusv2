'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, FileDown, FileText, Plus } from 'lucide-react';
import {
  Line, Quote, blankQuote, customValues, date, decideQuote, effectiveQuoteStatus, event,
  localDay, money, nextNumber, reviseQuote, sendQuote, setCustomValues, total, uid
} from '@/lib/operations/model';
import { customerSuggestions, resolveCustomer } from '@/lib/operations/customers';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, CustomerManager, Empty, LineEditor, Modal, QuoteDocument,
  QuoteEditor, SearchBox, Section, Timeline, Title
} from './ui';
import { WorkflowControl } from './WorkflowControl';
import { useRecordRoute } from './useRecordRoute';

export function Budgets({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useRecordRoute(recordId, '/athena-orcamentos/orcamentos');
  const [filter, setFilter] = useState('Todos');
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [revision, setRevision] = useState(false);
  const quote = w.data.quotes.find(item => item.id === selected);
  const quotes = w.data.quotes.filter(item => {
    const status = effectiveQuoteStatus(item);
    return `${item.title} ${item.number} ${w.data.customers.find(customer => customer.id === item.customerId)?.name}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'Todos' || status === filter);
  });

  const mutateQuote = (id: string, fn: (value: Quote) => void, message?: string) => w.mutate(data => {
    const current = data.quotes.find(item => item.id === id);
    if (!current) throw new Error('Orçamento não encontrado.');
    fn(current);
  }, message);

  if (page === 'clientes') return <CustomerManager w={w} onOpen={customer => <Section title="Orçamentos do cliente">{w.data.quotes.filter(item => item.customerId === customer.id).map(item => <div className="op-row" key={item.id}><strong>{item.title || `Orçamento ${item.number}`}</strong><Badge>{effectiveQuoteStatus(item)}</Badge><strong>{money(total(item.lines, item.discount))}</strong></div>)}</Section>} />;

  if (quote) {
    const status = effectiveQuoteStatus(quote);
    const final = ['Aprovado', 'Reprovado', 'Expirado'].includes(status);
    const steps = final ? ['Rascunho', 'Enviado', status] : ['Rascunho', 'Enviado', 'Decisão'];
    const currentStep = final ? status : quote.status === 'Enviado' ? 'Enviado' : 'Rascunho';
    const custom = operation.preferences.customFields.filter(field => field.visible && ['Orçamento', 'Condições', 'Aprovação', 'Cliente'].includes(field.group));
    const values = customValues(w.data, quote.id);
    return <>
      <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar aos orçamentos</Button>
      <Title eyebrow={`Orçamento ${String(quote.number).padStart(4, '0')} · versão ${quote.version}`} title={quote.title || 'Novo orçamento'} action={quote.lines.length > 0 && operation.actionVisible('document') ? <Button variant="secondary" onClick={() => setPreview(true)}>Ver documento</Button> : undefined}>{w.data.customers.find(customer => customer.id === quote.customerId)?.name}</Title>
      <WorkflowControl label="Fluxo da proposta" steps={steps} current={currentStep} status={status} nextLabel={quote.status === 'Rascunho' && operation.actionVisible('quickAdvance') ? 'Marcar como enviado' : undefined} onNext={quote.status === 'Rascunho' ? () => { void mutateQuote(quote.id, current => sendQuote(current), 'Orçamento marcado como enviado.'); } : undefined} actions={<>{status === 'Enviado' && operation.actionVisible('decision') && <><Button onClick={() => { setDecisionNote(''); setDecision(true); }}>Registrar aprovação</Button><Button variant="secondary" onClick={() => { setDecisionNote(''); setDecision(false); }}>Registrar reprovação</Button></>}{quote.status !== 'Rascunho' && operation.actionVisible('revision') && <Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar validade / nova versão' : 'Nova versão'}</Button>}</>} />
      {status === 'Expirado' && <p className="op-callout">Esta proposta venceu. Revise a validade ou crie uma nova versão antes de registrar uma decisão.</p>}
      <div className="budget-workspace"><Section title="Proposta comercial" action={quote.status === 'Rascunho' && operation.actionVisible('edit') ? <Button onClick={() => setEdit(true)}>{quote.lines.length ? 'Editar proposta' : 'Montar proposta'}</Button> : undefined}>
        {quote.lines.length ? <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind}{line.brand ? ` · ${line.brand}` : ''} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div> : <Empty>Inclua os itens desta proposta.</Empty>}
        <div className="op-quote-total"><div><small>Total</small><strong>{money(total(quote.lines, quote.discount))}</strong></div></div>{quote.notes && <p>{quote.notes}</p>}
        {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
      </Section><aside className="budget-context"><span className="op-kicker">Acompanhe a decisão</span><h2>Um documento.<br />Toda a conversa.</h2><p>Validade: {date(quote.validUntil)}</p><p>Criado em {date(quote.createdAt)}</p>{quote.decisionNote && <p className="op-callout">Decisão: {quote.decisionNote}</p>}<Timeline events={quote.events} /></aside></div>
      {edit && <Modal title="Editar orçamento" wide onClose={() => setEdit(false)}><QuoteEditor app="athena-orcamentos" quote={quote} onClose={() => setEdit(false)} onSave={draft => mutateQuote(quote.id, current => { if (current.status !== 'Rascunho') throw new Error('Crie uma nova versão para alterar este orçamento.'); Object.assign(current, draft); current.events.push(event('Orçamento atualizado')); }, 'Orçamento salvo.')} /></Modal>}
      {preview && <QuoteDocument quote={quote} customer={w.data.customers.find(customer => customer.id === quote.customerId)} business={w.data.settings} onClose={() => setPreview(false)} />}
      {decision !== null && <Modal title={decision ? 'Registrar aprovação' : 'Registrar reprovação'} onClose={() => setDecision(null)}><label className="op-field"><span>Como a decisão do cliente foi recebida? *</span><textarea value={decisionNote} onChange={event => setDecisionNote(event.target.value)} /></label><div className="op-form-footer"><Button variant="secondary" onClick={() => setDecision(null)}>Cancelar</Button><Button disabled={!decisionNote.trim()} onClick={async () => { const ok = await mutateQuote(quote.id, current => decideQuote(current, decision, decisionNote), 'Decisão registrada.'); if (ok) setDecision(null); }}>Confirmar decisão</Button></div></Modal>}
      {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => mutateQuote(quote.id, current => reviseQuote(current), 'Nova versão aberta.')}>A versão atual será preservada no histórico e a nova versão precisará ser enviada e aprovada novamente.</Confirm>}
    </>;
  }

  return <>
    <Title eyebrow="Athena / Orçamentos" title={page === 'inicio' ? 'Propostas em andamento' : 'Seus orçamentos'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Criar orçamento</Button>} />
    {page === 'inicio' && <div className="op-report-totals"><div><span>Rascunhos</span><strong>{w.data.quotes.filter(item => item.status === 'Rascunho').length}</strong><small>Prontos para continuar a montagem.</small></div><div><span>Aguardando decisão</span><strong>{w.data.quotes.filter(item => effectiveQuoteStatus(item) === 'Enviado').length}</strong><small>Propostas enviadas dentro da validade.</small></div><div><span>Vencidos</span><strong>{w.data.quotes.filter(item => effectiveQuoteStatus(item) === 'Expirado').length}</strong><small>Precisam de revisão antes de uma decisão.</small></div></div>}
    <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar cliente, título ou número" /><select aria-label="Status do orçamento" value={filter} onChange={change => setFilter(change.target.value)}>{['Todos', 'Rascunho', 'Enviado', 'Aprovado', 'Reprovado', 'Expirado'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('document') && <Button variant="secondary" onClick={() => csv('orcamentos.csv', [['Número', 'Título', 'Cliente', 'Status', 'Versão', 'Validade', 'Total'], ...quotes.map(item => [item.number, item.title, w.data.customers.find(customer => customer.id === item.customerId)?.name, effectiveQuoteStatus(item), item.version, item.validUntil, (total(item.lines, item.discount) / 100).toFixed(2)])])}><FileDown size={16} />Exportar</Button>}</div>
    <div className="budget-register"><div className="budget-register-head"><span>Documento / cliente</span><span>Validade</span><span>Decisão</span><span>Total</span></div>{quotes.map(item => { const status = effectiveQuoteStatus(item); return <button className="budget-register-row" key={item.id} onClick={() => setSelected(item.id)}><div><span className="budget-number">{String(item.number).padStart(4, '0')}</span><strong>{item.title || 'Orçamento sem título'}</strong><small>{w.data.customers.find(customer => customer.id === item.customerId)?.name}</small></div><span>{item.validUntil ? date(item.validUntil) : 'Não definida'}{status === 'Expirado' && <small className="op-overdue">Validade encerrada · revisar versão</small>}</span><Badge tone={status === 'Expirado' ? 'warning' : ''}>{status}</Badge><strong>{money(total(item.lines, item.discount))}<ArrowRight size={17} /></strong></button>; })}</div>
    {!quotes.length && <Empty icon={<FileText size={28} />} action={<Button onClick={() => setCreate(true)}>Criar primeiro orçamento</Button>}>{query ? 'Nenhum orçamento corresponde à busca.' : 'Comece digitando o cliente e os itens da proposta.'}</Empty>}
    {create && <Modal title="Criar orçamento" wide onClose={() => setCreate(false)}><BudgetBuilder w={w} onClose={() => setCreate(false)} onCreated={id => setSelected(id)} /></Modal>}
  </>;
}

function BudgetBuilder({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<Line[]>([{ id: uid(), kind: 'Serviço', description: '', brand: '', quantity: 1, price: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const custom = operation.preferences.customFields.filter(field => field.visible && ['Orçamento', 'Condições', 'Cliente'].includes(field.group));
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const suggestions = customerSuggestions(w.data);
  let sum = 0;
  try { sum = total(lines, discount); } catch {}

  return <form onSubmit={async submit => {
    submit.preventDefault(); setError('');
    try {
      if (!customerName.trim()) throw new Error('Informe o cliente. Se não existir, ele será criado automaticamente.');
      if (!title.trim()) throw new Error('Informe o título da proposta.');
      if (!lines.length) throw new Error('Adicione ao menos um item.');
      total(lines, discount);
      if (!validUntil || validUntil < localDay()) throw new Error('Defina uma validade a partir de hoje.');
      setBusy(true);
      const ok = await w.mutate(data => {
        const customer = resolveCustomer(data, customerName, { phone: customerPhone });
        const next = blankQuote(nextNumber(data.quotes), customer.id);
        next.title = title.trim(); next.validUntil = validUntil; next.lines = structuredClone(lines); next.discount = discount; next.notes = notes; next.events.push(event('Orçamento criado e composição inicial salva'));
        data.quotes.push(next); setCustomValues(data, next.id, customDraft); onCreated(next.id);
      }, 'Orçamento criado.');
      if (ok) onClose();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }}>
    <div className="op-fields"><label className="op-field"><span>Cliente *</span><input list="athena-customer-suggestions" value={customerName} onChange={change => setCustomerName(change.target.value)} placeholder="Digite o nome ou empresa" /><datalist id="athena-customer-suggestions">{suggestions.map(value => <option value={value} key={value} />)}</datalist><small>Se já existir, a ficha é reaproveitada. Se não existir, é criada junto com o orçamento.</small></label><label className="op-field"><span>{operation.label('quoteTitle', 'Título da proposta')} *</span><input value={title} onChange={change => setTitle(change.target.value)} /></label><label className="op-field"><span>Telefone</span><input type="tel" value={customerPhone} onChange={change => setCustomerPhone(change.target.value)} /></label><label className="op-field"><span>{operation.label('validUntil', 'Validade')} *</span><input type="date" value={validUntil} onChange={change => setValidUntil(change.target.value)} /></label></div>
    <LineEditor lines={lines} onChange={setLines} />
    <div className="op-quote-total">{operation.fieldVisible('discount') && <label className="op-field"><span>{operation.label('discount', 'Desconto')} (R$)</span><input type="number" min="0" step="0.01" value={discount / 100} onChange={change => setDiscount(Math.round(Number(change.target.value) * 100))} /></label>}<div><small>Total</small><strong>{money(sum)}</strong></div></div>
    {operation.fieldVisible('customerNotes') && <label className="op-field"><span>{operation.label('customerNotes', 'Observações para o cliente')}</span><textarea value={notes} onChange={change => setNotes(change.target.value)} /></label>}
    {custom.length > 0 && <div className="op-fields">{custom.map(field => <label className="op-field" key={field.id}><span>{field.label}</span><input value={customDraft[field.id] || ''} onChange={change => setCustomDraft({ ...customDraft, [field.id]: change.target.value })} /></label>)}</div>}
    {error && <p className="op-error">{error}</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Criar proposta'}</Button></div>
  </form>;
}
