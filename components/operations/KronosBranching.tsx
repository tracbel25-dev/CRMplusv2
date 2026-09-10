'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarCheck2, Check, FileDown, Flame, PhoneCall,
  Plus, Target, TriangleAlert, Users
} from 'lucide-react';
import {
  type Deal, cents, date, event, localDay, money, nextNumber, now,
  syncDealNextActivity, uid
} from '@/lib/operations/model';
import {
  geocodeAddress, getKronosDealMeta, getKronosVisits, isClosedDeal, kronosSignal,
  newKronosVisit, setKronosDealMeta, updateKronosVisit, upsertKronosVisit,
  type KronosDealMeta, type KronosQuoteStatus, type KronosTemperature, type KronosVisit
} from '@/lib/operations/kronos';
import { customerSuggestions, getCustomerLocation, resolveCustomer, setCustomerLocation } from '@/lib/operations/customers';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { type Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section,
  Timeline, Title
} from './ui';
import { useRecordRoute } from './useRecordRoute';
import { KronosMap } from './KronosMap';

const fallbackMoments = ['Identificado', 'Contato iniciado', 'Interesse confirmado', 'Proposta', 'Negociação'];
const motionOptions = [
  { value: 'Ativa', label: 'Venda ativa — nós fomos atrás' },
  { value: 'Reativa', label: 'Venda reativa — o cliente veio até nós' }
];
const temperatureOptions = ['Fria', 'Morna', 'Quente'].map(value => ({ value, label: value }));
const quoteOptions = ['Sem cotação', 'Em elaboração', 'Enviada', 'Aprovada', 'Reprovada'].map(value => ({ value, label: value }));
const visitKindOptions = ['Visita', 'Ligação', 'Reunião', 'Demonstração'].map(value => ({ value, label: value }));

