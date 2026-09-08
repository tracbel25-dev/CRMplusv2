'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, FileDown, FileText, MessageSquareText, Plus, X } from 'lucide-react';
import {
  Line, Question, Quote, Survey, blankQuote, cents, customValues, date, decideQuote,
  effectiveQuoteStatus, event, isNumericQuestion, isZeroToTenQuestion, localDay, money,
  nextNumber, now, reviseQuote, sendQuote, setCustomValues, total, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, CustomerManager, Empty, LineEditor, Modal, QuoteDocument,
  QuoteEditor, RecordForm, SearchBox, Section, Timeline, Title, customerOptions
} from './ui';
import { WorkflowControl } from './WorkflowControl';

export function Budgets({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState(recordId);
  const [filter, setFilter] = useState('Todos');
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
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

      <WorkflowControl
        label="Fluxo da proposta"
        steps={steps}
        current={currentStep}
        status={status}
        nextLabel={quote.status === 'Rascunho' && operation.actionVisible('quickAdvance') ? 'Marcar como enviado' : undefined}
        onNext={quote.status === 'Rascunho' ? () => { void mutateQuote(quote.id, current => sendQuote(current), 'Orçamento marcado como enviado.'); } : undefined}
        actions={<>
          {status === 'Enviado' && operation.actionVisible('decision') && <><Button onClick={() => setDecision(true)}>Registrar aprovação</Button><Button variant="secondary" onClick={() => setDecision(false)}>Registrar reprovação</Button></>}
          {quote.status !== 'Rascunho' && operation.actionVisible('revision') && <Button variant="secondary" onClick={() => setRevision(true)}>{status === 'Expirado' ? 'Revisar validade / nova versão' : 'Nova versão'}</Button>}
        </>}
      />

      {status === 'Expirado' && <p className="op-callout">Esta proposta venceu. A decisão foi bloqueada imediatamente para não aprovar uma versão fora da validade. Revise a validade ou crie uma nova versão.</p>}

      <div className="budget-workspace">
        <Section title="Proposta comercial" action={quote.status === 'Rascunho' && operation.actionVisible('edit') ? <Button onClick={() => setEdit(true)}>{quote.lines.length ? 'Editar proposta' : 'Montar proposta'}</Button> : undefined}>
          {quote.lines.length ? <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind}{line.brand ? ` · ${line.brand}` : ''} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div> : <Empty>Inclua os itens desta proposta.</Empty>}
          <div className="op-quote-total"><div><small>Total</small><strong>{money(total(quote.lines, quote.discount))}</strong></div></div>
          {quote.notes && <p>{quote.notes}</p>}
          {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
          {quote.versions && quote.versions.length > 0 && <details className="op-version-history"><summary>Versões anteriores ({quote.versions.length})</summary>{quote.versions.map(version => <div key={version.version}><strong>Versão {version.version} · {version.status} · {money(total(version.lines, version.discount))}</strong><p>{date(version.at, true)} · {version.decisionNote || 'Sem decisão registrada'}</p></div>)}</details>}
        </Section>
        <aside className="budget-context"><span className="op-kicker">Acompanhe a decisão</span><h2>Um documento.<br />Toda a conversa.</h2><p>Validade: {date(quote.validUntil)}</p><p>Criado em {date(quote.createdAt)}</p>{quote.decisionNote && <p className="op-callout">Decisão: {quote.decisionNote}</p>}<Timeline events={quote.events} /></aside>
      </div>

      {edit && <Modal title="Editar orçamento" wide onClose={() => setEdit(false)}><QuoteEditor app="athena-orcamentos" quote={quote} onClose={() => setEdit(false)} onSave={draft => mutateQuote(quote.id, current => { if (current.status !== 'Rascunho') throw new Error('Crie uma nova versão para alterar este orçamento.'); Object.assign(current, draft); current.events.push(event('Orçamento atualizado')); }, 'Orçamento salvo.')} /></Modal>}
      {preview && <QuoteDocument quote={quote} customer={w.data.customers.find(customer => customer.id === quote.customerId)} business={w.data.settings} onClose={() => setPreview(false)} />}
      {decision !== null && <Modal title={decision ? 'Registrar aprovação' : 'Registrar reprovação'} onClose={() => setDecision(null)}><RecordForm draftKey={`athena-budget-decision:${quote.id}`} fields={[{ name: 'note', label: operation.label('decisionNote', 'Como a decisão do cliente foi recebida?'), type: 'textarea', required: true, wide: true }]} onClose={() => setDecision(null)} submit={decision ? 'Confirmar aprovação' : 'Confirmar reprovação'} onSave={form => mutateQuote(quote.id, current => decideQuote(current, decision, form.note), 'Decisão registrada.')} /></Modal>}
      {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => mutateQuote(quote.id, current => reviseQuote(current), 'Nova versão aberta.')}>A versão atual será preservada no histórico e a nova versão precisará ser enviada e aprovada novamente.</Confirm>}
    </>;
  }

  return <>
    <Title eyebrow="Athena / Orçamentos" title={page === 'inicio' ? 'Propostas em andamento' : 'Seus orçamentos'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Criar orçamento</Button>} />
    {page === 'inicio' && <div className="op-report-totals"><div><span>Rascunhos</span><strong>{w.data.quotes.filter(item => item.status === 'Rascunho').length}</strong><small>Prontos para continuar a montagem.</small></div><div><span>Aguardando decisão</span><strong>{w.data.quotes.filter(item => effectiveQuoteStatus(item) === 'Enviado').length}</strong><small>Propostas enviadas dentro da validade.</small></div><div><span>Vencidos</span><strong>{w.data.quotes.filter(item => effectiveQuoteStatus(item) === 'Expirado').length}</strong><small>Precisam de revisão antes de uma decisão.</small></div></div>}
    <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar cliente, título ou número" /><select aria-label="Status do orçamento" value={filter} onChange={change => setFilter(change.target.value)}>{['Todos', 'Rascunho', 'Enviado', 'Aprovado', 'Reprovado', 'Expirado'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('document') && <Button variant="secondary" onClick={() => csv('orcamentos.csv', [['Número', 'Título', 'Cliente', 'Status', 'Versão', 'Validade', 'Total'], ...quotes.map(item => [item.number, item.title, w.data.customers.find(customer => customer.id === item.customerId)?.name, effectiveQuoteStatus(item), item.version, item.validUntil, (total(item.lines, item.discount) / 100).toFixed(2)])])}><FileDown size={16} />Exportar</Button>}</div>
    <div className="budget-register"><div className="budget-register-head"><span>Documento / cliente</span><span>Validade</span><span>Decisão</span><span>Total</span></div>{quotes.map(item => { const status = effectiveQuoteStatus(item); return <button className="budget-register-row" key={item.id} onClick={() => setSelected(item.id)}><div><span className="budget-number">{String(item.number).padStart(4, '0')}</span><strong>{item.title || 'Orçamento sem título'}</strong><small>{w.data.customers.find(customer => customer.id === item.customerId)?.name}</small></div><span>{item.validUntil ? date(item.validUntil) : 'Não definida'}{status === 'Expirado' && <small className="op-overdue">Validade encerrada · revisar versão</small>}</span><Badge tone={status === 'Expirado' ? 'warning' : ''}>{status}</Badge><strong>{money(total(item.lines, item.discount))}<ArrowRight size={17} /></strong></button>; })}</div>
    {!quotes.length && <Empty icon={<FileText size={28} />} action={<Button onClick={() => setCreate(true)}>Criar primeiro orçamento</Button>}>{query ? 'Nenhum orçamento corresponde à busca.' : 'Comece pelo cliente e pelos itens da proposta.'}</Empty>}
    {create && <Modal title="Criar orçamento" wide onClose={() => setCreate(false)}><BudgetBuilder w={w} onClose={() => setCreate(false)} onCreated={id => setSelected(id)} /></Modal>}
  </>;
}

