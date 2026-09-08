'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, FileDown, FileText, MessageSquareText, Plus, X } from 'lucide-react';
import {
  Question, Quote, Survey, blankQuote, date, decideQuote, event, localDay, money,
  nextNumber, now, reviseQuote, sendQuote, total, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, CustomerManager, Empty, Modal, QuoteDocument, QuoteEditor,
  RecordForm, SearchBox, Section, Timeline, Title, customerOptions
} from './ui';
import { WorkflowControl } from './WorkflowControl';

export function Budgets({ w, page }: { w: Workspace; page: string }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [edit, setEdit] = useState(false);
  const [preview, setPreview] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [revision, setRevision] = useState(false);
  const quote = w.data.quotes.find(item => item.id === selected);
  const quotes = w.data.quotes.filter(item => `${item.title} ${item.number} ${w.data.customers.find(customer => customer.id === item.customerId)?.name}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'Todos' || item.status === filter));

  const mutateQuote = (id: string, fn: (value: Quote) => void, message?: string) => w.mutate(data => {
    const current = data.quotes.find(item => item.id === id);
    if (!current) throw new Error('Orçamento não encontrado.');
    fn(current);
  }, message);

  if (page === 'clientes') return <CustomerManager w={w} onOpen={customer => <Section title="Orçamentos do cliente">{w.data.quotes.filter(item => item.customerId === customer.id).map(item => <div className="op-row" key={item.id}><strong>{item.title || `Orçamento ${item.number}`}</strong><Badge>{item.status}</Badge><strong>{money(total(item.lines, item.discount))}</strong></div>)}</Section>} />;

  if (quote) {
    const final = ['Aprovado', 'Reprovado', 'Expirado'].includes(quote.status);
    const steps = final ? ['Rascunho', 'Enviado', quote.status] : ['Rascunho', 'Enviado', 'Decisão'];
    const currentStep = final ? quote.status : quote.status === 'Enviado' ? 'Enviado' : 'Rascunho';
    return <>
      <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar aos orçamentos</Button>
      <Title eyebrow={`Orçamento ${String(quote.number).padStart(4, '0')} · versão ${quote.version}`} title={quote.title || 'Novo orçamento'} action={quote.lines.length > 0 && operation.actionVisible('document') ? <Button variant="secondary" onClick={() => setPreview(true)}>Ver documento</Button> : undefined}>
        {w.data.customers.find(customer => customer.id === quote.customerId)?.name}
      </Title>

      <WorkflowControl
        label="Fluxo da proposta"
        steps={steps}
        current={currentStep}
        status={quote.status}
        nextLabel={quote.status === 'Rascunho' && operation.actionVisible('quickAdvance') ? 'Marcar como enviado' : undefined}
        onNext={quote.status === 'Rascunho' ? () => { void mutateQuote(quote.id, current => sendQuote(current), 'Orçamento marcado como enviado.'); } : undefined}
        actions={<>
          {quote.status === 'Enviado' && operation.actionVisible('decision') && <><Button onClick={() => setDecision(true)}>Registrar aprovação</Button><Button variant="secondary" onClick={() => setDecision(false)}>Registrar reprovação</Button></>}
          {quote.status !== 'Rascunho' && operation.actionVisible('revision') && <Button variant="secondary" onClick={() => setRevision(true)}>Nova versão</Button>}
        </>}
      />

      <div className="budget-workspace">
        <Section title="Proposta comercial" action={quote.status === 'Rascunho' && operation.actionVisible('edit') ? <Button onClick={() => setEdit(true)}>{quote.lines.length ? 'Editar proposta' : 'Montar proposta'}</Button> : undefined}>
          {quote.lines.length ? <div className="op-document-lines">{quote.lines.map(line => <div key={line.id}><span><strong>{line.description}</strong><small>{line.kind}{line.brand ? ` · ${line.brand}` : ''} · {line.quantity} × {money(line.price)}</small></span><b>{money(Math.round(line.quantity * line.price))}</b></div>)}</div> : <Empty>Inclua os itens desta proposta.</Empty>}
          <div className="op-quote-total"><div><small>Total</small><strong>{money(total(quote.lines, quote.discount))}</strong></div></div>
          {quote.notes && <p>{quote.notes}</p>}
          {quote.versions && quote.versions.length > 0 && <details className="op-version-history"><summary>Versões anteriores ({quote.versions.length})</summary>{quote.versions.map(version => <div key={version.version}><strong>Versão {version.version} · {version.status} · {money(total(version.lines, version.discount))}</strong><p>{date(version.at, true)} · {version.decisionNote || 'Sem decisão registrada'}</p></div>)}</details>}
        </Section>
        <aside className="budget-context"><span className="op-kicker">Acompanhe a decisão</span><h2>Um documento.<br />Toda a conversa.</h2><p>Validade: {date(quote.validUntil)}</p><p>Criado em {date(quote.createdAt)}</p>{quote.decisionNote && <p className="op-callout">Decisão: {quote.decisionNote}</p>}<Timeline events={quote.events} /></aside>
      </div>

      {edit && <Modal title="Editar orçamento" wide onClose={() => setEdit(false)}><QuoteEditor quote={quote} onClose={() => setEdit(false)} onSave={draft => mutateQuote(quote.id, current => {
        if (current.status !== 'Rascunho') throw new Error('Crie uma nova versão para alterar este orçamento.');
        Object.assign(current, draft);
        current.events.push(event('Orçamento atualizado'));
      }, 'Orçamento salvo.')} /></Modal>}
      {preview && <QuoteDocument quote={quote} customer={w.data.customers.find(customer => customer.id === quote.customerId)} business={w.data.settings} onClose={() => setPreview(false)} />}
      {decision !== null && <Modal title={decision ? 'Registrar aprovação' : 'Registrar reprovação'} onClose={() => setDecision(null)}><RecordForm fields={[{ name: 'note', label: operation.label('decisionNote', 'Como a decisão do cliente foi recebida?'), type: 'textarea', required: true, wide: true }]} onClose={() => setDecision(null)} submit={decision ? 'Confirmar aprovação' : 'Confirmar reprovação'} onSave={values => mutateQuote(quote.id, current => decideQuote(current, decision, values.note), 'Decisão registrada.')} /></Modal>}
      {revision && <Confirm title="Criar nova versão?" onClose={() => setRevision(false)} onConfirm={() => mutateQuote(quote.id, current => reviseQuote(current), 'Nova versão aberta.')}>A versão atual será preservada no histórico e a nova versão precisará ser enviada e aprovada novamente.</Confirm>}
    </>;
  }

  return <>
    <Title eyebrow="Athena / Orçamentos" title={page === 'inicio' ? 'Dê forma à próxima proposta.' : 'Seus orçamentos'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Criar orçamento</Button>} />
    {page === 'inicio' && <div className="budget-intro"><div className="budget-steps"><span><b>01</b>Compor</span><span><b>02</b>Apresentar</span><span><b>03</b>Acompanhar</span></div><div className="budget-intro-copy"><FileText size={26} /><p>Serviços e valores claros.<br />Cada decisão, registrada.</p></div></div>}
    <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar cliente, título ou número" /><select aria-label="Status do orçamento" value={filter} onChange={change => setFilter(change.target.value)}>{['Todos', 'Rascunho', 'Enviado', 'Aprovado', 'Reprovado'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('document') && <Button variant="secondary" onClick={() => csv('orcamentos.csv', [['Número', 'Título', 'Cliente', 'Status', 'Versão', 'Validade', 'Total'], ...quotes.map(item => [item.number, item.title, w.data.customers.find(customer => customer.id === item.customerId)?.name, item.status, item.version, item.validUntil, (total(item.lines, item.discount) / 100).toFixed(2)])])}><FileDown size={16} />Exportar</Button>}</div>
    <div className="budget-register"><div className="budget-register-head"><span>Documento / cliente</span><span>Validade</span><span>Decisão</span><span>Total</span></div>{quotes.map(item => <button className="budget-register-row" key={item.id} onClick={() => setSelected(item.id)}><div><span className="budget-number">{String(item.number).padStart(4, '0')}</span><strong>{item.title || 'Orçamento sem título'}</strong><small>{w.data.customers.find(customer => customer.id === item.customerId)?.name}</small></div><span>{item.validUntil ? date(item.validUntil) : 'Não definida'}{item.status === 'Enviado' && item.validUntil < localDay() && <small className="op-overdue">Validade encerrada</small>}</span><Badge>{item.status}</Badge><strong>{money(total(item.lines, item.discount))}<ArrowRight size={17} /></strong></button>)}</div>
    {!quotes.length && <Empty icon={<FileText size={28} />} action={<Button onClick={() => setCreate(true)}>Criar primeiro orçamento</Button>}>{query ? 'Nenhum orçamento corresponde à busca.' : 'Comece pelo cliente e pelos itens da proposta.'}</Empty>}
    {create && <Modal title="Criar orçamento" onClose={() => setCreate(false)}>{w.data.customers.length ? <RecordForm fields={[{ name: 'customerId', label: operation.label('customer', 'Cliente'), required: true, options: customerOptions(w.data) }, { name: 'title', label: operation.label('quoteTitle', 'Título da proposta'), required: true }]} onClose={() => setCreate(false)} submit="Começar proposta" onSave={values => w.mutate(data => {
      if (!data.customers.some(customer => customer.id === values.customerId)) throw new Error('Selecione um cliente.');
      const next = blankQuote(nextNumber(data.quotes), values.customerId); next.title = values.title; next.events.push(event('Orçamento criado')); data.quotes.push(next); setSelected(next.id);
    })} /> : <Empty>Cadastre o cliente na seção “Clientes” antes de criar o orçamento.</Empty>}</Modal>}
  </>;
}

export function Research({ w, page }: { w: Workspace; page: string }) {
  const operation = useOperationPreferences('athena-pesquisa');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState('');
  const [edit, setEdit] = useState(false);
  const [apply, setApply] = useState(false);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState('');
  const [surveyFilter, setSurveyFilter] = useState('');
  const d = w.data;
  const survey = d.surveys.find(item => item.id === selected);
  const responses = d.responses.filter(response => !surveyFilter || response.surveyId === surveyFilter);

  if (survey) return <>
    <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar às pesquisas</Button>
    <Title eyebrow="Estúdio de pesquisa" title={survey.title}>{survey.description}</Title>
    <WorkflowControl
      label="Situação da coleta"
      steps={['Rascunho', 'Ativa', 'Encerrada']}
      current={survey.status}
      status={survey.status}
      nextLabel={survey.status === 'Rascunho' ? 'Ativar pesquisa' : survey.status === 'Ativa' ? 'Encerrar coleta' : undefined}
      onNext={survey.status === 'Rascunho' ? () => { void w.mutate(data => { const current = data.surveys.find(item => item.id === survey.id)!; validateSurvey(current); current.status = 'Ativa'; }, 'Pesquisa ativada neste dispositivo.'); } : survey.status === 'Ativa' ? () => setConfirm(survey.id) : undefined}
      actions={<>
        {survey.status === 'Rascunho' && operation.actionVisible('edit') && <Button variant="secondary" onClick={() => setEdit(true)}>Editar perguntas</Button>}
        {survey.status === 'Ativa' && operation.actionVisible('apply') && <Button onClick={() => setApply(true)}>Aplicar pesquisa</Button>}
      </>}
    />
    <div className="research-studio">
      <div><Section title="Perguntas">{survey.questions.map((question, index) => <div className="research-question" key={question.id}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{question.type}{question.required ? ' · Obrigatória' : ''}</small><h3>{question.title}</h3>{question.type.startsWith('Nota') ? <div className="research-scale">{Array.from({ length: question.type === 'Nota de 0 a 10' ? 11 : 5 }, (_, number) => <span key={number}>{question.type === 'Nota de 0 a 10' ? number : number + 1}</span>)}</div> : question.type === 'Escolha única' ? <p>{question.options.join(' / ')}</p> : <div className="research-text-preview">Resposta por escrito</div>}</div></div>)}{!survey.questions.length && <Empty action={<Button onClick={() => setEdit(true)}><Plus size={16} />Adicionar perguntas</Button>}>Escolha o que você precisa entender sobre a experiência do cliente.</Empty>}</Section></div>
      <aside className="research-studio-side"><span className="op-kicker">Aplicação presencial</span><h2>Abra espaço<br />para ouvir.</h2><p>O controle da coleta fica acima, junto do status atual. Não é mais necessário procurar “Ativar” ou “Encerrar” em outro ponto da tela.</p><p className="op-muted">Respostas salvas neste navegador. A coleta por link público depende da conexão do app.</p><div className="research-response-count"><strong>{d.responses.filter(response => response.surveyId === survey.id).length}</strong><span>respostas coletadas</span></div></aside>
    </div>
    {edit && <Modal title="Editar perguntas" wide onClose={() => setEdit(false)}><SurveyEditor survey={survey} onClose={() => setEdit(false)} onSave={draft => w.mutate(data => { const index = data.surveys.findIndex(item => item.id === draft.id); if (data.surveys[index].status !== 'Rascunho') throw new Error('A pesquisa já foi ativada. Crie outra para mudar as perguntas.'); data.surveys[index] = draft; })} /></Modal>}
    {apply && <Modal title={survey.title} wide onClose={() => setApply(false)}><Respond w={w} survey={survey} onClose={() => setApply(false)} /></Modal>}
    {confirm && <Confirm title="Encerrar coleta?" onClose={() => setConfirm('')} onConfirm={() => w.mutate(data => { data.surveys.find(item => item.id === confirm)!.status = 'Encerrada'; }, 'Coleta encerrada.')}>As respostas serão preservadas e esta pesquisa deixará de aceitar novos envios.</Confirm>}
  </>;

  if (page === 'respostas' || page === 'resultados') return <>
    <Title eyebrow="Escuta do cliente" title={page === 'resultados' ? 'O que as respostas dizem' : 'Respostas recebidas'} action={operation.actionVisible('export') ? <Button variant="secondary" onClick={() => csv('respostas-athena.csv', [['Pesquisa', 'Data', 'Contato', 'Pergunta', 'Resposta'], ...responses.flatMap(response => { const current = d.surveys.find(item => item.id === response.surveyId); return Object.entries(response.answers).map(([id, value]) => [current?.title, date(response.at, true), response.contact, current?.questions.find(question => question.id === id)?.title, value]); })])}><FileDown size={17} />Exportar respostas</Button> : undefined} />
    <div className="op-toolbar"><select aria-label="Selecionar pesquisa" value={surveyFilter} onChange={change => setSurveyFilter(change.target.value)}><option value="">Todas as pesquisas</option>{d.surveys.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
    {page === 'resultados'
      ? d.surveys.filter(item => !surveyFilter || item.id === surveyFilter).map(item => <Section key={item.id} title={item.title}>{item.questions.map(question => {
        const answers = d.responses.filter(response => response.surveyId === item.id && response.answers[question.id] !== undefined && response.answers[question.id] !== '').map(response => response.answers[question.id]);
        const numeric = question.type.startsWith('Nota');
        const average = numeric && answers.length ? answers.reduce((sum, answer) => sum + Number(answer), 0) / answers.length : 0;
        return <div className="research-result" key={question.id}><h3>{question.title}</h3>{answers.length ? <><div className="research-result-caption">{numeric ? <strong>Média {average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong> : <strong>{answers.length} respostas</strong>}<small>Base: {answers.length} respostas desta pergunta</small></div>{question.type === 'Nota de 0 a 10' && <p>NPS: {Math.round((answers.filter(answer => Number(answer) >= 9).length - answers.filter(answer => Number(answer) <= 6).length) / answers.length * 100)} · % de notas 9–10 menos % de notas 0–6</p>}{numeric || question.type === 'Escolha única' ? Array.from(new Set(answers)).sort((a, b) => numeric ? Number(a) - Number(b) : a.localeCompare(b)).map(value => { const count = answers.filter(answer => answer === value).length; return <div className="research-bar" key={value}><span>{value}</span><progress value={count} max={answers.length} aria-label={`${value}: ${count} respostas`} /><b>{count}</b></div>; }) : answers.map((answer, index) => <blockquote key={index}>{answer}</blockquote>)}</> : <p className="op-muted">Sem respostas para esta pergunta.</p>}</div>;
      })}</Section>)
      : responses.map(response => { const current = d.surveys.find(item => item.id === response.surveyId); return <Section key={response.id} title={current?.title || 'Pesquisa'} action={<small className="op-muted">{date(response.at, true)}</small>}>{Object.entries(response.answers).map(([id, value]) => <div className="op-answer" key={id}><span>{current?.questions.find(question => question.id === id)?.title}</span><strong>{value || 'Sem resposta'}</strong></div>)}{response.contact && <p>Contato autorizado: {response.contact}</p>}</Section>; })}
    {!responses.length && <Empty icon={<MessageSquareText size={30} />}>Os resultados serão calculados quando houver respostas reais.</Empty>}
  </>;

  return <>
    <Title eyebrow="Athena / Pesquisa de satisfação" title={page === 'inicio' ? 'Toda resposta começa com escuta.' : 'Suas pesquisas'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Criar pesquisa</Button>} />
    {page === 'inicio' && <div className="research-opening"><div><span className="op-kicker">Da pergunta à percepção</span><h2>Pergunte com intenção.<br />Decida com contexto.</h2></div><ol><li><span>01</span>Monte a pesquisa</li><li><span>02</span>Ouça seus clientes</li><li><span>03</span>Leia as respostas</li></ol></div>}
    <SearchBox value={query} onChange={setQuery} placeholder="Buscar pesquisa" />
    <div className="research-library">{d.surveys.filter(item => item.title.toLowerCase().includes(query.toLowerCase())).map(item => <button className="research-survey" key={item.id} onClick={() => setSelected(item.id)}><div><Badge>{item.status}</Badge><span>{item.questions.length} perguntas</span></div><h2>{item.title}</h2><p>{item.description || 'Sem descrição'}</p><footer><span>{d.responses.filter(response => response.surveyId === item.id).length} respostas</span><ArrowRight size={19} /></footer></button>)}</div>
    {!d.surveys.length && <Empty icon={<MessageSquareText size={30} />} action={<Button onClick={() => setCreate(true)}>Montar primeira pesquisa</Button>}>Comece com as perguntas que importam para seu atendimento.</Empty>}
    {create && <Modal title="Nova pesquisa" onClose={() => setCreate(false)}><RecordForm fields={[{ name: 'title', label: operation.label('surveyTitle', 'Nome da pesquisa'), required: true, wide: true }, ...(operation.fieldVisible('surveyDescription') ? [{ name: 'description', label: operation.label('surveyDescription', 'Mensagem para quem vai responder'), type: 'textarea', wide: true }] : [])]} onClose={() => setCreate(false)} submit="Criar e editar perguntas" onSave={values => w.mutate(data => { const next: Survey = { id: uid(), title: values.title, description: values.description || '', status: 'Rascunho', questions: [], createdAt: now() }; data.surveys.push(next); setSelected(next.id); setEdit(true); })} /></Modal>}
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
    {draft.questions.map((question, index) => <div className="research-edit-question" key={question.id}>
      <div className="op-section-head"><strong>Pergunta {index + 1}</strong><button type="button" className="op-icon" aria-label={`Remover pergunta ${index + 1}`} onClick={() => setDraft({ ...draft, questions: draft.questions.filter(item => item.id !== question.id) })}><X size={16} /></button></div>
      <label className="op-field"><span>{operation.label('questionTitle', 'Pergunta')}</span><input value={question.title} onChange={change => update(question.id, { title: change.target.value })} /></label>
      <div className="op-fields"><label className="op-field"><span>{operation.label('questionType', 'Tipo de resposta')}</span><select value={question.type} onChange={change => update(question.id, { type: change.target.value as Question['type'], options: change.target.value === 'Escolha única' && question.options.length < 2 ? ['Opção 1', 'Opção 2'] : question.options })}>{['Nota de 0 a 10', 'Nota de 1 a 5', 'Texto', 'Escolha única'].map(value => <option key={value}>{value}</option>)}</select></label><label className="op-field"><span>{operation.label('requiredQuestion', 'Resposta obrigatória')}</span><select value={question.required ? 'sim' : 'nao'} onChange={change => update(question.id, { required: change.target.value === 'sim' })}><option value="sim">Sim</option><option value="nao">Não</option></select></label></div>
      {question.type === 'Escolha única' && <label className="op-field"><span>Opções, uma por linha</span><textarea rows={4} value={question.options.join('\n')} onChange={change => update(question.id, { options: change.target.value.split('\n') })} /></label>}
    </div>)}
    <Button variant="secondary" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { id: uid(), title: '', type: 'Nota de 0 a 10', options: [], required: true }] })}><Plus size={16} />Adicionar pergunta</Button>
    {error && <p className="op-error" role="alert">{error}</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar pesquisa'}</Button></div>
  </form>;
}

function Respond({ w, survey, onClose }: { w: Workspace; survey: Survey; onClose: () => void }) {
  const operation = useOperationPreferences('athena-pesquisa');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (id: string, value: string) => setAnswers(current => ({ ...current, [id]: value }));
  return <form onSubmit={async submit => {
    submit.preventDefault();
    for (const question of survey.questions) if (question.required && !answers[question.id]?.trim()) { w.setError(`Responda: ${question.title}`); return; }
    setBusy(true);
    const ok = await w.mutate(data => {
      const current = data.surveys.find(item => item.id === survey.id);
      if (!current || current.status !== 'Ativa') throw new Error('Esta pesquisa não está mais aceitando respostas.');
      data.responses.push({ id: uid(), surveyId: survey.id, at: now(), answers: structuredClone(answers), contact: contact.trim() });
    }, 'Resposta registrada.');
    setBusy(false);
    if (ok) onClose();
  }}>
    <div className="research-respond-intro"><span className="op-kicker">Sua experiência</span><h2>{survey.title}</h2>{survey.description && <p>{survey.description}</p>}</div>
    {survey.questions.map((question, index) => <fieldset className="research-response-question" key={question.id}><legend><span>{String(index + 1).padStart(2, '0')}</span>{question.title}{question.required && ' *'}</legend>{question.type === 'Texto' ? <textarea rows={4} value={answers[question.id] || ''} onChange={change => set(question.id, change.target.value)} /> : question.type === 'Escolha única' ? <div className="research-options">{question.options.map(option => <label key={option}><input type="radio" name={question.id} checked={answers[question.id] === option} onChange={() => set(question.id, option)} />{option}</label>)}</div> : <div className="research-scale-input">{Array.from({ length: question.type === 'Nota de 0 a 10' ? 11 : 5 }, (_, number) => String(question.type === 'Nota de 0 a 10' ? number : number + 1)).map(value => <label key={value}><input type="radio" name={question.id} checked={answers[question.id] === value} onChange={() => set(question.id, value)} /><span>{value}</span></label>)}</div>}</fieldset>)}
    {operation.fieldVisible('contact') && <label className="op-field"><span>{operation.label('contact', 'Contato autorizado')} (opcional)</span><input value={contact} onChange={change => setContact(change.target.value)} placeholder="Telefone ou e-mail, somente se quiser ser contatado" /></label>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar resposta'}</Button></div>
  </form>;
}
