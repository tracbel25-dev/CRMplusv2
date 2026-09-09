'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarCheck2, Check, FileDown, Flame, PhoneCall,
  Plus, Target, TriangleAlert, Users
} from 'lucide-react';
import {
  Deal, cents, customValues, date, event, localDay, money, nextNumber, now,
  setCustomValues, syncDealNextActivity, uid
} from '@/lib/operations/model';
import {
  geocodeAddress, getKronosDealMeta, getKronosVisits, isClosedDeal, kronosSignal,
  newKronosVisit, setKronosDealMeta, updateKronosVisit, upsertKronosVisit,
  type KronosDealMeta, type KronosQuoteStatus, type KronosTemperature, type KronosVisit
} from '@/lib/operations/kronos';
import { customerSuggestions, getCustomerLocation, resolveCustomer, setCustomerLocation } from '@/lib/operations/customers';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section,
  Timeline, Title
} from './ui';
import { WorkflowControl } from './WorkflowControl';
import { useRecordRoute } from './useRecordRoute';
import { KronosMap } from './KronosMap';

const fallbackColumns = ['Identificado', 'Contato iniciado', 'Interesse confirmado', 'Proposta', 'Negociação'];
const motionOptions = [{ value: 'Ativa', label: 'Venda ativa — nós fomos atrás' }, { value: 'Reativa', label: 'Venda reativa — o cliente veio até nós' }];
const temperatureOptions = [{ value: 'Fria', label: 'Fria' }, { value: 'Morna', label: 'Morna' }, { value: 'Quente', label: 'Quente' }];
const quoteOptions = ['Sem cotação', 'Em elaboração', 'Enviada', 'Aprovada', 'Reprovada'].map(value => ({ value, label: value }));
const visitKindOptions = ['Visita', 'Ligação', 'Reunião', 'Demonstração'].map(value => ({ value, label: value }));

function dayLabel(value: string) {
  if (!value) return 'Sem data';
  if (value.slice(0, 10) === localDay()) return 'Hoje';
  return date(value, value.includes('T'));
}