type Branch = 'contato' | 'proposta' | 'momento' | 'acao' | null;

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
  const [visitDealId, setVisitDealId] = useState<string | null>(null);
  const [visitResult, setVisitResult] = useState<KronosVisit | null>(null);
  const [branch, setBranch] = useState<Branch>(null);
  const [result, setResult] = useState<'Ganha' | 'Perdida' | ''>('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');

  const d = w.data;
  const moments = d.settings.salesStages?.length >= 2 ? d.settings.salesStages : fallbackMoments;
  const visits = useMemo(() => getKronosVisits(d), [d]);
  const customer = (id: string) => d.customers.find(item => item.id === id);
  const deal = d.deals.find(item => item.id === selected);
  const pendingFor = (id: string) => d.tasks.filter(item => item.dealId === id && !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const nextTaskFor = (id: string) => pendingFor(id)[0];
  const signalFor = (item: Deal) => kronosSignal(d, item, moments);
  const valueFor = (item: Deal) => getKronosDealMeta(d, item.id).quoteValue || item.value;
  const filteredDeals = d.deals.filter(item => `${item.title} ${customer(item.customerId)?.name} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const active = filteredDeals.filter(item => !isClosedDeal(item));
  const tasks = d.tasks.filter(item => !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const totalOpen = active.reduce((sum, item) => sum + valueFor(item), 0);
  const needsAttention = active.map(item => ({ deal: item, signal: signalFor(item) })).filter(item => item.signal.label === 'Atenção').sort((a, b) => a.signal.score - b.signal.score);
  const hot = active.map(item => ({ deal: item, signal: signalFor(item), meta: getKronosDealMeta(d, item.id) })).filter(item => item.signal.label === 'Forte' || item.meta.temperature === 'Quente').sort((a, b) => b.signal.score - a.signal.score);
  const upcomingVisits = visits.filter(item => item.status === 'Planejada').sort((a, b) => a.at.localeCompare(b.at));

  if (deal) {
    const meta = getKronosDealMeta(d, deal.id);
    const signal = signalFor(deal);
    const nextTask = nextTaskFor(deal.id);
    const activeDeal = !isClosedDeal(deal);
    const dealVisits = visits.filter(item => item.dealId === deal.id).sort((a, b) => b.at.localeCompare(a.at));

    return <>
      <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar à operação</Button>
      <Title
        eyebrow={`Oportunidade ${String(deal.number).padStart(4, '0')}`}
        title={deal.title}
        action={activeDeal ? <Button variant="secondary" onClick={() => setBranch('contato')}><PhoneCall size={16} />Registrar contato</Button> : undefined}
      >
        {customer(deal.customerId)?.name} · {customer(deal.customerId)?.phone || 'Sem telefone cadastrado'}
      </Title>

      <div className="kronos-context-strip">
        <div><span>Origem</span><strong>{meta.motion || 'Não definida'}</strong><small>{deal.source || 'Canal não informado'}</small></div>
        <div><span>Momento atual</span><strong>{deal.stage}</strong><small>Não é uma sequência obrigatória</small></div>
        <div><span>Termômetro</span><strong>{meta.temperature || 'Não informado'}</strong><small>Kronos: {signal.label} · {signal.score}/100</small></div>
        <div><span>Proposta</span><strong>{meta.quoteStatus}</strong><small>{meta.quoteValue ? money(meta.quoteValue) : 'Valor ainda não informado'}</small></div>
      </div>

      {activeDeal && <Section title="Ramificações desta oportunidade">
        <div className="op-actions">
          <Button variant="secondary" onClick={() => setBranch('contato')}><PhoneCall size={16} />Contato</Button>
          <Button variant="secondary" onClick={() => setVisitDealId(deal.id)}><CalendarCheck2 size={16} />Visita / reunião</Button>
          <Button variant="secondary" onClick={() => setBranch('proposta')}>Proposta / cotação</Button>
          <Button variant="secondary" onClick={() => setBranch('acao')}>Próxima ação</Button>
          <Button variant="secondary" onClick={() => setBranch('momento')}>Atualizar momento</Button>
        </div>
        <p className="op-muted">Use somente a ramificação que aconteceu agora. Nenhuma delas exige preencher as outras antes.</p>
      </Section>}

      <div className="op-split">
        <Section title="O que precisa acontecer agora">
          {nextTask ? <div className="kronos-next-action"><span className={new Date(nextTask.due) < new Date() ? 'op-overdue' : ''}>{dayLabel(nextTask.due)}</span><strong>{nextTask.title}</strong><small>{new Date(nextTask.due) < new Date() ? 'Esta ação está atrasada.' : 'Próxima ação registrada.'}</small></div> : <Empty>Sem próxima ação definida. Isso não impede a oportunidade; o Kronos apenas sinaliza para não cair no esquecimento.</Empty>}
          {deal.notes && <p className="op-prewrap">{deal.notes}</p>}
          {activeDeal && <div className="op-record-secondary-actions">
            <Button variant="secondary" onClick={() => setResult('Ganha')}>Registrar venda</Button>
            <Button variant="danger" onClick={() => setResult('Perdida')}>Registrar perda</Button>
          </div>}
          {deal.lostReason && <p className="op-callout">Motivo da perda: {deal.lostReason}</p>}
        </Section>

        <Section title="Acompanhamento">
          {d.tasks.filter(item => item.dealId === deal.id).sort((a, b) => a.due.localeCompare(b.due)).map(item => <label className="op-check-row" key={item.id}>
            <input type="checkbox" checked={item.done} onChange={change => w.mutate(data => {
              const currentTask = data.tasks.find(current => current.id === item.id);
              if (!currentTask) return;
              currentTask.done = change.target.checked;
              data.deals.find(current => current.id === deal.id)?.events.push(event(`${change.target.checked ? 'Concluída' : 'Reaberta'} ação: ${item.title}`));
              syncDealNextActivity(data, deal.id);
            })} />
            <span className="op-grow"><strong>{item.title}</strong><small>{date(item.due, true)}</small></span><Badge>{item.done ? 'Concluída' : 'Pendente'}</Badge>
          </label>)}
          {!d.tasks.some(item => item.dealId === deal.id) && <Empty>Nenhuma ação registrada.</Empty>}
        </Section>
      </div>

      <Section title="Visitas, reuniões e ligações">
        <div className="op-list">{dealVisits.map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.kind} · {dayLabel(item.at)}</strong><small>{item.objective || item.offering || 'Sem objetivo informado'}{item.result ? ` · ${item.result}` : ''}</small></div><Badge>{item.status}</Badge>{item.status === 'Planejada' && <Button variant="text" onClick={() => setVisitResult(item)}>Registrar resultado</Button>}</div>)}{!dealVisits.length && <Empty>Nenhum compromisso ligado a esta oportunidade.</Empty>}</div>
      </Section>
      <Section title="Memória comercial"><Timeline events={deal.events} /></Section>

      {branch === 'contato' && <Modal title="Registrar contato" onClose={() => setBranch(null)}><ContactBranch w={w} deal={deal} meta={meta} onClose={() => setBranch(null)} /></Modal>}
      {branch === 'proposta' && <Modal title="Atualizar proposta / cotação" onClose={() => setBranch(null)}><ProposalBranch w={w} deal={deal} meta={meta} onClose={() => setBranch(null)} /></Modal>}
      {branch === 'momento' && <Modal title="Atualizar momento da oportunidade" onClose={() => setBranch(null)}><MomentBranch w={w} deal={deal} moments={moments} onClose={() => setBranch(null)} /></Modal>}
      {branch === 'acao' && <Modal title="Registrar próxima ação" onClose={() => setBranch(null)}><ActionBranch w={w} deal={deal} onClose={() => setBranch(null)} /></Modal>}
      {visitDealId !== null && <Modal title="Novo compromisso comercial" onClose={() => setVisitDealId(null)}><VisitForm w={w} presetDealId={visitDealId} onClose={() => setVisitDealId(null)} /></Modal>}
      {visitResult && <Modal title={`Registrar resultado · ${visitResult.kind}`} onClose={() => setVisitResult(null)}><VisitResultForm w={w} visit={visitResult} onClose={() => setVisitResult(null)} /></Modal>}
      {result && <Modal title={result === 'Ganha' ? 'Registrar venda' : 'Registrar perda'} onClose={() => setResult('')}><ResultBranch w={w} deal={deal} result={result} onClose={() => setResult('')} /></Modal>}
    </>;
  }

  const title = page === 'inicio' ? 'O que merece sua atenção agora?' : page === 'cronograma' ? 'Cronograma comercial' : page === 'atividades' ? 'Acompanhamento' : page === 'clientes' ? 'Carteira de clientes' : page === 'historico' ? 'Negociações encerradas' : 'Oportunidades';

  return <>
    {page !== 'clientes' && <Title eyebrow="Kronos / Operação comercial" title={title} action={<div className="op-actions"><Button variant="secondary" onClick={() => setLeadCreate(true)}><Users size={17} />Novo lead</Button>{page === 'cronograma' ? <Button onClick={() => setVisitDealId('')}><CalendarCheck2 size={17} />Novo compromisso</Button> : <Button onClick={() => setCreate(true)}><Plus size={18} />Nova oportunidade</Button>}</div>}>{page === 'inicio' ? 'A oportunidade nasce simples. Os dados aparecem conforme contatos, visitas, propostas e acompanhamentos realmente acontecem.' : undefined}</Title>}

    {page === 'inicio' && <>
      <div className="kronos-decision-summary">
        <div><Target size={20} /><span>Em negociação</span><strong>{active.length}</strong><small>{money(totalOpen)} em propostas/potencial registrado</small></div>
        <div><TriangleAlert size={20} /><span>Precisam de atenção</span><strong>{needsAttention.length}</strong><small>Sem ação, atrasadas ou paradas</small></div>
        <div><Flame size={20} /><span>Sinais fortes</span><strong>{hot.length}</strong><small>Negociações com sinais de avanço</small></div>
        <div><CalendarCheck2 size={20} /><span>Próximos compromissos</span><strong>{upcomingVisits.length}</strong><small>Visitas, reuniões e ligações</small></div>
      </div>
      <div className="op-split kronos-home-grid">
        <Section title="Sua próxima ação"><div className="kronos-action-list">{active.map(item => ({ deal: item, task: nextTaskFor(item.id) })).filter(item => item.task).sort((a, b) => a.task!.due.localeCompare(b.task!.due)).slice(0, 7).map(({ deal: item, task }) => <button key={item.id} onClick={() => setSelected(item.id)}><time className={new Date(task!.due) < new Date() ? 'op-overdue' : ''}>{new Date(task!.due) < new Date() ? 'Atrasado' : dayLabel(task!.due)}</time><div><strong>{customer(item.customerId)?.name}</strong><span>{task!.title}</span><small>{item.title}</small></div><ArrowRight size={18} /></button>)}{!active.some(item => nextTaskFor(item.id)) && <Empty>As próximas ações surgem quando forem registradas nas ramificações da oportunidade.</Empty>}</div></Section>
        <Section title="Não deixe esfriar"><div className="kronos-attention-list">{needsAttention.slice(0, 6).map(({ deal: item, signal }) => <button key={item.id} onClick={() => setSelected(item.id)}><TriangleAlert size={18} /><div><strong>{customer(item.customerId)?.name}</strong><span>{item.title}</span><small>{signal.reasons.join(' · ')}</small></div><Badge>{signal.score}/100</Badge></button>)}{!needsAttention.length && <Empty>Nenhuma oportunidade crítica agora.</Empty>}</div></Section>
      </div>
    </>}

    {page === 'cronograma' && <Cronograma w={w} visits={visits} onCreate={() => setVisitDealId('')} onResult={setVisitResult} onOpenDeal={setSelected} />}
    {page === 'atividades' && <Section title="Próximas ações pendentes">{tasks.map(item => <div className="op-row" key={item.id}><button className="op-icon" aria-label={`Concluir ${item.title}`} onClick={() => w.mutate(data => { const task = data.tasks.find(current => current.id === item.id); if (!task) return; task.done = true; data.deals.find(current => current.id === item.dealId)?.events.push(event(`Ação concluída: ${item.title}`)); syncDealNextActivity(data, item.dealId); })}><Check size={18} /></button><button className="op-grow op-row-main" onClick={() => setSelected(item.dealId)}><strong>{item.title}</strong><small>{d.deals.find(current => current.id === item.dealId)?.title} · {customer(d.deals.find(current => current.id === item.dealId)?.customerId || '')?.name}</small></button><span className={new Date(item.due) < new Date() ? 'op-overdue' : ''}>{date(item.due, true)}</span></div>)}{!tasks.length && <Empty>Todas as ações estão em dia.</Empty>}</Section>}
    {page === 'historico' && <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar negociação ou cliente" /><select value={filter} aria-label="Resultado" onChange={change => setFilter(change.target.value)}>{['Todos', 'Ganha', 'Perdida'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('export') && <Button variant="secondary" onClick={() => csv('negociacoes-kronos.csv', [['Oportunidade', 'Cliente', 'Valor', 'Resultado', 'Motivo'], ...filteredDeals.filter(item => isClosedDeal(item) && (filter === 'Todos' || item.stage === filter)).map(item => [item.title, customer(item.customerId)?.name, (valueFor(item) / 100).toFixed(2), item.stage, item.lostReason])])}><FileDown size={16} />Exportar</Button>}</div><div className="op-list">{filteredDeals.filter(item => isClosedDeal(item) && (filter === 'Todos' || item.stage === filter)).map(item => <button className="op-row" key={item.id} onClick={() => setSelected(item.id)}><div className="op-grow"><strong>{item.title}</strong><small>{customer(item.customerId)?.name}</small></div><Badge>{item.stage}</Badge><strong>{valueFor(item) ? money(valueFor(item)) : '—'}</strong><ArrowRight size={16} /></button>)}</div></>}
    {page === 'clientes' && <CustomerManager w={w} title="Carteira" onOpen={customerRecord => <><Section title="Oportunidades">{d.deals.filter(item => item.customerId === customerRecord.id).map(item => <button className="op-row" key={item.id} onClick={() => setSelected(item.id)}><strong className="op-grow">{item.title}</strong><Badge>{item.stage}</Badge><b>{valueFor(item) ? money(valueFor(item)) : '—'}</b></button>)}{!d.deals.some(item => item.customerId === customerRecord.id) && <Empty>Nenhuma oportunidade registrada.</Empty>}</Section><Section title="Cronograma">{visits.filter(item => item.customerId === customerRecord.id).map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.kind}</strong><small>{date(item.at, true)} · {item.objective || item.offering}</small></div><Badge>{item.status}</Badge></div>)}{!visits.some(item => item.customerId === customerRecord.id) && <Empty>Nenhum compromisso registrado.</Empty>}</Section></>} />}
    {page === 'oportunidades' && <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar oportunidade, cliente ou origem" /><span className="op-muted">{active.length} abertas</span></div><div className="kronos-opportunity-list">{active.sort((a, b) => signalFor(a).score - signalFor(b).score).map(item => { const meta = getKronosDealMeta(d, item.id); const signal = signalFor(item); const next = nextTaskFor(item.id); return <button key={item.id} onClick={() => setSelected(item.id)}><div className="kronos-opportunity-main"><span className="op-kicker">{customer(item.customerId)?.name}</span><h3>{item.title}</h3><small>{meta.motion || 'Origem não definida'}{item.source ? ` · ${item.source}` : ''}</small></div><div><span>Momento</span><strong>{item.stage}</strong></div><div><span>Termômetro</span><strong>{meta.temperature || '—'}</strong><small>Kronos: {signal.label} {signal.score}/100</small></div><div><span>Próxima ação</span><strong className={next && new Date(next.due) < new Date() ? 'op-overdue' : ''}>{next ? dayLabel(next.due) : 'Sem ação'}</strong><small>{next?.title || signal.reasons[0]}</small></div><div className="kronos-value"><strong>{valueFor(item) ? money(valueFor(item)) : '—'}</strong><ArrowRight size={17} /></div></button>; })}{!active.length && <Empty>Crie uma oportunidade com o mínimo. O restante será registrado conforme a negociação acontecer.</Empty>}</div></>}

    {create && <Modal title="Nova oportunidade" onClose={() => setCreate(false)}><OpportunityBaseForm w={w} onClose={() => setCreate(false)} onCreated={id => { setCreate(false); setSelected(id); }} /></Modal>}
    {leadCreate && <Modal title="Novo lead" onClose={() => setLeadCreate(false)}><LeadForm w={w} onClose={() => setLeadCreate(false)} onCreated={id => { setLeadCreate(false); setSelected(id); }} /></Modal>}
    {visitDealId !== null && <Modal title="Novo compromisso comercial" onClose={() => setVisitDealId(null)}><VisitForm w={w} presetDealId={visitDealId} onClose={() => setVisitDealId(null)} /></Modal>}
    {visitResult && <Modal title={`Registrar resultado · ${visitResult.kind}`} onClose={() => setVisitResult(null)}><VisitResultForm w={w} visit={visitResult} onClose={() => setVisitResult(null)} /></Modal>}
  </>;
}

function OpportunityBaseForm({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  return <RecordForm draftKey="kronos-opportunity:new" fields={[
    { name: 'customer', label: 'Cliente / lead', required: true, suggestions: customerSuggestions(w.data), hint: 'Digite. Se não existir, o cadastro nasce automaticamente.' },
    { name: 'title', label: 'O que estamos tentando vender?', required: true, wide: true },
    { name: 'motion', label: 'Como surgiu?', required: true, options: motionOptions },
    { name: 'source', label: 'Origem / canal', wide: true, hint: 'Opcional: indicação, prospecção, site, WhatsApp...' },
    { name: 'notes', label: 'Contexto inicial', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Criar oportunidade" onSave={form => w.mutate(data => {
    const resolved = resolveCustomer(data, form.customer);
    const stages = data.settings.salesStages?.length >= 2 ? data.settings.salesStages : fallbackMoments;
    const id = uid();
    data.deals.push({ id, number: nextNumber(data.deals), title: form.title.trim(), customerId: resolved.id, value: 0, stage: stages[0], source: form.source || '', nextAction: '', due: '', notes: form.notes || '', lostReason: '', events: [event(`Oportunidade criada · ${form.motion}`)], createdAt: now() });
    setKronosDealMeta(data, id, { motion: form.motion as KronosDealMeta['motion'], temperature: '', quoteStatus: 'Sem cotação', quoteValue: 0 });
    onCreated(id);
  }, 'Oportunidade criada. O restante será preenchido conforme ela evoluir.')} />;
}

function LeadForm({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  return <RecordForm draftKey="kronos-lead:new" fields={[
    { name: 'name', label: 'Nome ou empresa', required: true, wide: true, suggestions: customerSuggestions(w.data) },
    { name: 'phone', label: 'Telefone', type: 'tel' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'title', label: 'Possível interesse / oferta', required: true, wide: true },
    { name: 'motion', label: 'Como surgiu?', required: true, options: motionOptions },
    { name: 'source', label: 'Origem / canal', wide: true },
    { name: 'notes', label: 'Contexto', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Criar lead" onSave={form => w.mutate(data => {
    const resolved = resolveCustomer(data, form.name, { phone: form.phone, email: form.email });
    const stages = data.settings.salesStages?.length >= 2 ? data.settings.salesStages : fallbackMoments;
    const id = uid();
    data.deals.push({ id, number: nextNumber(data.deals), title: form.title.trim(), customerId: resolved.id, value: 0, stage: stages[0], source: form.source || '', nextAction: '', due: '', notes: form.notes || '', lostReason: '', events: [event(`Lead identificado · ${form.motion}`)], createdAt: now() });
    setKronosDealMeta(data, id, { motion: form.motion as KronosDealMeta['motion'], temperature: '', quoteStatus: 'Sem cotação', quoteValue: 0 });
    onCreated(id);
  }, 'Lead registrado.')} />;
}

function ContactBranch({ w, deal, meta, onClose }: { w: Workspace; deal: Deal; meta: KronosDealMeta; onClose: () => void }) {
  return <RecordForm draftKey={`kronos-contact:${deal.id}`} fields={[
    { name: 'outcome', label: 'O que aconteceu?', type: 'textarea', required: true, wide: true },
    { name: 'temperature', label: 'Sua percepção agora', options: temperatureOptions, value: meta.temperature },
    { name: 'nextAction', label: 'Próximo passo', wide: true },
    { name: 'due', label: 'Quando?', type: 'datetime-local' }
  ]} onClose={onClose} submit="Registrar contato" onSave={form => w.mutate(data => {
    if ((form.nextAction && !form.due) || (!form.nextAction && form.due)) throw new Error('Informe o próximo passo e a data juntos.');
    const current = data.deals.find(item => item.id === deal.id);
    if (!current || isClosedDeal(current)) throw new Error('Esta oportunidade não está aberta.');
    if (form.nextAction && form.due) data.tasks.push({ id: uid(), dealId: deal.id, title: form.nextAction, due: form.due, done: false });
    setKronosDealMeta(data, deal.id, { temperature: (form.temperature || meta.temperature) as KronosTemperature, lastContactAt: now(), lastOutcome: form.outcome });
    syncDealNextActivity(data, deal.id);
    current.events.push(event(`Contato: ${form.outcome}${form.nextAction ? ` · Próximo passo: ${form.nextAction}` : ''}`));
  }, 'Contato registrado.')} />;
}

function ProposalBranch({ w, deal, meta, onClose }: { w: Workspace; deal: Deal; meta: KronosDealMeta; onClose: () => void }) {
  return <RecordForm draftKey={`kronos-proposal:${deal.id}`} fields={[
    { name: 'quoteStatus', label: 'Situação da proposta / cotação', required: true, options: quoteOptions, value: meta.quoteStatus },
    { name: 'quoteValue', label: 'Valor (R$)', type: 'number', min: 0, step: 0.01, value: meta.quoteValue ? meta.quoteValue / 100 : '' },
    { name: 'note', label: 'O que mudou?', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Salvar proposta" onSave={form => w.mutate(data => {
    const current = data.deals.find(item => item.id === deal.id);
    if (!current || isClosedDeal(current)) throw new Error('Esta oportunidade não está aberta.');
    const quoteValue = form.quoteValue ? cents(form.quoteValue) : 0;
    setKronosDealMeta(data, deal.id, { quoteStatus: form.quoteStatus as KronosQuoteStatus, quoteValue });
    if (quoteValue) current.value = quoteValue;
    current.events.push(event(`Proposta/cotação: ${form.quoteStatus}${quoteValue ? ` · ${money(quoteValue)}` : ''}${form.note ? ` · ${form.note}` : ''}`));
  }, 'Proposta atualizada.')} />;
}

function MomentBranch({ w, deal, moments, onClose }: { w: Workspace; deal: Deal; moments: string[]; onClose: () => void }) {
  return <RecordForm draftKey={`kronos-moment:${deal.id}`} fields={[
    { name: 'stage', label: 'Momento atual', required: true, options: moments.map(value => ({ value, label: value })), value: deal.stage },
    { name: 'note', label: 'Por que mudou?', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Atualizar momento" onSave={form => w.mutate(data => {
    const current = data.deals.find(item => item.id === deal.id);
    if (!current || isClosedDeal(current)) throw new Error('Esta oportunidade não está aberta.');
    if (!moments.includes(form.stage)) throw new Error('Momento inválido.');
    const previous = current.stage;
    current.stage = form.stage;
    current.events.push(event(`Momento: ${previous} → ${form.stage}${form.note ? ` · ${form.note}` : ''}`));
  }, 'Momento atualizado.')} />;
}

function ActionBranch({ w, deal, onClose }: { w: Workspace; deal: Deal; onClose: () => void }) {
  return <RecordForm draftKey={`kronos-action:${deal.id}`} fields={[
    { name: 'title', label: 'O que precisa acontecer?', required: true, wide: true },
    { name: 'due', label: 'Quando?', type: 'datetime-local', required: true }
  ]} onClose={onClose} submit="Registrar ação" onSave={form => w.mutate(data => {
    if (!data.deals.some(item => item.id === deal.id && !isClosedDeal(item))) throw new Error('Esta oportunidade não está aberta.');
    data.tasks.push({ id: uid(), dealId: deal.id, title: form.title, due: form.due, done: false });
    data.deals.find(item => item.id === deal.id)?.events.push(event(`Próxima ação: ${form.title} · ${date(form.due, true)}`));
    syncDealNextActivity(data, deal.id);
  }, 'Próxima ação registrada.')} />;
}

function ResultBranch({ w, deal, result, onClose }: { w: Workspace; deal: Deal; result: 'Ganha' | 'Perdida'; onClose: () => void }) {
  const pending = w.data.tasks.filter(item => item.dealId === deal.id && !item.done);
  return <RecordForm fields={[
    { name: 'note', label: result === 'Ganha' ? 'Resumo do fechamento' : 'Motivo da perda', type: 'textarea', required: true, wide: true },
    ...(pending.length ? [{ name: 'pending', label: `${pending.length} ação(ões) pendente(s)`, required: true, options: [{ value: 'close', label: 'Encerrar junto' }, { value: 'keep', label: 'Manter para acompanhamento posterior' }] }] : [])
  ]} onClose={onClose} submit={result === 'Ganha' ? 'Confirmar venda' : 'Confirmar perda'} onSave={form => w.mutate(data => {
    const current = data.deals.find(item => item.id === deal.id);
    if (!current || isClosedDeal(current)) throw new Error('Esta oportunidade já foi encerrada.');
    current.stage = result;
    current.lostReason = result === 'Perdida' ? form.note : '';
    if (form.pending === 'close') data.tasks.filter(item => item.dealId === deal.id && !item.done).forEach(item => { item.done = true; });
    syncDealNextActivity(data, deal.id);
    current.events.push(event(`${result === 'Ganha' ? 'Venda confirmada' : 'Oportunidade perdida'}: ${form.note}`));
  }, result === 'Ganha' ? 'Venda registrada.' : 'Perda registrada.')} />;
}

function Cronograma({ w, visits, onCreate, onResult, onOpenDeal }: { w: Workspace; visits: KronosVisit[]; onCreate: () => void; onResult: (visit: KronosVisit) => void; onOpenDeal: (id: string) => void }) {
  const [mode, setMode] = useState<'proximos' | 'realizados'>('proximos');
  const filtered = visits.filter(item => mode === 'proximos' ? item.status === 'Planejada' : item.status !== 'Planejada').sort((a, b) => mode === 'proximos' ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at));
  const customer = (id: string) => w.data.customers.find(item => item.id === id);
  return <>
    <KronosMap w={w} visits={visits} onOpenDeal={onOpenDeal} />
    <div className="op-toolbar"><div className="op-compact-tabs"><button className={mode === 'proximos' ? 'active' : ''} onClick={() => setMode('proximos')}>Próximos</button><button className={mode === 'realizados' ? 'active' : ''} onClick={() => setMode('realizados')}>Realizados e cancelados</button></div><Button variant="secondary" onClick={onCreate}><Plus size={16} />Adicionar</Button></div>
    <div className="kronos-schedule">{filtered.map(item => <article key={item.id}><div className="kronos-schedule-time"><strong>{dayLabel(item.at)}</strong><span>{item.at.includes('T') ? item.at.slice(11, 16) : ''}</span></div><div className="kronos-schedule-main"><span className="op-kicker">{item.kind}</span><h3>{customer(item.customerId)?.name || 'Cliente não encontrado'}</h3><p>{item.objective || item.offering || 'Sem objetivo informado'}</p><small>{item.address || 'Local não informado'}</small>{item.result && <div className="kronos-schedule-result"><strong>Resultado</strong><span>{item.result}</span>{item.followUp && <small>Próximo passo: {item.followUp} · {dayLabel(item.followUpAt)}</small>}</div>}</div><div className="kronos-schedule-actions"><Badge>{item.status}</Badge>{item.dealId && <Button variant="text" onClick={() => onOpenDeal(item.dealId)}>Abrir oportunidade</Button>}{item.status === 'Planejada' && <><Button variant="secondary" onClick={() => onResult(item)}>Registrar resultado</Button><Button variant="text" onClick={() => w.mutate(data => { updateKronosVisit(data, item.id, { status: 'Cancelada' }); }, 'Compromisso cancelado.')}>Cancelar</Button></>}</div></article>)}{!filtered.length && <Empty>Nenhum compromisso nesta visão.</Empty>}</div>
  </>;
}

function VisitForm({ w, presetDealId, onClose }: { w: Workspace; presetDealId?: string; onClose: () => void }) {
  const presetDeal = presetDealId ? w.data.deals.find(item => item.id === presetDealId) : undefined;
  const presetCustomer = presetDeal ? w.data.customers.find(item => item.id === presetDeal.customerId) : undefined;
  const activeDeals = w.data.deals.filter(item => !isClosedDeal(item));
  return <RecordForm draftKey={`kronos-visit:${presetDealId || 'new'}`} fields={[
    { name: 'customer', label: 'Cliente / lead', required: true, suggestions: customerSuggestions(w.data), value: presetCustomer?.name, hint: 'Digite e continue. Cliente novo nasce automaticamente.' },
    { name: 'dealId', label: 'Oportunidade relacionada', options: activeDeals.map(item => ({ value: item.id, label: `${w.data.customers.find(c => c.id === item.customerId)?.name || ''} · ${item.title}` })), value: presetDeal?.id },
    { name: 'kind', label: 'Tipo', required: true, options: visitKindOptions, value: 'Visita' },
    { name: 'at', label: 'Data e horário', type: 'datetime-local', required: true },
    { name: 'address', label: 'Endereço / local', wide: true, hint: 'Opcional. Quando informado, alimenta o mapa.' },
    { name: 'objective', label: 'Objetivo deste compromisso', wide: true },
    { name: 'notes', label: 'Observação', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Adicionar ao cronograma" onSave={async form => {
    const geo = form.address ? await geocodeAddress(form.address) : null;
    return w.mutate(data => {
      const resolved = resolveCustomer(data, form.customer);
      const deal = form.dealId ? data.deals.find(item => item.id === form.dealId) : undefined;
      if (deal && deal.customerId !== resolved.id) throw new Error('A oportunidade selecionada pertence a outro cliente.');
      const existingLocation = getCustomerLocation(data, resolved.id);
      const address = form.address?.trim() || existingLocation.address;
      const lat = geo?.lat ?? existingLocation.lat;
      const lng = geo?.lng ?? existingLocation.lng;
      if (address) setCustomerLocation(data, resolved.id, { address, lat, lng });
      const visit = newKronosVisit({ customerId: resolved.id, dealId: form.dealId || '', kind: form.kind as KronosVisit['kind'], at: form.at, offering: deal?.title || '', objective: form.objective || '', quoteStatus: 'Sem cotação', quoteValue: 0, notes: form.notes || '', address, lat, lng });
      upsertKronosVisit(data, visit);
      if (deal) deal.events.push(event(`${visit.kind} agendada para ${date(visit.at, true)}${visit.objective ? ` · ${visit.objective}` : ''}`));
    }, 'Compromisso adicionado ao cronograma.');
  }} />;
}

function VisitResultForm({ w, visit, onClose }: { w: Workspace; visit: KronosVisit; onClose: () => void }) {
  const meta = visit.dealId ? getKronosDealMeta(w.data, visit.dealId) : null;
  return <RecordForm draftKey={`kronos-visit-result:${visit.id}`} fields={[
    { name: 'result', label: 'O que aconteceu?', type: 'textarea', required: true, wide: true },
    ...(visit.dealId ? [{ name: 'temperature', label: 'Sua percepção agora', options: temperatureOptions, value: meta?.temperature }] : []),
    { name: 'followUp', label: 'Próximo passo', wide: true },
    { name: 'followUpAt', label: 'Quando?', type: 'datetime-local' }
  ]} onClose={onClose} submit="Concluir compromisso" onSave={form => w.mutate(data => {
    if ((form.followUp && !form.followUpAt) || (!form.followUp && form.followUpAt)) throw new Error('Informe o próximo passo e a data juntos.');
    updateKronosVisit(data, visit.id, { status: 'Realizada', result: form.result, followUp: form.followUp || '', followUpAt: form.followUpAt || '', followUpDone: false });
    if (visit.dealId) {
      const current = data.deals.find(item => item.id === visit.dealId);
      if (current) {
        setKronosDealMeta(data, current.id, { temperature: (form.temperature || meta?.temperature || '') as KronosTemperature, lastContactAt: now(), lastOutcome: form.result });
        if (form.followUp && form.followUpAt) data.tasks.push({ id: uid(), dealId: current.id, title: form.followUp, due: form.followUpAt, done: false });
        syncDealNextActivity(data, current.id);
        current.events.push(event(`${visit.kind} realizada: ${form.result}${form.followUp ? ` · Próximo passo: ${form.followUp}` : ''}`));
      }
    }
  }, 'Resultado registrado.')} />;
}