function BudgetBuilder({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [customerId, setCustomerId] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [title, setTitle] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [lines, setLines] = useState<Line[]>([{ id: uid(), kind: 'Serviço', description: '', brand: '', quantity: 1, price: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const custom = operation.preferences.customFields.filter(field => field.visible && ['Orçamento', 'Condições', 'Cliente'].includes(field.group));
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  let sum = 0;
  try { sum = total(lines, discount); } catch {}

  return <form onSubmit={async submit => {
    submit.preventDefault(); setError('');
    try {
      if (!title.trim()) throw new Error('Informe o título da proposta.');
      if (!lines.length) throw new Error('Adicione ao menos um item.');
      total(lines, discount);
      if (!validUntil || validUntil < localDay()) throw new Error('Defina uma validade a partir de hoje.');
      if (!customerId && !newCustomer) throw new Error('Selecione um cliente ou cadastre um novo neste fluxo.');
      if (newCustomer && !customerName.trim()) throw new Error('Informe o nome do novo cliente.');
      setBusy(true);
      const ok = await w.mutate(data => {
        let cid = customerId;
        if (newCustomer) {
          const phone = customerPhone.replace(/\D/g, '');
          const existing = phone ? data.customers.find(customer => customer.phone.replace(/\D/g, '') === phone) : undefined;
          if (existing) cid = existing.id;
          else { cid = uid(); data.customers.push({ id: cid, name: customerName.trim(), phone: customerPhone.trim(), email: '', notes: '' }); }
        }
        if (!data.customers.some(customer => customer.id === cid)) throw new Error('Cliente inválido.');
        const next = blankQuote(nextNumber(data.quotes), cid);
        next.title = title.trim(); next.validUntil = validUntil; next.lines = structuredClone(lines); next.discount = discount; next.notes = notes; next.events.push(event('Orçamento criado e composição inicial salva'));
        data.quotes.push(next);
        setCustomValues(data, next.id, customDraft);
        onCreated(next.id);
      }, 'Orçamento criado.');
      if (ok) onClose();
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }}>
    <div className="op-fields"><label className="op-field"><span>Cliente *</span><select value={newCustomer ? '__new' : customerId} onChange={change => { if (change.target.value === '__new') { setNewCustomer(true); setCustomerId(''); } else { setNewCustomer(false); setCustomerId(change.target.value); } }}><option value="">Selecionar</option>{customerOptions(w.data).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}<option value="__new">Cadastrar novo cliente neste orçamento</option></select></label><label className="op-field"><span>{operation.label('quoteTitle', 'Título da proposta')} *</span><input value={title} onChange={change => setTitle(change.target.value)} /></label>{newCustomer && <><label className="op-field"><span>Nome do cliente *</span><input value={customerName} onChange={change => setCustomerName(change.target.value)} /></label><label className="op-field"><span>Telefone</span><input type="tel" value={customerPhone} onChange={change => setCustomerPhone(change.target.value)} /></label></>}<label className="op-field"><span>{operation.label('validUntil', 'Validade')} *</span><input type="date" value={validUntil} onChange={change => setValidUntil(change.target.value)} /></label></div>
    <LineEditor lines={lines} onChange={setLines} />
    <div className="op-quote-total">{operation.fieldVisible('discount') && <label className="op-field"><span>{operation.label('discount', 'Desconto')} (R$)</span><input type="number" min="0" step="0.01" value={discount / 100} onChange={change => setDiscount(Math.round(Number(change.target.value) * 100))} /></label>}<div><small>Total</small><strong>{money(sum)}</strong></div></div>
    {operation.fieldVisible('customerNotes') && <label className="op-field"><span>{operation.label('customerNotes', 'Observações para o cliente')}</span><textarea value={notes} onChange={change => setNotes(change.target.value)} /></label>}
    {custom.length > 0 && <div className="op-fields">{custom.map(field => <label className="op-field" key={field.id}><span>{field.label}</span><input value={customDraft[field.id] || ''} onChange={change => setCustomDraft({ ...customDraft, [field.id]: change.target.value })} /></label>)}</div>}
    {error && <p className="op-error">{error}</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Criar proposta'}</Button></div>
  </form>;
}

export function Research({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('athena-pesquisa');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState(recordId);
  const [edit, setEdit] = useState(false);
  const [apply, setApply] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState('');
  const [surveyFilter, setSurveyFilter] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compare, setCompare] = useState(false);
  const d = w.data;
  const survey = d.surveys.find(item => item.id === selected);
  const inRange = (at: string, start: string, end: string) => (!start || at.slice(0, 10) >= start) && (!end || at.slice(0, 10) <= end);
  const responses = d.responses.filter(response => (!surveyFilter || response.surveyId === surveyFilter) && inRange(response.at, from, to));

  const previousRange = useMemo(() => {
    if (!from || !to) return null;
    const start = new Date(`${from}T12:00:00`), end = new Date(`${to}T12:00:00`);
    if (end < start) return null;
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - days + 1);
    const key = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return { from: key(previousStart), to: key(previousEnd) };
  }, [from, to]);

  if (survey && apply) return <Respond w={w} survey={survey} onClose={() => setApply(false)} />;

  if (survey) return <>
    <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar às pesquisas</Button>
    <Title eyebrow="Estúdio de pesquisa" title={survey.title}>{survey.description}</Title>
    <WorkflowControl label="Situação da coleta" steps={['Rascunho', 'Ativa', 'Encerrada']} current={survey.status} status={survey.status} nextLabel={survey.status === 'Rascunho' ? 'Ativar pesquisa' : survey.status === 'Ativa' ? 'Encerrar coleta' : undefined} onNext={survey.status === 'Rascunho' ? () => { void w.mutate(data => { const current = data.surveys.find(item => item.id === survey.id)!; validateSurvey(current); current.status = 'Ativa'; }, 'Pesquisa ativada neste dispositivo.'); } : survey.status === 'Ativa' ? () => setConfirm(survey.id) : undefined} actions={<>{survey.status === 'Rascunho' && operation.actionVisible('edit') && <Button variant="secondary" onClick={() => setEdit(true)}>Editar perguntas</Button>}{survey.status === 'Ativa' && operation.actionVisible('apply') && <Button onClick={() => setApply(true)}>Abrir modo de coleta</Button>}{survey.status !== 'Rascunho' && <Button variant="secondary" onClick={() => { void w.mutate(data => { const copy: Survey = { ...structuredClone(survey), id: uid(), title: `${survey.title} — nova edição`, status: 'Rascunho', createdAt: now() }; data.surveys.push(copy); setSelected(copy.id); setEdit(true); }, 'Nova edição criada sem alterar as respostas anteriores.'); }}>Duplicar para nova edição</Button>}</>} />
    <div className="research-studio"><div><Section title="Perguntas">{survey.questions.map((question, index) => <div className="research-question" key={question.id}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{question.type}{question.required ? ' · Obrigatória' : ''}</small><h3>{question.title}</h3>{isNumericQuestion(question) ? <div className="research-scale">{Array.from({ length: isZeroToTenQuestion(question) ? 11 : 5 }, (_, number) => <span key={number}>{isZeroToTenQuestion(question) ? number : number + 1}</span>)}</div> : question.type === 'Escolha única' ? <p>{question.options.join(' / ')}</p> : <div className="research-text-preview">Resposta por escrito</div>}</div></div>)}{!survey.questions.length && <Empty action={<Button onClick={() => setEdit(true)}><Plus size={16} />Adicionar perguntas</Button>}>Escolha o que você precisa entender sobre a experiência do cliente.</Empty>}</Section></div><aside className="research-studio-side"><span className="op-kicker">Aplicação presencial</span><h2>Coleta sem expor<br />a administração.</h2><p>“Abrir modo de coleta” troca o conteúdo operacional por uma tela dedicada ao respondente. Após o envio, o dispositivo fica pronto para a próxima pessoa.</p><div className="research-response-count"><strong>{d.responses.filter(response => response.surveyId === survey.id).length}</strong><span>respostas coletadas</span></div></aside></div>
    {edit && <Modal title="Editar perguntas" wide onClose={() => setEdit(false)}><SurveyEditor survey={survey} onClose={() => setEdit(false)} onSave={draft => w.mutate(data => { const index = data.surveys.findIndex(item => item.id === draft.id); if (data.surveys[index].status !== 'Rascunho') throw new Error('A pesquisa já foi ativada. Duplique para criar uma nova edição.'); data.surveys[index] = draft; })} /></Modal>}
    {confirm && <Confirm title="Encerrar coleta?" onClose={() => setConfirm('')} onConfirm={() => w.mutate(data => { data.surveys.find(item => item.id === confirm)!.status = 'Encerrada'; }, 'Coleta encerrada.')}>As respostas serão preservadas e esta pesquisa deixará de aceitar novos envios.</Confirm>}
  </>;

  if (page === 'respostas' || page === 'resultados') return <>
    <Title eyebrow="Escuta do cliente" title={page === 'resultados' ? 'O que as respostas dizem' : 'Respostas recebidas'} action={operation.actionVisible('export') ? <Button variant="secondary" onClick={() => csv('respostas-athena.csv', [['Pesquisa', 'Data', 'Contato', 'Pergunta', 'Resposta'], ...responses.flatMap(response => { const current = d.surveys.find(item => item.id === response.surveyId); return Object.entries(response.answers).map(([id, value]) => [current?.title, date(response.at, true), response.contact, current?.questions.find(question => question.id === id)?.title, value]); })])}><FileDown size={17} />Exportar respostas</Button> : undefined} />
    <div className="op-toolbar"><select aria-label="Selecionar pesquisa" value={surveyFilter} onChange={change => setSurveyFilter(change.target.value)}><option value="">Todas as pesquisas</option>{d.surveys.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><label className="op-field"><span>De</span><input type="date" value={from} onChange={change => setFrom(change.target.value)} /></label><label className="op-field"><span>Até</span><input type="date" value={to} onChange={change => setTo(change.target.value)} /></label>{page === 'resultados' && from && to && <label className="op-config-switch"><input type="checkbox" checked={compare} onChange={change => setCompare(change.target.checked)} /><span>Comparar com período anterior</span></label>}</div>
    {page === 'resultados'
      ? d.surveys.filter(item => !surveyFilter || item.id === surveyFilter).map(item => <Section key={item.id} title={item.title}>{item.questions.map(question => {
        const currentAnswers = d.responses.filter(response => response.surveyId === item.id && inRange(response.at, from, to) && response.answers[question.id] !== undefined && response.answers[question.id] !== '').map(response => response.answers[question.id]);
        const previousAnswers = compare && previousRange ? d.responses.filter(response => response.surveyId === item.id && inRange(response.at, previousRange.from, previousRange.to) && response.answers[question.id] !== undefined && response.answers[question.id] !== '').map(response => response.answers[question.id]) : [];
        const numeric = isNumericQuestion(question);
        const average = numeric && currentAnswers.length ? currentAnswers.reduce((sum, answer) => sum + Number(answer), 0) / currentAnswers.length : 0;
        const previousAverage = numeric && previousAnswers.length ? previousAnswers.reduce((sum, answer) => sum + Number(answer), 0) / previousAnswers.length : 0;
        const nps = (answers: string[]) => answers.length ? Math.round((answers.filter(answer => Number(answer) >= 9).length - answers.filter(answer => Number(answer) <= 6).length) / answers.length * 100) : 0;
        return <div className="research-result" key={question.id}><h3>{question.title}</h3>{currentAnswers.length ? <><div className="research-result-caption">{question.type === 'NPS — recomendação' ? <strong>NPS {nps(currentAnswers)}</strong> : numeric ? <strong>Média {average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong> : <strong>{currentAnswers.length} respostas</strong>}<small>Base atual: {currentAnswers.length}{compare && previousRange ? ` · período anterior: ${previousAnswers.length}` : ''}</small></div>{compare && previousRange && <p className="op-muted">Período anterior: {question.type === 'NPS — recomendação' ? `NPS ${nps(previousAnswers)}` : numeric ? `média ${previousAverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : `${previousAnswers.length} respostas`}.</p>}{question.type === 'NPS — recomendação' && <p>NPS é calculado somente nesta pergunta de recomendação: % de notas 9–10 menos % de notas 0–6.</p>}{numeric || question.type === 'Escolha única' ? Array.from(new Set(currentAnswers)).sort((a, b) => numeric ? Number(a) - Number(b) : a.localeCompare(b)).map(value => { const count = currentAnswers.filter(answer => answer === value).length; return <div className="research-bar" key={value}><span>{value}</span><progress value={count} max={currentAnswers.length} aria-label={`${value}: ${count} respostas`} /><b>{count}</b></div>; }) : currentAnswers.map((answer, index) => <blockquote key={index}>{answer}</blockquote>)}</> : <p className="op-muted">Sem respostas para esta pergunta no período.</p>}</div>;
      })}</Section>)
      : responses.map(response => { const current = d.surveys.find(item => item.id === response.surveyId); const follow = customValues(d, response.id); return <Section key={response.id} title={current?.title || 'Pesquisa'} action={<small className="op-muted">{date(response.at, true)}</small>}>{Object.entries(response.answers).map(([id, value]) => <div className="op-answer" key={id}><span>{current?.questions.find(question => question.id === id)?.title}</span><strong>{value || 'Sem resposta'}</strong></div>)}{response.contact && <div className="op-callout"><strong>Contato autorizado: {response.contact}</strong><p>{follow.owner ? `${follow.done === 'sim' ? 'Providência concluída' : 'Retorno pendente'} · ${follow.owner}${follow.due ? ` · prazo ${date(follow.due)}` : ''}` : 'Sem responsável definido.'}</p><Button variant="secondary" onClick={() => setFollowUp(response.id)}>{follow.owner ? 'Atualizar providência' : 'Atribuir retorno'}</Button></div>}</Section>; })}
    {!responses.length && <Empty icon={<MessageSquareText size={30} />}>Os resultados serão calculados quando houver respostas reais.</Empty>}
    {followUp && <Modal title="Acompanhar retorno ao cliente" onClose={() => setFollowUp('')}><RecordForm draftKey={`athena-follow:${followUp}`} fields={[
      { name: 'owner', label: 'Responsável', required: true, value: customValues(d, followUp).owner || '' },
      { name: 'due', label: 'Prazo', type: 'date', value: customValues(d, followUp).due || '' },
      { name: 'note', label: 'Providência / observação', type: 'textarea', wide: true, value: customValues(d, followUp).note || '' },
      { name: 'done', label: 'Situação', options: [{ value: 'nao', label: 'Retorno pendente' }, { value: 'sim', label: 'Providência concluída' }], value: customValues(d, followUp).done || 'nao' }
    ]} onClose={() => setFollowUp('')} onSave={form => w.mutate(data => setCustomValues(data, followUp, form), 'Acompanhamento atualizado.')} /></Modal>}
  </>;

  return <>
    <Title eyebrow="Athena / Pesquisa de satisfação" title={page === 'inicio' ? 'Coletas que pedem ação' : 'Suas pesquisas'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Criar pesquisa</Button>} />
    {page === 'inicio' && <div className="op-report-totals"><div><span>Em montagem</span><strong>{d.surveys.filter(item => item.status === 'Rascunho').length}</strong><small>Pesquisas que podem ser retomadas.</small></div><div><span>Coletas ativas</span><strong>{d.surveys.filter(item => item.status === 'Ativa').length}</strong><small>Prontas para abrir no modo de resposta.</small></div><div><span>Contatos autorizados</span><strong>{d.responses.filter(item => item.contact).length}</strong><small>Feedbacks que podem exigir retorno.</small></div></div>}
    <SearchBox value={query} onChange={setQuery} placeholder="Buscar pesquisa" />
    <div className="research-library">{d.surveys.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(item => <button className="research-survey" key={item.id} onClick={() => setSelected(item.id)}><div><Badge>{item.status}</Badge><span>{item.questions.length} perguntas</span></div><h2>{item.title}</h2><p>{item.description || 'Sem descrição'}</p><footer><span>{d.responses.filter(response => response.surveyId === item.id).length} respostas</span><ArrowRight size={19} /></footer></button>)}</div>
    {!d.surveys.length && <Empty icon={<MessageSquareText size={30} />} action={<Button onClick={() => setCreate(true)}>Montar primeira pesquisa</Button>}>Comece com as perguntas que importam para seu atendimento.</Empty>}
    {create && <Modal title="Nova pesquisa" onClose={() => setCreate(false)}><RecordForm draftKey="athena-survey:new" fields={[{ name: 'title', label: operation.label('surveyTitle', 'Nome da pesquisa'), required: true, wide: true }, ...(operation.fieldVisible('surveyDescription') ? [{ name: 'description', label: operation.label('surveyDescription', 'Mensagem para quem vai responder'), type: 'textarea', wide: true }] : [])]} onClose={() => setCreate(false)} submit="Criar e editar perguntas" onSave={form => w.mutate(data => { const next: Survey = { id: uid(), title: form.title, description: form.description || '', status: 'Rascunho', questions: [], createdAt: now() }; data.surveys.push(next); setSelected(next.id); setEdit(true); })} /></Modal>}
  </>;
}

function validateSurvey(survey: Survey) {
  if (!survey.title.trim() || !survey.questions.length) throw new Error('Inclua um título e ao menos uma pergunta.');
  for (const question of survey.questions) {
    if (!question.title.trim()) throw new Error('Preencha o texto de todas as perguntas.');
    if (question.type === 'Escolha única' && (question.options.length < 2 || question.options.some(option => !option.trim()) || new Set(question.options).size !== question.options.length)) throw new Error('Cada pergunta de escolha precisa de duas ou mais opções distintas.');
  }
}

function SurveyEditor({ survey, onSave, onClose }: { survey: Survey; onSave: (value: Survey) => Promise<boolean>; onClose: () => void }) {
  const operation = useOperationPreferences('athena-pesquisa');
  const [draft, setDraft] = useState(() => structuredClone(survey));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (id: string, patch: Partial<Question>) => setDraft({ ...draft, questions: draft.questions.map(question => question.id === id ? { ...question, ...patch } : question) });
  return <form onSubmit={async submit => { submit.preventDefault(); try { validateSurvey(draft); setBusy(true); if (await onSave(draft)) onClose(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>
    <label className="op-field"><span>{operation.label('surveyTitle', 'Nome da pesquisa')}</span><input value={draft.title} required onChange={change => setDraft({ ...draft, title: change.target.value })} /></label>
    {draft.questions.map((question, index) => <div className="research-edit-question" key={question.id}><div className="op-section-head"><strong>Pergunta {index + 1}</strong><button type="button" className="op-icon" aria-label={`Remover pergunta ${index + 1}`} onClick={() => setDraft({ ...draft, questions: draft.questions.filter(item => item.id !== question.id) })}><X size={16} /></button></div><label className="op-field"><span>{operation.label('questionTitle', 'Pergunta')}</span><input value={question.title} onChange={change => update(question.id, { title: change.target.value })} /></label><div className="op-fields"><label className="op-field"><span>{operation.label('questionType', 'Tipo de resposta')}</span><select value={question.type === 'Nota de 0 a 10' ? 'Escala de 0 a 10' : question.type} onChange={change => { const type = change.target.value as Question['type']; update(question.id, { type, title: type === 'NPS — recomendação' && !question.title ? 'Em uma escala de 0 a 10, o quanto você recomendaria nossa empresa a um amigo ou colega?' : question.title, options: type === 'Escolha única' && question.options.length < 2 ? ['Opção 1', 'Opção 2'] : question.options }); }}>{['NPS — recomendação', 'Escala de 0 a 10', 'Nota de 1 a 5', 'Texto', 'Escolha única'].map(value => <option key={value}>{value}</option>)}</select>{question.type === 'NPS — recomendação' && <small>Use este tipo somente para a pergunta de recomendação. Outras notas de 0 a 10 são tratadas como escala, sem cálculo de NPS.</small>}</label><label className="op-field"><span>{operation.label('requiredQuestion', 'Resposta obrigatória')}</span><select value={question.required ? 'sim' : 'nao'} onChange={change => update(question.id, { required: change.target.value === 'sim' })}><option value="sim">Sim</option><option value="nao">Não</option></select></label></div>{question.type === 'Escolha única' && <label className="op-field"><span>Opções, uma por linha</span><textarea rows={4} value={question.options.join('\n')} onChange={change => update(question.id, { options: change.target.value.split('\n') })} /></label>}</div>)}
    <Button variant="secondary" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { id: uid(), title: '', type: 'Nota de 1 a 5', options: [], required: true }] })}><Plus size={16} />Adicionar pergunta</Button>
    {error && <p className="op-error" role="alert">{error}</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar pesquisa'}</Button></div>
  </form>;
}

function Respond({ w, survey, onClose }: { w: Workspace; survey: Survey; onClose: () => void }) {
  const operation = useOperationPreferences('athena-pesquisa');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (id: string, value: string) => setAnswers(current => ({ ...current, [id]: value }));
  const reset = () => { setAnswers({}); setContact(''); setSent(false); w.setError(''); };
  if (sent) return <div className="research-respond-intro"><span className="op-kicker">Resposta registrada</span><h2>Obrigado.</h2><p>Esta resposta foi salva. O conteúdo anterior não fica exposto para a próxima pessoa.</p><div className="op-actions"><Button onClick={reset}>Registrar próxima resposta</Button><Button variant="secondary" onClick={onClose}>Sair do modo de coleta</Button></div></div>;
  return <div className="research-standalone"><div className="op-form-footer"><span className="op-muted">Modo de coleta · administração protegida</span><Button variant="secondary" onClick={onClose}>Sair da coleta</Button></div><form onSubmit={async submit => {
    submit.preventDefault();
    for (const question of survey.questions) if (question.required && !answers[question.id]?.trim()) { w.setError(`Responda: ${question.title}`); return; }
    setBusy(true);
    const ok = await w.mutate(data => { const current = data.surveys.find(item => item.id === survey.id); if (!current || current.status !== 'Ativa') throw new Error('Esta pesquisa não está mais aceitando respostas.'); data.responses.push({ id: uid(), surveyId: survey.id, at: now(), answers: structuredClone(answers), contact: contact.trim() }); }, 'Resposta registrada.');
    setBusy(false); if (ok) setSent(true);
  }}>
    <div className="research-respond-intro"><span className="op-kicker">Sua experiência</span><h2>{survey.title}</h2>{survey.description && <p>{survey.description}</p>}</div>
    {survey.questions.map((question, index) => <fieldset className="research-response-question" key={question.id}><legend><span>{String(index + 1).padStart(2, '0')}</span>{question.title}{question.required && ' *'}</legend>{question.type === 'Texto' ? <textarea rows={4} value={answers[question.id] || ''} onChange={change => set(question.id, change.target.value)} /> : question.type === 'Escolha única' ? <div className="research-options">{question.options.map(option => <label key={option}><input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => set(question.id, option)} />{option}</label>)}</div> : <div className="research-scale-input">{Array.from({ length: isZeroToTenQuestion(question) ? 11 : 5 }, (_, number) => String(isZeroToTenQuestion(question) ? number : number + 1)).map(value => <label key={value}><input type="radio" name={question.id} checked={answers[question.id] === value} onChange={() => set(question.id, value)} /><span>{value}</span></label>)}</div>}</fieldset>)}
    {operation.fieldVisible('contact') && <label className="op-field"><span>{operation.label('contact', 'Contato autorizado')} (opcional)</span><input value={contact} onChange={change => setContact(change.target.value)} placeholder="Telefone ou e-mail, somente se quiser ser contatado" /></label>}
    <div className="op-form-footer"><Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar resposta'}</Button></div>
  </form></div>;
}