export function Kronos({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('kronos');
  const [selected, setSelected] = useRecordRoute(recordId, '/kronos/oportunidades');
  const [create, setCreate] = useState(false);
  const [leadCreate, setLeadCreate] = useState(false);
  const [visitCreate, setVisitCreate] = useState(false);
  const [visitResult, setVisitResult] = useState<KronosVisit | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [task, setTask] = useState(false);
  const [contact, setContact] = useState(false);
  const [result, setResult] = useState('');
  const [edit, setEdit] = useState(false);
  const d = w.data;
  const columns = d.settings.salesStages?.length >= 2 ? d.settings.salesStages : fallbackColumns;
  const visits = useMemo(() => getKronosVisits(d), [d]);
  const customer = (id: string) => d.customers.find(item => item.id === id);
  const deal = d.deals.find(item => item.id === selected);
  const filteredDeals = d.deals.filter(item => `${item.title} ${customer(item.customerId)?.name} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const active = filteredDeals.filter(item => !isClosedDeal(item));
  const tasks = d.tasks.filter(item => !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const pendingFor = (id: string) => d.tasks.filter(item => item.dealId === id && !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const nextTaskFor = (id: string) => pendingFor(id)[0];
  const signalFor = (item: Deal) => kronosSignal(d, item, columns);
  const totalOpen = active.reduce((sum, item) => sum + item.value, 0);
  const needsAttention = active.map(item => ({ deal: item, signal: signalFor(item) })).filter(item => item.signal.label === 'Atenção').sort((a, b) => a.signal.score - b.signal.score);
  const hot = active.map(item => ({ deal: item, signal: signalFor(item), meta: getKronosDealMeta(d, item.id) })).filter(item => item.signal.label === 'Forte' || item.meta.temperature === 'Quente').sort((a, b) => b.signal.score - a.signal.score);
  const upcomingVisits = visits.filter(item => item.status === 'Planejada').sort((a, b) => a.at.localeCompare(b.at));

  if (deal) {
    const activeDeal = !isClosedDeal(deal);
    const index = columns.indexOf(deal.stage);
    const nextStage = index >= 0 && index < columns.length - 1 ? columns[index + 1] : undefined;
    const workflowSteps = activeDeal ? columns : [...columns, deal.stage];
    const nextTask = nextTaskFor(deal.id);
    const meta = getKronosDealMeta(d, deal.id);
    const signal = signalFor(deal);
    const custom = operation.preferences.customFields.filter(field => field.visible && ['Cliente', 'Oportunidade', 'Qualificação', 'Próxima ação', 'Fechamento'].includes(field.group));
    const values = customValues(d, deal.id);
    const dealVisits = visits.filter(item => item.dealId === deal.id).sort((a, b) => b.at.localeCompare(a.at));

    return <>
      <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar à operação</Button>
      <Title eyebrow={`Oportunidade ${String(deal.number).padStart(4, '0')}`} title={deal.title} action={activeDeal ? <div className="op-actions"><Button variant="secondary" onClick={() => setContact(true)}><PhoneCall size={16} />Registrar contato</Button>{operation.actionVisible('edit') && <Button variant="secondary" onClick={() => setEdit(true)}>Editar</Button>}</div> : undefined}>
        {customer(deal.customerId)?.name} · {customer(deal.customerId)?.phone || 'Sem telefone cadastrado'}
      </Title>

      <div className="kronos-context-strip">
        <div><span>Origem</span><strong>{meta.motion || 'Não definida'}</strong><small>{deal.source || 'Canal não informado'}</small></div>
        <div><span>Percepção do vendedor</span><strong>{meta.temperature || 'Não informada'}</strong><small>Termômetro humano</small></div>
        <div><span>Sinais do Kronos</span><strong>{signal.label} · {signal.score}/100</strong><small>{signal.reasons.join(' · ') || 'Ainda há poucos dados'}</small></div>
        <div><span>Cotação</span><strong>{meta.quoteStatus}</strong><small>{meta.quoteValue ? money(meta.quoteValue) : deal.value ? `Potencial ${money(deal.value)}` : 'Sem valor informado'}</small></div>
      </div>

      <WorkflowControl label="Momento da negociação" steps={workflowSteps} current={deal.stage} status={deal.stage} actions={activeDeal && nextStage && operation.actionVisible('quickAdvance') ? <Button variant="secondary" onClick={() => { void w.mutate(data => {
        const current = data.deals.find(item => item.id === deal.id)!;
        if (current.stage !== deal.stage) throw new Error('A etapa já mudou.');
        const currentIndex = columns.indexOf(current.stage);
        if (currentIndex < 0 || currentIndex >= columns.length - 1) throw new Error('Esta oportunidade já está na última etapa aberta.');
        current.stage = columns[currentIndex + 1];
        current.events.push(event(`Avançou para ${current.stage}`));
      }, 'Etapa atualizada.'); }}>Avançar para {nextStage}</Button> : undefined} />

      <div className="op-split">
        <Section title="O que precisa acontecer agora" action={activeDeal && operation.actionVisible('activities') ? <Button variant="secondary" onClick={() => setTask(true)}><Plus size={16} />Agendar ação</Button> : undefined}>
          {nextTask ? <div className="kronos-next-action"><span className={new Date(nextTask.due) < new Date() ? 'op-overdue' : ''}>{dayLabel(nextTask.due)}</span><strong>{nextTask.title}</strong><small>{new Date(nextTask.due) < new Date() ? 'Esta ação está atrasada e merece atenção.' : 'Próxima ação definida para esta negociação.'}</small></div> : <Empty>Esta oportunidade está sem próxima ação. Registre o próximo passo para ela não desaparecer da rotina.</Empty>}
          {operation.fieldVisible('notes') && deal.notes && <p className="op-prewrap">{deal.notes}</p>}
          {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
          {activeDeal && <div className="op-record-secondary-actions">{operation.actionVisible('win') && <Button variant="secondary" onClick={() => setResult('Ganha')}>Registrar venda</Button>}{operation.actionVisible('lose') && <Button variant="danger" onClick={() => setResult('Perdida')}>Registrar perda</Button>}</div>}
          {deal.lostReason && <p className="op-callout">{operation.label('lostReason', 'Motivo da perda')}: {deal.lostReason}</p>}
        </Section>

        <Section title="Acompanhamento">
          {d.tasks.filter(item => item.dealId === deal.id).sort((a, b) => a.due.localeCompare(b.due)).map(item => <label className="op-check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={change => w.mutate(data => { data.tasks.find(current => current.id === item.id)!.done = change.target.checked; data.deals.find(current => current.id === deal.id)!.events.push(event(`${change.target.checked ? 'Concluída' : 'Reaberta'} atividade: ${item.title}`)); syncDealNextActivity(data, deal.id); })} /><span className="op-grow"><strong>{item.title}</strong><small>{date(item.due, true)}</small></span><Badge>{item.done ? 'Concluída' : 'Pendente'}</Badge></label>)}
          {!d.tasks.some(item => item.dealId === deal.id) && <Empty>Nenhum acompanhamento registrado.</Empty>}
        </Section>
      </div>

      <Section title="Visitas, reuniões e ligações"><div className="op-list">{dealVisits.map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.kind} · {dayLabel(item.at)}</strong><small>{item.objective || item.offering || 'Sem objetivo informado'}{item.address ? ` · ${item.address}` : ''}{item.result ? ` · ${item.result}` : ''}</small></div><Badge>{item.status}</Badge></div>)}{!dealVisits.length && <Empty>Nenhum compromisso do cronograma está ligado a esta oportunidade.</Empty>}</div></Section>
      <Section title="Memória comercial"><Timeline events={deal.events} /></Section>

      {edit && <Modal title="Editar oportunidade" onClose={() => setEdit(false)}><DealForm w={w} deal={deal} onClose={() => setEdit(false)} onCreated={() => {}} /></Modal>}
      {task && <Modal title="Agendar próxima ação" onClose={() => setTask(false)}><RecordForm draftKey={`kronos-task:${deal.id}`} fields={[{ name: 'title', label: 'O que precisa ser feito?', required: true, wide: true }, { name: 'due', label: 'Quando?', type: 'datetime-local', required: true }]} onClose={() => setTask(false)} onSave={form => w.mutate(data => { data.tasks.push({ id: uid(), dealId: deal.id, title: form.title, due: form.due, done: false }); const current = data.deals.find(item => item.id === deal.id)!; current.events.push(event(`Próxima ação: ${form.title} · ${date(form.due, true)}`)); syncDealNextActivity(data, deal.id); })} /></Modal>}
      {contact && <Modal title="Registrar contato" onClose={() => setContact(false)}><RecordForm draftKey={`kronos-contact:${deal.id}`} fields={[{ name: 'outcome', label: 'O que aconteceu?', type: 'textarea', required: true, wide: true }, { name: 'temperature', label: 'Sua percepção agora', options: temperatureOptions, value: meta.temperature }, { name: 'stage', label: 'Momento após o contato', options: columns.map(value => ({ value, label: value })), value: deal.stage }, { name: 'nextAction', label: 'Próximo passo', wide: true }, { name: 'due', label: 'Quando?', type: 'datetime-local' }]} onClose={() => setContact(false)} submit="Registrar contato" onSave={form => w.mutate(data => {
        const current = data.deals.find(item => item.id === deal.id)!;
        const currentTask = data.tasks.filter(item => item.dealId === deal.id && !item.done).sort((a, b) => a.due.localeCompare(b.due))[0];
        if (currentTask) currentTask.done = true;
        if (form.stage && columns.includes(form.stage)) current.stage = form.stage;
        if ((form.nextAction && !form.due) || (!form.nextAction && form.due)) throw new Error('Informe o próximo passo e a data juntos.');
        if (form.nextAction && form.due) data.tasks.push({ id: uid(), dealId: deal.id, title: form.nextAction, due: form.due, done: false });
        setKronosDealMeta(data, deal.id, { temperature: (form.temperature || meta.temperature) as KronosTemperature, lastContactAt: now(), lastOutcome: form.outcome });
        syncDealNextActivity(data, deal.id);
        current.events.push(event(`Contato registrado: ${form.outcome}${form.stage !== deal.stage ? ` · Momento: ${form.stage}` : ''}${form.nextAction ? ` · Próximo passo: ${form.nextAction}` : ''}`));
      }, 'Contato registrado.')} /></Modal>}
      {result && <Modal title={result === 'Ganha' ? 'Confirmar venda realizada' : 'Registrar perda da negociação'} onClose={() => setResult('')}><RecordForm fields={[{ name: 'note', label: result === 'Ganha' ? 'Resumo do fechamento' : operation.label('lostReason', 'Motivo da perda'), type: 'textarea', required: true, wide: true }, ...(pendingFor(deal.id).length ? [{ name: 'pending', label: `${pendingFor(deal.id).length} ação(ões) ainda pendente(s)`, required: true, options: [{ value: 'close', label: 'Encerrar junto com a negociação' }, { value: 'keep', label: 'Manter para acompanhamento posterior' }] }] : [])]} onClose={() => setResult('')} submit={result === 'Ganha' ? 'Confirmar venda' : 'Confirmar perda'} onSave={form => w.mutate(data => { const current = data.deals.find(item => item.id === deal.id)!; if (isClosedDeal(current)) throw new Error('Esta negociação já foi encerrada.'); current.stage = result; current.lostReason = result === 'Perdida' ? form.note : ''; if (form.pending === 'close') for (const item of data.tasks.filter(item => item.dealId === deal.id && !item.done)) item.done = true; syncDealNextActivity(data, deal.id); current.events.push(event(`${result === 'Ganha' ? 'Venda confirmada' : 'Negociação perdida'}: ${form.note}`)); })} /></Modal>}
    </>;
  }

  const title = page === 'inicio' ? 'O que merece sua atenção agora?' : page === 'cronograma' ? 'Cronograma comercial' : page === 'atividades' ? 'Acompanhamento' : page === 'clientes' ? 'Carteira de clientes' : page === 'historico' ? 'Negociações encerradas' : 'Oportunidades';

  return <>
    {page !== 'clientes' && <Title eyebrow="Kronos / Operação comercial" title={title} action={<div className="op-actions"><Button variant="secondary" onClick={() => setLeadCreate(true)}><Users size={17} />Novo lead</Button>{page === 'cronograma' ? <Button onClick={() => setVisitCreate(true)}><CalendarCheck2 size={17} />Novo compromisso</Button> : <Button onClick={() => setCreate(true)}><Plus size={18} />Nova oportunidade</Button>}</div>}>{page === 'inicio' ? 'O funil organiza os dados por baixo. Aqui aparecem somente ações, riscos e oportunidades que ajudam a vender.' : undefined}</Title>}

    {page === 'inicio' && <>
      <div className="kronos-decision-summary"><div><Target size={20} /><span>Em negociação</span><strong>{active.length}</strong><small>{money(totalOpen)} em potencial registrado</small></div><div><TriangleAlert size={20} /><span>Precisam de atenção</span><strong>{needsAttention.length}</strong><small>Sem próxima ação, atrasadas ou paradas</small></div><div><Flame size={20} /><span>Sinais fortes</span><strong>{hot.length}</strong><small>Negociações com sinais de avanço</small></div><div><CalendarCheck2 size={20} /><span>Próximos compromissos</span><strong>{upcomingVisits.length}</strong><small>Visitas, reuniões e ligações planejadas</small></div></div>
      <div className="op-split kronos-home-grid"><Section title="Sua próxima ação"><div className="kronos-action-list">{active.map(item => ({ deal: item, task: nextTaskFor(item.id) })).filter(item => item.task).sort((a, b) => a.task!.due.localeCompare(b.task!.due)).slice(0, 7).map(({ deal: item, task: next }) => <button key={item.id} onClick={() => setSelected(item.id)}><time className={new Date(next!.due) < new Date() ? 'op-overdue' : ''}>{new Date(next!.due) < new Date() ? 'Atrasado' : dayLabel(next!.due)}</time><div><strong>{customer(item.customerId)?.name}</strong><span>{next!.title}</span><small>{item.title}</small></div><ArrowRight size={18} /></button>)}{!active.some(item => nextTaskFor(item.id)) && <Empty>Defina próximos passos nas oportunidades para o Kronos montar sua rotina comercial.</Empty>}</div></Section><Section title="Não deixe esfriar"><div className="kronos-attention-list">{needsAttention.slice(0, 6).map(({ deal: item, signal }) => <button key={item.id} onClick={() => setSelected(item.id)}><TriangleAlert size={18} /><div><strong>{customer(item.customerId)?.name}</strong><span>{item.title}</span><small>{signal.reasons.join(' · ')}</small></div><Badge>{signal.score}/100</Badge></button>)}{!needsAttention.length && <Empty>Nenhuma oportunidade crítica agora.</Empty>}</div></Section></div>
      <Section title="Negociações com sinais de avanço"><div className="kronos-opportunity-grid">{hot.slice(0, 6).map(({ deal: item, signal, meta }) => <button key={item.id} onClick={() => setSelected(item.id)}><div className="kronos-card-top"><span>{meta.motion || 'Origem não definida'}</span><Badge>{signal.label}</Badge></div><strong>{customer(item.customerId)?.name}</strong><h3>{item.title}</h3><div className="kronos-card-meta"><span>{money(item.value)}</span><span>{meta.temperature ? `Vendedor: ${meta.temperature}` : 'Sem percepção informada'}</span></div><small>{signal.reasons.join(' · ')}</small></button>)}{!hot.length && <Empty>À medida que contatos, retornos e propostas forem registrados, o Kronos destacará aqui as negociações com melhores sinais.</Empty>}</div></Section>
    </>}

    {page === 'cronograma' && <Cronograma w={w} visits={visits} onCreate={() => setVisitCreate(true)} onResult={setVisitResult} onOpenDeal={setSelected} />}
    {page === 'atividades' && <Section title="Próximas ações pendentes">{tasks.map(item => <div className="op-row" key={item.id}><button className="op-icon" aria-label={`Concluir ${item.title}`} onClick={() => w.mutate(data => { data.tasks.find(current => current.id === item.id)!.done = true; data.deals.find(current => current.id === item.dealId)?.events.push(event(`Atividade concluída: ${item.title}`)); syncDealNextActivity(data, item.dealId); })}><Check size={18} /></button><button className="op-grow op-row-main" onClick={() => setSelected(item.dealId)}><strong>{item.title}</strong><small>{d.deals.find(current => current.id === item.dealId)?.title} · {customer(d.deals.find(current => current.id === item.dealId)?.customerId || '')?.name}</small></button><span className={new Date(item.due) < new Date() ? 'op-overdue' : ''}>{date(item.due, true)}</span></div>)}{!tasks.length && <Empty>Todas as ações estão em dia.</Empty>}</Section>}
    {page === 'historico' && <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar negociação ou cliente" /><select value={filter} aria-label="Resultado" onChange={change => setFilter(change.target.value)}>{['Todos', 'Ganha', 'Perdida'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('export') && <Button variant="secondary" onClick={() => csv('negociacoes-kronos.csv', [['Oportunidade', 'Cliente', 'Valor', 'Resultado', 'Motivo'], ...filteredDeals.filter(item => isClosedDeal(item) && (filter === 'Todos' || item.stage === filter)).map(item => [item.title, customer(item.customerId)?.name, (item.value / 100).toFixed(2), item.stage, item.lostReason])])}><FileDown size={16} />Exportar</Button>}</div><div className="op-list">{filteredDeals.filter(item => isClosedDeal(item) && (filter === 'Todos' || item.stage === filter)).map(item => <button className="op-row" key={item.id} onClick={() => setSelected(item.id)}><div className="op-grow"><strong>{item.title}</strong><small>{customer(item.customerId)?.name}</small></div><Badge>{item.stage}</Badge><strong>{money(item.value)}</strong><ArrowRight size={16} /></button>)}</div></>}
    {page === 'clientes' && <CustomerManager w={w} title="Carteira" onOpen={customerRecord => <><Section title="Oportunidades">{d.deals.filter(item => item.customerId === customerRecord.id).map(item => <button className="op-row" key={item.id} onClick={() => setSelected(item.id)}><strong className="op-grow">{item.title}</strong><Badge>{item.stage}</Badge><b>{money(item.value)}</b></button>)}{!d.deals.some(item => item.customerId === customerRecord.id) && <Empty>Nenhuma oportunidade registrada.</Empty>}</Section><Section title="Cronograma">{visits.filter(item => item.customerId === customerRecord.id).map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.kind}</strong><small>{date(item.at, true)} · {item.objective || item.offering}</small></div><Badge>{item.status}</Badge></div>)}{!visits.some(item => item.customerId === customerRecord.id) && <Empty>Nenhum compromisso registrado.</Empty>}</Section></>} />}
    {page === 'oportunidades' && <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar oportunidade, cliente ou origem" /><span className="op-muted">{active.length} abertas · {money(totalOpen)} em potencial</span></div><div className="kronos-opportunity-list">{active.sort((a, b) => signalFor(a).score - signalFor(b).score).map(item => { const meta = getKronosDealMeta(d, item.id); const signal = signalFor(item); const next = nextTaskFor(item.id); return <button key={item.id} onClick={() => setSelected(item.id)}><div className="kronos-opportunity-main"><span className="op-kicker">{customer(item.customerId)?.name}</span><h3>{item.title}</h3><small>{meta.motion || 'Origem não definida'}{item.source ? ` · ${item.source}` : ''}</small></div><div><span>Momento</span><strong>{item.stage}</strong></div><div><span>Termômetro</span><strong>{meta.temperature || '—'}</strong><small>Kronos: {signal.label} {signal.score}/100</small></div><div><span>Próxima ação</span><strong className={next && new Date(next.due) < new Date() ? 'op-overdue' : ''}>{next ? dayLabel(next.due) : 'Sem ação'}</strong><small>{next?.title || signal.reasons[0]}</small></div><div className="kronos-value"><strong>{money(item.value)}</strong><ArrowRight size={17} /></div></button>; })}{!active.length && <Empty>Crie o primeiro lead ou oportunidade para iniciar a operação comercial.</Empty>}</div></>}

    {create && <Modal title="Nova oportunidade" onClose={() => setCreate(false)}><DealForm w={w} onClose={() => setCreate(false)} onCreated={id => setSelected(id)} /></Modal>}
    {leadCreate && <Modal title="Novo lead" onClose={() => setLeadCreate(false)}><LeadForm w={w} onClose={() => setLeadCreate(false)} onCreated={id => setSelected(id)} /></Modal>}
    {visitCreate && <Modal title="Novo compromisso comercial" onClose={() => setVisitCreate(false)}><VisitForm w={w} onClose={() => setVisitCreate(false)} /></Modal>}
    {visitResult && <Modal title={`Registrar resultado · ${visitResult.kind}`} onClose={() => setVisitResult(null)}><VisitResultForm w={w} visit={visitResult} onClose={() => setVisitResult(null)} /></Modal>}
  </>;
}

function Cronograma({ w, visits, onCreate, onResult, onOpenDeal }: { w: Workspace; visits: KronosVisit[]; onCreate: () => void; onResult: (visit: KronosVisit) => void; onOpenDeal: (id: string) => void }) {
  const [mode, setMode] = useState<'proximos' | 'realizados'>('proximos');
  const customer = (id: string) => w.data.customers.find(item => item.id === id);
  const filtered = visits.filter(item => mode === 'proximos' ? item.status === 'Planejada' : item.status !== 'Planejada').sort((a, b) => mode === 'proximos' ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at));
  return <>
    <KronosMap w={w} visits={visits} onOpenDeal={onOpenDeal} />
    <div className="op-toolbar"><div className="op-compact-tabs"><button className={mode === 'proximos' ? 'active' : ''} onClick={() => setMode('proximos')}>Próximos</button><button className={mode === 'realizados' ? 'active' : ''} onClick={() => setMode('realizados')}>Realizados e cancelados</button></div><Button variant="secondary" onClick={onCreate}><Plus size={16} />Adicionar</Button></div>
    <div className="kronos-schedule">{filtered.map(item => <article key={item.id}><div className="kronos-schedule-time"><strong>{dayLabel(item.at)}</strong><span>{item.at.includes('T') ? item.at.slice(11, 16) : ''}</span></div><div className="kronos-schedule-main"><span className="op-kicker">{item.kind}</span><h3>{customer(item.customerId)?.name || 'Cliente não encontrado'}</h3><p>{item.objective || item.offering || 'Sem objetivo informado'}</p><small>{item.address && `${item.address} · `}{item.offering && `Oferta: ${item.offering}`}{item.quoteStatus !== 'Sem cotação' && ` · Cotação: ${item.quoteStatus}`}{item.quoteValue ? ` · ${money(item.quoteValue)}` : ''}</small>{item.result && <div className="kronos-schedule-result"><strong>Resultado</strong><span>{item.result}</span>{item.followUp && <small>Próximo passo: {item.followUp} · {dayLabel(item.followUpAt)}</small>}</div>}</div><div className="kronos-schedule-actions"><Badge>{item.status}</Badge>{item.dealId && <Button variant="text" onClick={() => onOpenDeal(item.dealId)}>Abrir oportunidade</Button>}{item.status === 'Planejada' && <><Button variant="secondary" onClick={() => onResult(item)}>Registrar resultado</Button><Button variant="text" onClick={() => w.mutate(data => { updateKronosVisit(data, item.id, { status: 'Cancelada' }); }, 'Compromisso cancelado.')}>Cancelar</Button></>}</div></article>)}{!filtered.length && <Empty>{mode === 'proximos' ? 'Nenhum compromisso planejado.' : 'Ainda não há compromissos realizados ou cancelados.'}</Empty>}</div>
  </>;
}

function VisitForm({ w, onClose }: { w: Workspace; onClose: () => void }) {
  const activeDeals = w.data.deals.filter(item => !isClosedDeal(item));
  const suggestions = customerSuggestions(w.data);
  return <RecordForm draftKey="kronos-visit:new" fields={[
    { name: 'customer', label: 'Cliente / lead', required: true, suggestions, hint: 'Digite o nome. Se já existir, o Kronos reaproveita; se não existir, cria automaticamente.' },
    { name: 'dealId', label: 'Oportunidade relacionada', options: activeDeals.map(item => ({ value: item.id, label: `${w.data.customers.find(c => c.id === item.customerId)?.name || ''} · ${item.title}` })) },
    { name: 'kind', label: 'Tipo de compromisso', required: true, options: visitKindOptions, value: 'Visita' },
    { name: 'at', label: 'Data e horário', type: 'datetime-local', required: true },
    { name: 'address', label: 'Endereço / local da visita', wide: true, hint: 'Opcional. Quando informado, o Kronos localiza e aprende o ponto para o mapa.' },
    { name: 'offering', label: 'O que será oferecido?', wide: true },
    { name: 'objective', label: 'Objetivo da conversa', wide: true },
    { name: 'quoteStatus', label: 'Situação da cotação', options: quoteOptions, value: 'Sem cotação' },
    { name: 'quoteValue', label: 'Valor da cotação (R$)', type: 'number', min: 0, step: 0.01 },
    { name: 'notes', label: 'Contexto / observações', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Adicionar ao cronograma" onSave={async form => {
    const geo = form.address ? await geocodeAddress(form.address) : null;
    return w.mutate(data => {
      const resolved = resolveCustomer(data, form.customer);
      const existingLocation = getCustomerLocation(data, resolved.id);
      const deal = form.dealId ? data.deals.find(item => item.id === form.dealId) : undefined;
      if (deal && deal.customerId !== resolved.id) throw new Error('A oportunidade selecionada pertence a outro cliente. Digite o mesmo cliente da oportunidade ou deixe a oportunidade em branco.');
      const address = form.address?.trim() || existingLocation.address;
      const lat = geo?.lat ?? existingLocation.lat;
      const lng = geo?.lng ?? existingLocation.lng;
      if (address) setCustomerLocation(data, resolved.id, { address, lat, lng });
      const quoteValue = form.quoteValue ? cents(form.quoteValue) : 0;
      const visit = newKronosVisit({ customerId: resolved.id, dealId: form.dealId || '', kind: form.kind as KronosVisit['kind'], at: form.at, offering: form.offering || '', objective: form.objective || '', quoteStatus: (form.quoteStatus || 'Sem cotação') as KronosQuoteStatus, quoteValue, notes: form.notes || '', address, lat, lng });
      upsertKronosVisit(data, visit);
      if (visit.dealId) { const current = data.deals.find(item => item.id === visit.dealId)!; current.events.push(event(`${visit.kind} agendada para ${date(visit.at, true)}${visit.objective ? ` · Objetivo: ${visit.objective}` : ''}`)); setKronosDealMeta(data, current.id, { quoteStatus: visit.quoteStatus, quoteValue: visit.quoteValue }); }
    }, geo || !form.address ? 'Cronograma atualizado.' : 'Cronograma atualizado. O endereço foi salvo, mas não foi possível posicionar o pino automaticamente.');
  }} />;
}

function VisitResultForm({ w, visit, onClose }: { w: Workspace; visit: KronosVisit; onClose: () => void }) {
  const meta = visit.dealId ? getKronosDealMeta(w.data, visit.dealId) : null;
  return <RecordForm draftKey={`kronos-visit-result:${visit.id}`} fields={[{ name: 'result', label: 'O que aconteceu?', type: 'textarea', required: true, wide: true }, ...(visit.dealId ? [{ name: 'temperature', label: 'Percepção da oportunidade', options: temperatureOptions, value: meta?.temperature }] : []), { name: 'followUp', label: 'Próximo passo', wide: true }, { name: 'followUpAt', label: 'Quando?', type: 'datetime-local' }]} onClose={onClose} submit="Concluir compromisso" onSave={form => w.mutate(data => {
    if ((form.followUp && !form.followUpAt) || (!form.followUp && form.followUpAt)) throw new Error('Informe o próximo passo e a data juntos.');
    updateKronosVisit(data, visit.id, { status: 'Realizada', result: form.result, followUp: form.followUp || '', followUpAt: form.followUpAt || '', followUpDone: false });
    if (visit.dealId) { const current = data.deals.find(item => item.id === visit.dealId)!; setKronosDealMeta(data, current.id, { temperature: (form.temperature || meta?.temperature || '') as KronosTemperature, lastContactAt: now(), lastOutcome: form.result }); if (form.followUp && form.followUpAt) data.tasks.push({ id: uid(), dealId: current.id, title: form.followUp, due: form.followUpAt, done: false }); syncDealNextActivity(data, current.id); current.events.push(event(`${visit.kind} realizada: ${form.result}${form.followUp ? ` · Próximo passo: ${form.followUp}` : ''}`)); }
  }, 'Resultado registrado.')} />;
}

function LeadForm({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  const suggestions = customerSuggestions(w.data);
  return <RecordForm draftKey="kronos-lead:new" fields={[
    { name: 'name', label: 'Nome ou empresa', required: true, wide: true, suggestions, hint: 'Digite livremente. Se o cliente já existir, o cadastro é reutilizado.' },
    { name: 'phone', label: 'Telefone', type: 'tel' }, { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'title', label: 'O que podemos oferecer?', required: true, wide: true }, { name: 'motion', label: 'Como essa oportunidade nasceu?', required: true, options: motionOptions },
    { name: 'source', label: 'Origem / canal', wide: true, hint: 'Ex.: indicação, prospecção, site, WhatsApp, evento.' }, { name: 'temperature', label: 'Percepção inicial', options: temperatureOptions },
    { name: 'value', label: 'Potencial estimado (R$)', type: 'number', min: 0, step: 0.01 }, { name: 'notes', label: 'Contexto inicial', type: 'textarea', wide: true },
    { name: 'nextAction', label: 'Primeiro próximo passo', wide: true }, { name: 'due', label: 'Quando?', type: 'datetime-local' }
  ]} onClose={onClose} submit="Criar lead" onSave={form => w.mutate(data => {
    if ((form.nextAction && !form.due) || (!form.nextAction && form.due)) throw new Error('Informe o próximo passo e a data juntos.');
    const resolved = resolveCustomer(data, form.name, { phone: form.phone, email: form.email });
    const stages = data.settings.salesStages?.length >= 2 ? data.settings.salesStages : fallbackColumns;
    const dealId = uid();
    data.deals.push({ id: dealId, number: nextNumber(data.deals), title: form.title, customerId: resolved.id, value: form.value ? cents(form.value) : 0, stage: stages[0], source: form.source || '', nextAction: '', due: '', notes: form.notes || '', lostReason: '', events: [event(`Lead criado · ${form.motion}${form.source ? ` · Origem: ${form.source}` : ''}`)], createdAt: now() });
    setKronosDealMeta(data, dealId, { motion: form.motion as KronosDealMeta['motion'], temperature: (form.temperature || '') as KronosTemperature, quoteStatus: 'Sem cotação', quoteValue: 0 });
    if (form.nextAction && form.due) data.tasks.push({ id: uid(), dealId, title: form.nextAction, due: form.due, done: false });
    syncDealNextActivity(data, dealId); onCreated(dealId);
  }, 'Lead criado.')} />;
}

function DealForm({ w, deal, onClose, onCreated }: { w: Workspace; deal?: Deal; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('kronos');
  const meta = deal ? getKronosDealMeta(w.data, deal.id) : null;
  const custom = useMemo(() => operation.preferences.customFields.filter(field => field.visible && ['Cliente', 'Oportunidade', 'Qualificação', 'Próxima ação'].includes(field.group)), [operation.preferences.customFields]);
  const savedCustom = deal ? customValues(w.data, deal.id) : {};
  const currentCustomer = deal ? w.data.customers.find(item => item.id === deal.customerId) : undefined;
  return <RecordForm draftKey={`kronos-deal:${deal?.id || 'new'}`} fields={[
    { name: 'title', label: operation.label('dealTitle', 'O que será negociado?'), required: true, wide: true, value: deal?.title },
    { name: 'customer', label: operation.label('customer', 'Cliente / lead'), required: true, suggestions: customerSuggestions(w.data), value: currentCustomer?.name, hint: 'Não precisa cadastrar antes: digite o nome e continue.' },
    { name: 'motion', label: 'Tipo de geração', options: motionOptions, value: meta?.motion },
    ...(operation.fieldVisible('value') ? [{ name: 'value', label: `${operation.label('value', 'Valor previsto')} (R$)`, type: 'number', min: 0, step: 0.01, value: deal ? deal.value / 100 : '' }] : []),
    ...(operation.fieldVisible('source') ? [{ name: 'source', label: operation.label('source', 'Origem / canal'), value: deal?.source }] : []),
    { name: 'temperature', label: 'Percepção do vendedor', options: temperatureOptions, value: meta?.temperature }, { name: 'quoteStatus', label: 'Situação da cotação', options: quoteOptions, value: meta?.quoteStatus || 'Sem cotação' },
    { name: 'quoteValue', label: 'Valor da cotação (R$)', type: 'number', min: 0, step: 0.01, value: meta?.quoteValue ? meta.quoteValue / 100 : '' },
    ...(operation.fieldVisible('due') ? [{ name: 'due', label: operation.label('due', 'Próximo contato'), type: 'datetime-local', value: deal?.due ? (deal.due.includes('T') ? deal.due : `${deal.due}T09:00`) : '' }] : []),
    ...(operation.fieldVisible('nextAction') ? [{ name: 'nextAction', label: operation.label('nextAction', 'Objetivo do próximo contato'), wide: true, value: deal?.nextAction }] : []),
    ...(operation.fieldVisible('notes') ? [{ name: 'notes', label: operation.label('notes', 'Contexto da negociação'), type: 'textarea', wide: true, value: deal?.notes }] : []),
    ...custom.map(field => ({ name: `custom__${field.id}`, label: field.label, wide: true, value: savedCustom[field.id] || '' }))
  ]} onClose={onClose} onSave={form => w.mutate(data => {
    const resolved = resolveCustomer(data, form.customer);
    const recordIdValue = deal?.id || uid();
    if ((form.due && !form.nextAction) || (form.nextAction && !form.due)) throw new Error('Informe o próximo compromisso e a data juntos.');
    if (deal) {
      const current = data.deals.find(item => item.id === deal.id)!; current.title = form.title; current.customerId = resolved.id; if (form.value !== undefined) current.value = form.value ? cents(form.value) : 0; if (form.source !== undefined) current.source = form.source; if (form.notes !== undefined) current.notes = form.notes;
      const pending = data.tasks.filter(item => item.dealId === deal.id && !item.done).sort((a, b) => a.due.localeCompare(b.due))[0];
      if (form.due !== undefined || form.nextAction !== undefined) { if (form.due && form.nextAction) { if (pending) { pending.due = form.due; pending.title = form.nextAction; } else data.tasks.push({ id: uid(), dealId: deal.id, title: form.nextAction, due: form.due, done: false }); } else if (pending) pending.done = true; }
      syncDealNextActivity(data, deal.id); setKronosDealMeta(data, deal.id, { motion: (form.motion || meta?.motion || '') as KronosDealMeta['motion'], temperature: (form.temperature || meta?.temperature || '') as KronosTemperature, quoteStatus: (form.quoteStatus || meta?.quoteStatus || 'Sem cotação') as KronosQuoteStatus, quoteValue: form.quoteValue ? cents(form.quoteValue) : 0 }); current.events.push(event('Oportunidade atualizada'));
    } else {
      const stages = data.settings.salesStages?.length >= 2 ? data.settings.salesStages : fallbackColumns;
      const record: Deal = { id: recordIdValue, number: nextNumber(data.deals), title: form.title, customerId: resolved.id, value: form.value ? cents(form.value) : 0, source: form.source || '', due: '', nextAction: '', notes: form.notes || '', stage: stages[0], lostReason: '', createdAt: now(), events: [event('Oportunidade criada')] };
      data.deals.push(record); setKronosDealMeta(data, record.id, { motion: (form.motion || '') as KronosDealMeta['motion'], temperature: (form.temperature || '') as KronosTemperature, quoteStatus: (form.quoteStatus || 'Sem cotação') as KronosQuoteStatus, quoteValue: form.quoteValue ? cents(form.quoteValue) : 0 }); if (form.due && form.nextAction) data.tasks.push({ id: uid(), dealId: record.id, title: form.nextAction, due: form.due, done: false }); syncDealNextActivity(data, record.id); onCreated(record.id);
    }
    setCustomValues(data, recordIdValue, Object.fromEntries(custom.map(field => [field.id, form[`custom__${field.id}`] || savedCustom[field.id] || ''])));
  })} />;
}
