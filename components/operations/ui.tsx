'use client';

import { Children, Fragment, isValidElement, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, FileDown, Plus, Search, X } from 'lucide-react';
import {
  AppId, Customer, Data, Event, Line, Quote, advanceJob, date, decideQuote, effectiveQuoteStatus,
  money, normalize, now, reviseQuote, sendQuote, total, uid
} from '@/lib/operations/model';
import { learnLineSuggestions, type LineSuggestion } from '@/lib/operations/learning';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { CompactTabs, CompactPanel } from './CompactTabs';
import { ErrorContext } from './errors';
import { Workspace, csv, useCurrentWorkspace } from '@/lib/operations/storage';

export function Button({ children, onClick, variant = '', type = 'button', disabled = false, title }: { children: ReactNode; onClick?: () => void; variant?: string; type?: 'button' | 'submit'; disabled?: boolean; title?: string }) {
  return <button className={`op-button ${variant}`} type={type} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}
export function Empty({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <div className="op-empty">{icon}<p>{children}</p>{action}</div>;
}
export function Title({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="op-title"><div>{eyebrow && <span className="op-kicker">{eyebrow}</span>}<h1>{title}</h1>{children && <p>{children}</p>}</div>{action && <div className="op-actions">{action}</div>}</div>;
}
export function Section({ title, children, action, className = '' }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`op-section ${className}`}><div className="op-section-head"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`op-badge ${tone}`}>{children}</span>;
}
export function SearchBox({ value, onChange, placeholder = 'Buscar' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="op-search"><Search size={18} /><input aria-label={placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const error = useContext(ErrorContext);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`op-dialog ${wide ? 'wide' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2 id={id}>{title}</h2><button type="button" className="op-icon" onClick={onClose} aria-label="Fechar"><X size={21} /></button></header>
    {error && <p className="op-error" role="alert">{error}</p>}
    {children}
  </dialog>;
}
export function Confirm({ title, children, onClose, onConfirm, label = 'Confirmar' }: { title: string; children: ReactNode; onClose: () => void; onConfirm: () => Promise<boolean> | boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose}><p>{children}</p><div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Voltar</Button><Button disabled={busy} onClick={async () => { setBusy(true); if (await onConfirm()) onClose(); setBusy(false); }}>{label}</Button></div></Modal>;
}

export type FieldDef = { name: string; label: string; type?: string; required?: boolean; options?: { value: string; label: string }[]; suggestions?: string[]; value?: string | number; wide?: boolean; min?: string | number; step?: string | number; hint?: string };

function readDraft(key: string | undefined) {
  if (!key || typeof window === 'undefined') return {} as Record<string, string>;
  try { return JSON.parse(sessionStorage.getItem(`crmplus:draft:${key}`) || '{}') as Record<string, string>; } catch { return {}; }
}

export function RecordForm({ fields, onSave, onClose, submit = 'Salvar', children, draftKey }: { fields: FieldDef[]; onSave: (values: Record<string, string>) => Promise<boolean>; onClose: () => void; submit?: string; children?: ReactNode; draftKey?: string }) {
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const savedDraft = useMemo(() => readDraft(draftKey), [draftKey]);
  const clearDraft = () => { if (draftKey && typeof window !== 'undefined') sessionStorage.removeItem(`crmplus:draft:${draftKey}`); };
  const close = () => onClose();
  return <form
    onChange={event => {
      if (!draftKey) return;
      const form = event.currentTarget;
      sessionStorage.setItem(`crmplus:draft:${draftKey}`, JSON.stringify(Object.fromEntries(new FormData(form))));
    }}
    onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
      setBusy(true);
      try {
        if (await onSave(values)) { clearDraft(); onClose(); }
      } finally { setBusy(false); }
    }}
  >
    <div className="op-fields">{fields.map(field => {
      const initial = savedDraft[field.name] ?? field.value;
      const listId = field.suggestions?.length ? `${formId}-${field.name}` : undefined;
      return <label key={field.name} className={`op-field ${field.wide ? 'span-full' : ''}`}>
        <span>{field.label}{field.required ? ' *' : ''}</span>
        {field.options
          ? <select name={field.name} defaultValue={initial} required={field.required}>{!initial && <option value="">Selecionar</option>}{field.options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
          : field.type === 'textarea'
            ? <textarea name={field.name} defaultValue={initial} required={field.required} rows={3} />
            : <><input name={field.name} list={listId} type={field.type || 'text'} defaultValue={initial} required={field.required} min={field.min} step={field.step} maxLength={field.type === 'number' ? undefined : 2000} />{listId && <datalist id={listId}>{field.suggestions!.map(value => <option value={value} key={value} />)}</datalist>}</>}
        {field.hint && <small>{field.hint}</small>}
      </label>;
    })}</div>
    {children}
    {draftKey && Object.keys(savedDraft).length > 0 && <p className="op-muted">Rascunho recuperado automaticamente neste dispositivo.</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={close}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : submit}</Button></div>
  </form>;
}

export function Timeline({ events }: { events: Event[] }) {
  return <ol className="op-timeline">{[...events].reverse().map(item => <li key={item.id}><span>{item.text}</span><time>{date(item.at, true)}</time></li>)}</ol>;
}

export function CustomerManager({ w, title = 'Clientes', onOpen }: { w: Workspace; title?: string; onOpen?: (c: Customer) => ReactNode }) {
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const current = edit && edit !== 'new' ? edit : null;
  const sections = (node: ReactNode): ReactNode[] => Children.toArray(node).flatMap(child => isValidElement<{children?: ReactNode}>(child) && child.type === Fragment ? sections(child.props.children) : [child]);
  const detailSections = detail && onOpen ? sections(onOpen(detail)) : [];
  const detailTabs = detailSections.map((content, index) => ({id:`section-${index}`,label:isValidElement<{title?: string}>(content) ? content.props.title || 'Histórico' : 'Histórico'}));
  return <>
    <Title eyebrow="Relacionamento" title={title} action={<Button onClick={() => setEdit('new')}><Plus size={18} />Novo cliente</Button>} />
    <SearchBox value={query} onChange={setQuery} placeholder="Buscar por nome, telefone ou e-mail" />
    <section className="op-list">{w.data.customers.filter(customer => (`${customer.name} ${customer.phone} ${customer.email}`).toLowerCase().includes(query.toLowerCase())).map(customer => <button className="op-row" key={customer.id} onClick={() => setDetail(customer)}><span className="op-avatar">{customer.name.slice(0, 2).toUpperCase()}</span><span className="op-grow"><strong>{customer.name}</strong><small>{customer.phone || 'Sem telefone'}{customer.email && ` · ${customer.email}`}</small></span><ArrowRight size={18} /></button>)}{!w.data.customers.length && <Empty>Cadastre o primeiro cliente para iniciar o histórico.</Empty>}</section>
    {edit && <Modal title={current ? 'Editar cliente' : 'Novo cliente'} onClose={() => setEdit(null)}><RecordForm draftKey={`customer:${current?.id || 'new'}`} fields={[{ name: 'name', label: 'Nome ou razão social', required: true, value: current?.name, wide: true }, { name: 'phone', label: 'Telefone', type: 'tel', value: current?.phone }, { name: 'email', label: 'E-mail', type: 'email', value: current?.email }, { name: 'notes', label: 'Observações', type: 'textarea', wide: true, value: current?.notes }]} onClose={() => setEdit(null)} onSave={values => w.mutate(data => {
      if (!values.name.trim()) throw new Error('Informe o nome.');
      const record = { id: current?.id || uid(), ...values } as Customer;
      const index = data.customers.findIndex(item => item.id === record.id);
      if (index < 0) data.customers.push(record); else data.customers[index] = record;
      setDetail(null);
    })} /></Modal>}
    {detail && <Modal title={detail.name} onClose={() => setDetail(null)} wide><CompactTabs label="Ficha do cliente" tabs={[{id:'dados',label:'Dados'},...detailTabs]}><CompactPanel value="dados"><div className="op-detail-pairs"><div><span>Telefone</span><strong>{detail.phone || 'Não informado'}</strong></div><div><span>E-mail</span><strong>{detail.email || 'Não informado'}</strong></div></div>{detail.notes && <p>{detail.notes}</p>}</CompactPanel>{detailSections.map((content,index) => <CompactPanel key={index} value={`section-${index}`}>{content}</CompactPanel>)}</CompactTabs><div className="op-form-footer"><Button variant="secondary" onClick={() => { setEdit(detail); setDetail(null); }}>Editar cadastro</Button></div></Modal>}
  </>;
}

export function LineEditor({ lines, onChange, disabled = false, parts = false, showBrand = true, customerId = '' }: { lines: Line[]; onChange: (l: Line[]) => void; disabled?: boolean; parts?: boolean; showBrand?: boolean; customerId?: string }) {
  const workspace = useCurrentWorkspace();
  const listId = useId();
  const suggestions = workspace ? learnLineSuggestions(workspace.data, workspace.app, customerId) : [];
  const patch = (id: string, key: string, value: unknown) => onChange(lines.map(line => line.id === id ? { ...line, [key]: value } : line));
  const applySuggestion = (id: string, suggestion: LineSuggestion, description = suggestion.description) => onChange(lines.map(line => line.id === id ? {
    ...line,
    description,
    kind: suggestion.kind,
    brand: suggestion.brand,
    price: suggestion.price,
    productId: suggestion.productId
  } : line));
  const changeDescription = (id: string, value: string) => {
    const suggestion = suggestions.find(item => normalize(item.description) === normalize(value));
    if (suggestion) applySuggestion(id, suggestion, value);
    else patch(id, 'description', value);
  };
  const addSuggestion = (suggestion: LineSuggestion) => {
    const blankIndex = lines.findIndex(line => !line.description.trim());
    const next: Line = { id: blankIndex >= 0 ? lines[blankIndex].id : uid(), kind: suggestion.kind, description: suggestion.description, brand: suggestion.brand, quantity: 1, price: suggestion.price, productId: suggestion.productId };
    if (blankIndex >= 0) onChange(lines.map((line, index) => index === blankIndex ? next : line));
    else onChange([...lines, next]);
  };
  return <div className="op-line-editor">
    {!disabled && suggestions.length > 0 && <div className="op-callout"><strong>Sugestões aprendidas nesta conta</strong><span> Itens repetidos priorizam o histórico deste cliente e usam o último preço praticado como sugestão. Você continua podendo alterar tudo antes de salvar.</span><div className="op-actions">{suggestions.slice(0, 5).map(item => <button key={`${item.kind}:${item.description}:${item.brand}`} type="button" className="op-text-link" onClick={() => addSuggestion(item)}>{item.description}{item.brand ? ` · ${item.brand}` : ''} · {money(item.price)}</button>)}</div></div>}
    {suggestions.length > 0 && <datalist id={listId}>{suggestions.map(item => <option key={`${item.kind}:${item.description}:${item.brand}`} value={item.description}>{item.brand ? `${item.brand} · ` : ''}{money(item.price)} · usado {item.occurrences}x</option>)}</datalist>}
    <div className="op-line-head"><span>Descrição do item</span><span>Quantidade</span><span>Valor unitário</span><span>Total</span></div>
    {lines.map((line, index) => <div className="op-line" key={line.id}>
      <div>
        {parts && <select aria-label={`Tipo do item ${index + 1}`} value={line.kind} disabled={disabled} onChange={event => patch(line.id, 'kind', event.target.value)}><option>Serviço</option><option>Peça</option></select>}
        <input list={suggestions.length ? listId : undefined} aria-label={`Descrição do item ${index + 1}`} placeholder="Descrição" value={line.description} disabled={disabled} required onChange={event => changeDescription(line.id, event.target.value)} />
        {line.kind === 'Peça' && showBrand && <input aria-label={`Marca do item ${index + 1}`} placeholder="Marca" disabled={disabled} value={line.brand} onChange={event => patch(line.id, 'brand', event.target.value)} />}
      </div>
      <label><span className="mobile-label">Quantidade</span><input type="number" aria-label={`Quantidade do item ${index + 1}`} min="0.01" step="0.01" value={line.quantity} disabled={disabled} onChange={event => patch(line.id, 'quantity', Number(event.target.value))} /></label>
      <label><span className="mobile-label">Valor unitário</span><input type="number" aria-label={`Preço do item ${index + 1}`} min="0" step="0.01" value={line.price / 100} disabled={disabled} onChange={event => patch(line.id, 'price', Math.round(Number(event.target.value) * 100))} /></label>
      <strong>{money(Math.round(line.price * line.quantity))}</strong>
      {!disabled && <button type="button" className="op-icon" aria-label={`Remover item ${index + 1}`} onClick={() => onChange(lines.filter(item => item.id !== line.id))}><X size={16} /></button>}
    </div>)}
    {!disabled && <Button variant="secondary" onClick={() => onChange([...lines, { id: uid(), kind: 'Serviço', description: '', brand: '', quantity: 1, price: 0 }])}><Plus size={16} />Adicionar item</Button>}
  </div>;
}

export function QuoteEditor({ quote, onSave, onSaveAndSend, onClose, parts = false, app = 'athena-orcamentos' }: { quote: Quote; onSave: (q: Quote) => Promise<boolean>; onSaveAndSend?: (q: Quote) => Promise<boolean>; onClose: () => void; parts?: boolean; app?: AppId }) {
  const operation = useOperationPreferences(app);
  const [draft, setDraft] = useState(() => structuredClone(quote));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  let sum = 0;
  try { sum = total(draft.lines, draft.discount); } catch {}
  const validate = () => {
    total(draft.lines, draft.discount);
    if (!draft.lines.length) throw new Error('Adicione ao menos um item.');
  };
  const run = async (action: (q: Quote) => Promise<boolean>) => {
    setError('');
    try {
      validate();
      setBusy(true);
      if (await action(draft)) onClose();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  };
  return <form onSubmit={event => { event.preventDefault(); if (!busy) void run(onSave); }}>
    <div className="op-fields">
      <label className="op-field"><span>{operation.label('quoteTitle', 'Título')}</span><input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="op-field"><span>{operation.label('validUntil', 'Validade')}</span><input type="date" required value={draft.validUntil} onChange={event => setDraft({ ...draft, validUntil: event.target.value })} /></label>
    </div>
    <LineEditor lines={draft.lines} onChange={lines => setDraft({ ...draft, lines })} parts={parts} showBrand={operation.fieldVisible('partBrand')} customerId={draft.customerId} />
    <div className="op-quote-total">
      {operation.fieldVisible('discount') && <label className="op-field"><span>{operation.label('discount', 'Desconto')} (R$)</span><input type="number" min="0" step="0.01" value={draft.discount / 100} onChange={event => setDraft({ ...draft, discount: Math.round(Number(event.target.value) * 100) })} /></label>}
      <div><small>Total</small><strong>{money(sum)}</strong></div>
    </div>
    {operation.fieldVisible('customerNotes') && <label className="op-field"><span>{operation.label('customerNotes', 'Observações para o cliente')}</span><textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>}
    {error && <p className="op-error" role="alert">{error}</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : onSaveAndSend ? 'Salvar rascunho' : 'Salvar orçamento'}</Button>{onSaveAndSend && <Button disabled={busy} onClick={() => { if (!busy) void run(onSaveAndSend); }}>{busy ? 'Salvando…' : 'Salvar e marcar como enviado'}</Button>}</div>
  </form>;
}

export function QuoteDocument({ quote, customer, business, onClose }: { quote: Quote; customer?: Customer; business: Data['settings']; onClose: () => void }) {
  const status = effectiveQuoteStatus(quote);
  return <Modal title="Documento do orçamento" onClose={onClose} wide><div className="op-print-document"><span className="op-kicker">{business.business || 'Orçamento'}</span><h2>{quote.title || `Orçamento ${String(quote.number).padStart(4, '0')}`}</h2><p>{business.phone} {business.email}</p><div className="op-detail-pairs"><div><span>Cliente</span><strong>{customer?.name || 'Não informado'}</strong></div><div><span>Validade · versão {quote.version}</span><strong>{date(quote.validUntil)}</strong></div></div><div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span>{line.description}{line.brand && ` · ${line.brand}`}<small>{line.quantity} × {money(line.price)}</small></span><strong>{money(Math.round(line.quantity * line.price))}</strong></div>)}</div>{quote.discount > 0 && <p>Desconto: {money(quote.discount)}</p>}<div className="op-document-total"><span>Total</span><strong>{money(total(quote.lines, quote.discount))}</strong></div><p>{quote.notes}</p><p className="op-muted">{status} · {date(quote.createdAt)}</p></div><div className="op-form-footer"><Button onClick={() => window.print()}><FileDown size={16} />Imprimir / salvar PDF</Button></div></Modal>;
}

export function QuotePanel({ w, quote, jobId }: { w: Workspace; quote: Quote; jobId?: string }) {
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(false);
  const status = effectiveQuoteStatus(quote);
  const apply = (data: Data, fn: (q: Quote) => void) => {
    const current = jobId ? data.jobs.find(job => job.id === jobId)!.quote : data.quotes.find(item => item.id === quote.id)!;
    fn(current);
  };
  const saveAndSend = (draft: Quote) => w.mutate(data => apply(data, current => {
    if (current.status !== 'Rascunho') throw new Error('A versão foi alterada. Reabra o orçamento.');
    Object.assign(current, draft);
    sendQuote(current);
    if (jobId) {
      const job = data.jobs.find(item => item.id === jobId)!;
      job.status = 'Aguardando aprovação';
      job.stage = 'Orçamento';
      job.events.push({ id: uid(), at: now(), text: 'Orçamento salvo e marcado como enviado' });
    }
  }), 'Orçamento salvo e enviado para decisão.');
  return <>
    <div className="op-section-head"><div><Badge tone={status === 'Expirado' ? 'warning' : ''}>{status}</Badge><span className="op-muted"> Versão {quote.version}</span></div><strong className="op-price">{money(total(quote.lines, quote.discount))}</strong></div>
    {status === 'Expirado' && <p className="op-callout">A validade encerrou. A decisão foi bloqueada para evitar aprovar uma versão vencida; abra uma nova versão para atualizar a validade ou os valores.</p>}
    {quote.lines.length ? <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind} {line.brand} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div> : <Empty>Inclua os serviços e as peças deste orçamento.</Empty>}
    <div className="op-actions">
      {quote.status === 'Rascunho' ? <><Button onClick={() => setEdit(true)}>{quote.lines.length ? 'Editar orçamento' : 'Montar orçamento'}</Button><Button variant="secondary" disabled={!quote.lines.length} onClick={() => w.mutate(data => apply(data, current => { sendQuote(current); if (jobId) { const job = data.jobs.find(item => item.id === jobId)!; job.status = 'Aguardando aprovação'; job.stage = 'Orçamento'; job.events.push({ id: uid(), at: now(), text: 'Orçamento marcado como enviado' }); } }))}>Marcar como enviado</Button></>
        : <><Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar validade / nova versão' : 'Nova versão'}</Button>{status === 'Enviado' && <><Button onClick={() => setDecision(true)}>{jobId ? 'Aprovar e iniciar execução' : 'Registrar aprovação'}</Button><Button variant="secondary" onClick={() => setDecision(false)}>Registrar reprovação</Button></>}</>}
      {quote.lines.length > 0 && <Button variant="secondary" onClick={() => setPreview(true)}>Ver documento</Button>}
    </div>
    {quote.versions && quote.versions.length > 0 && <details className="op-version-history"><summary>Versões anteriores ({quote.versions.length})</summary>{quote.versions.map(version => <div key={version.version}><strong>Versão {version.version} · {version.status} · {money(total(version.lines, version.discount))}</strong><p>{date(version.at, true)} · {version.decisionNote || 'Sem decisão registrada'}</p>{version.lines.map(line => <div className="op-row" key={line.id}><span className="op-grow">{line.description} {line.brand}</span><span>{line.quantity} × {money(line.price)}</span></div>)}</div>)}</details>}
    {quote.decisionNote && <p className="op-callout">Decisão registrada pelo operador em {date(quote.decisionAt!, true)}: {quote.decisionNote}</p>}
    {edit && <Modal title="Montar orçamento" wide onClose={() => setEdit(false)}><QuoteEditor quote={quote} app="zeus" parts onClose={() => setEdit(false)} onSave={draft => w.mutate(data => apply(data, current => { if (current.status !== 'Rascunho') throw new Error('A versão foi alterada. Reabra o orçamento.'); Object.assign(current, draft); }), 'Orçamento salvo.')} onSaveAndSend={saveAndSend} /></Modal>}
    {preview && <QuoteDocument quote={quote} customer={w.data.customers.find(customer => customer.id === quote.customerId)} business={w.data.settings} onClose={() => setPreview(false)} />}
    {decision !== null && <Modal title={decision ? 'Registrar aprovação recebida' : 'Registrar reprovação recebida'} onClose={() => setDecision(null)}><p>Confirme a decisão recebida do cliente. O registro identificará que foi feito por você.</p><RecordForm draftKey={`quote-decision:${quote.id}`} fields={[{ name: 'note', label: 'Como e quando o cliente confirmou?', type: 'textarea', required: true, wide: true }]} onClose={() => setDecision(null)} submit={decision && jobId ? 'Confirmar e iniciar execução' : 'Confirmar decisão'} onSave={values => w.mutate(data => apply(data, current => {
      decideQuote(current, decision, values.note);
      if (jobId) {
        const job = data.jobs.find(item => item.id === jobId)!;
        job.status = decision ? 'Em andamento' : 'Reprovado';
        job.events.push({ id: uid(), at: now(), text: `Decisão do orçamento: ${current.status}` });
        if (decision && job.stage === 'Orçamento') advanceJob(data, job.id, 'Orçamento');
      }
    }), decision && jobId ? 'Orçamento aprovado e execução iniciada.' : 'Decisão registrada.')} /></Modal>}
    {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => w.mutate(data => apply(data, current => { reviseQuote(current); if (jobId) { const job = data.jobs.find(item => item.id === jobId)!; if (!['Encerrado', 'Cancelado'].includes(job.status)) { job.stage = 'Orçamento'; job.status = 'Em andamento'; } } }))}>A versão atual ficará no histórico. A nova versão precisará de outra aprovação.</Confirm>}
  </>;
}

export const customerOptions = (d: Data) => d.customers.map(customer => ({ value: customer.id, label: customer.name }));
export function exportCustomers(d: Data) { csv('clientes.csv', [['Nome', 'Telefone', 'E-mail'], ...d.customers.map(customer => [customer.name, customer.phone, customer.email])]); }
