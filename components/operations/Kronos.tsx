'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, FileDown, Plus } from 'lucide-react';
import {
  Deal, cents, customValues, date, event, localDay, money, nextNumber, now,
  setCustomValues, syncDealNextActivity, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import { Badge, Button, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section, Timeline, Title, customerOptions } from './ui';
import { WorkflowControl } from './WorkflowControl';
import { useRecordRoute } from './useRecordRoute';

const fallbackColumns = ['Novo contato', 'Contato realizado', 'Proposta', 'Negociação'];

export function Kronos({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('kronos');
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useRecordRoute(recordId, '/kronos/oportunidades');
  const [query, setQuery] = useState('');
  const [task, setTask] = useState(false);
  const [contact, setContact] = useState(false);
  const [result, setResult] = useState('');
  const [edit, setEdit] = useState(false);
  const [filter, setFilter] = useState('Todos');
  const d = w.data;
  const columns = d.settings.salesStages?.length >= 2 ? d.settings.salesStages : fallbackColumns;
  const deal = d.deals.find(item => item.id === selected);
  const customer = (id: string) => d.customers.find(item => item.id === id);
  const deals = d.deals.filter(item => `${item.title} ${customer(item.customerId)?.name}`.toLowerCase().includes(query.toLowerCase()));
  const active = deals.filter(item => !['Ganha', 'Perdida'].includes(item.stage));
  const tasks = d.tasks.filter(item => !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const pendingFor = (id: string) => d.tasks.filter(item => item.dealId === id && !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const nextTaskFor = (id: string) => pendingFor(id)[0];

  const card = (item: Deal) => {
    const nextTask = nextTaskFor(item.id);
    const due = nextTask?.due || item.due;
    return <button key={item.id} className="kronos-deal" onClick={() => setSelected(item.id)}>
      <small>{customer(item.customerId)?.name}</small><h3>{item.title}</h3><strong>{money(item.value)}</strong>
      <footer><span className={due && new Date(due) < new Date() ? 'op-overdue' : ''}>{due ? `${new Date(due) < new Date() ? 'Retorno atrasado · ' : ''}${date(due, due.includes('T'))}` : 'Defina o próximo contato'}</span><ArrowRight size={16} /></footer>
    </button>;
  };

  if (deal) {
    const activeDeal = !['Ganha', 'Perdida'].includes(deal.stage);
    const index = columns.indexOf(deal.stage);
    const nextStage = index >= 0 && index < columns.length - 1 ? columns[index + 1] : undefined;
    const workflowSteps = activeDeal ? columns : [...columns, deal.stage];
    const nextTask = nextTaskFor(deal.id);
    const custom = operation.preferences.customFields.filter(field => field.visible && ['Cliente', 'Oportunidade', 'Qualificação', 'Próxima ação', 'Fechamento'].includes(field.group));
    const values = customValues(d, deal.id);

    return <>
      <Button variant="text" onClick={() => setSelected('')}><ArrowLeft size={16} />Voltar à operação</Button>
      <Title eyebrow={`Oportunidade ${String(deal.number).padStart(4, '0')}`} title={deal.title} action={operation.actionVisible('edit') && activeDeal ? <Button variant="secondary" onClick={() => setEdit(true)}>Editar oportunidade</Button> : undefined}>
        {customer(deal.customerId)?.name} · {customer(deal.customerId)?.phone || 'Sem telefone cadastrado'}
      </Title>

      <WorkflowControl
        label="Etapa da negociação"
        steps={workflowSteps}
        current={deal.stage}
        status={deal.stage}
        actions={activeDeal ? <>
          <Button onClick={() => setContact(true)}>Registrar contato</Button>
          {nextStage && operation.actionVisible('quickAdvance') && <Button variant="secondary" onClick={() => { void w.mutate(data => {
            const current = data.deals.find(item => item.id === deal.id)!;
            if (current.stage !== deal.stage) throw new Error('A etapa já mudou.');
            const currentIndex = columns.indexOf(current.stage);
            if (currentIndex < 0 || currentIndex >= columns.length - 1) throw new Error('Esta oportunidade já está na última etapa aberta.');
            current.stage = columns[currentIndex + 1];
            current.events.push(event(`Avançou para ${current.stage}`));
          }, 'Etapa atualizada.'); }}>Avançar para {nextStage}</Button>}
        </> : undefined}
      />

      <div className="kronos-deal-focus">
        {operation.fieldVisible('value') && <div><span>{operation.label('value', 'Valor da oportunidade')}</span><strong>{money(deal.value)}</strong></div>}
        <div><span>Etapa</span><Badge>{deal.stage}</Badge></div>
        {operation.fieldVisible('due') && <div><span>{operation.label('due', 'Próximo retorno')}</span><strong className="deal-due">{nextTask ? date(nextTask.due, true) : 'Sem atividade pendente'}</strong></div>}
      </div>

      <div className="op-split">
        <Section title="Próxima conversa">
          <h3>{nextTask?.title || 'Nenhum compromisso pendente.'}</h3>
          {operation.fieldVisible('notes') && <p className="op-prewrap">{deal.notes}</p>}
          {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
          {activeDeal && <div className="op-record-secondary-actions">
            {operation.actionVisible('win') && <Button variant="secondary" onClick={() => setResult('Ganha')}>Registrar venda</Button>}
            {operation.actionVisible('lose') && <Button variant="danger" onClick={() => setResult('Perdida')}>Registrar perda</Button>}
          </div>}
          {deal.lostReason && <p className="op-callout">{operation.label('lostReason', 'Motivo da perda')}: {deal.lostReason}</p>}
        </Section>

        <Section title="Atividades" action={activeDeal && operation.actionVisible('activities') ? <Button variant="secondary" onClick={() => setTask(true)}><Plus size={16} />Agendar retorno</Button> : undefined}>
          {d.tasks.filter(item => item.dealId === deal.id).sort((a, b) => a.due.localeCompare(b.due)).map(item => <label className="op-check-row" key={item.id}>
            <input type="checkbox" checked={item.done} onChange={change => w.mutate(data => {
              data.tasks.find(current => current.id === item.id)!.done = change.target.checked;
              data.deals.find(current => current.id === deal.id)!.events.push(event(`${change.target.checked ? 'Concluída' : 'Reaberta'} atividade: ${item.title}`));
              syncDealNextActivity(data, deal.id);
            })} />
            <span className="op-grow"><strong>{item.title}</strong><small>{date(item.due, true)}</small></span><Badge>{item.done ? 'Concluída' : 'Pendente'}</Badge>
          </label>)}
          {!d.tasks.some(item => item.dealId === deal.id) && <Empty>Agende uma ação para dar continuidade à conversa.</Empty>}
        </Section>
      </div>

      <Section title="Histórico da negociação"><Timeline events={deal.events} /></Section>

      {edit && <Modal title="Editar oportunidade" onClose={() => setEdit(false)}><DealForm w={w} deal={deal} onClose={() => setEdit(false)} onCreated={() => {}} /></Modal>}
      {task && <Modal title="Agendar retorno" onClose={() => setTask(false)}><RecordForm draftKey={`kronos-task:${deal.id}`} fields={[{ name: 'title', label: 'O que precisa ser feito?', required: true, wide: true }, { name: 'due', label: 'Quando?', type: 'datetime-local', required: true }]} onClose={() => setTask(false)} onSave={form => w.mutate(data => {
        data.tasks.push({ id: uid(), dealId: deal.id, title: form.title, due: form.due, done: false });
        const current = data.deals.find(item => item.id === deal.id)!;
        current.events.push(event(`Retorno agendado: ${form.title} · ${date(form.due, true)}`));
        syncDealNextActivity(data, deal.id);
      })} /></Modal>}

      {contact && <Modal title="Registrar contato" onClose={() => setContact(false)}><RecordForm draftKey={`kronos-contact:${deal.id}`} fields={[
        { name: 'outcome', label: 'Resultado da conversa', type: 'textarea', required: true, wide: true },
        { name: 'stage', label: 'Etapa após o contato', options: columns.map(value => ({ value, label: value })), value: deal.stage },
        { name: 'nextAction', label: 'Próximo compromisso', wide: true },
        { name: 'due', label: 'Quando?', type: 'datetime-local' }
      ]} onClose={() => setContact(false)} submit="Registrar contato" onSave={form => w.mutate(data => {
        const current = data.deals.find(item => item.id === deal.id)!;
        const currentTask = data.tasks.filter(item => item.dealId === deal.id && !item.done).sort((a, b) => a.due.localeCompare(b.due))[0];
        if (currentTask) currentTask.done = true;
        if (form.stage && columns.includes(form.stage)) current.stage = form.stage;
        current.events.push(event(`Contato registrado: ${form.outcome}${form.stage !== deal.stage ? ` · Etapa: ${form.stage}` : ''}`));
        if ((form.nextAction && !form.due) || (!form.nextAction && form.due)) throw new Error('Informe o próximo compromisso e a data juntos.');
        if (form.nextAction && form.due) {
          data.tasks.push({ id: uid(), dealId: deal.id, title: form.nextAction, due: form.due, done: false });
          current.events.push(event(`Próximo compromisso: ${form.nextAction} · ${date(form.due, true)}`));
        }
        syncDealNextActivity(data, deal.id);
      }, 'Contato registrado.')} /></Modal>}

      {result && <Modal title={result === 'Ganha' ? 'Confirmar venda realizada' : 'Registrar perda da negociação'} onClose={() => setResult('')}><RecordForm fields={[
        { name: 'note', label: result === 'Ganha' ? 'Resumo do fechamento' : operation.label('lostReason', 'Motivo da perda'), type: 'textarea', required: true, wide: true },
        ...(pendingFor(deal.id).length ? [{ name: 'pending', label: `${pendingFor(deal.id).length} atividade(s) ainda pendente(s)`, required: true, options: [{ value: 'close', label: 'Encerrar pendências junto com a negociação' }, { value: 'keep', label: 'Manter como acompanhamento posterior' }] }] : [])
      ]} onClose={() => setResult('')} submit={result === 'Ganha' ? 'Confirmar venda' : 'Confirmar perda'} onSave={form => w.mutate(data => {
        const current = data.deals.find(item => item.id === deal.id)!;
        if (['Ganha', 'Perdida'].includes(current.stage)) throw new Error('Esta negociação já foi encerrada.');
        current.stage = result;
        current.lostReason = result === 'Perdida' ? form.note : '';
        if (form.pending === 'close') for (const item of data.tasks.filter(item => item.dealId === deal.id && !item.done)) item.done = true;
        syncDealNextActivity(data, deal.id);
        current.events.push(event(`${result === 'Ganha' ? 'Venda confirmada' : 'Negociação perdida'}: ${form.note}${form.pending === 'keep' ? ' · Atividades pendentes mantidas para acompanhamento.' : form.pending === 'close' ? ' · Atividades pendentes encerradas.' : ''}`));
      })} /></Modal>}
    </>;
  }

  return <>
    <Title eyebrow="Kronos / Operação comercial" title={page === 'inicio' ? 'Qual é a próxima conversa?' : page === 'atividades' ? 'Compromissos comerciais' : page === 'historico' ? 'Negociações encerradas' : 'Seu caminho até a venda'} action={<Button onClick={() => setCreate(true)}><Plus size={18} />Nova oportunidade</Button>} />

    {page === 'inicio' && <div className="kronos-focus"><div className="kronos-focus-heading"><CalendarCheck2 size={28} /><h2>Retornos que<br />movem a venda.</h2><span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div><div className="kronos-next-list">{active.map(item => ({ deal: item, task: nextTaskFor(item.id) })).filter(item => item.task).sort((a, b) => a.task!.due.localeCompare(b.task!.due)).slice(0, 6).map(({ deal: item, task: next }) => <button key={item.id} onClick={() => setSelected(item.id)}><time className={new Date(next!.due) < new Date() ? 'op-overdue' : ''}>{new Date(next!.due) < new Date() ? 'Atrasado' : next!.due.slice(0, 10) === localDay() ? 'Hoje' : date(next!.due)}</time><div><strong>{customer(item.customerId)?.name}</strong><span>{next!.title}</span></div><ArrowRight size={18} /></button>)}{!active.some(item => nextTaskFor(item.id)) && <Empty>Agende o próximo compromisso dentro de uma oportunidade para ele aparecer aqui.</Empty>}</div></div>}

    {page === 'atividades' ? <Section title="Atividades pendentes">{tasks.map(item => <div className="op-row" key={item.id}><button className="op-icon" aria-label={`Concluir ${item.title}`} onClick={() => w.mutate(data => { data.tasks.find(current => current.id === item.id)!.done = true; data.deals.find(current => current.id === item.dealId)?.events.push(event(`Atividade concluída: ${item.title}`)); syncDealNextActivity(data, item.dealId); })}><Check size={18} /></button><button className="op-grow op-row-main" onClick={() => setSelected(item.dealId)}><strong>{item.title}</strong><small>{d.deals.find(current => current.id === item.dealId)?.title}</small></button><span className={new Date(item.due) < new Date() ? 'op-overdue' : ''}>{date(item.due, true)}</span></div>)}{!tasks.length && <Empty>Todas as atividades estão em dia. Agende novos retornos dentro das oportunidades.</Empty>}</Section>
      : page === 'historico' ? <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar negociação ou cliente" /><select value={filter} aria-label="Resultado da negociação" onChange={change => setFilter(change.target.value)}>{['Todos', 'Ganha', 'Perdida'].map(value => <option key={value}>{value}</option>)}</select>{operation.actionVisible('export') && <Button variant="secondary" onClick={() => csv('negociacoes-kronos.csv', [['Oportunidade', 'Cliente', 'Valor', 'Resultado', 'Motivo'], ...deals.filter(item => ['Ganha', 'Perdida'].includes(item.stage) && (filter === 'Todos' || item.stage === filter)).map(item => [item.title, customer(item.customerId)?.name, (item.value / 100).toFixed(2), item.stage, item.lostReason])])}><FileDown size={16} />Exportar</Button>}</div><div className="op-list">{deals.filter(item => ['Ganha', 'Perdida'].includes(item.stage) && (filter === 'Todos' || item.stage === filter)).map(item => <button className="op-row" key={item.id} onClick={() => setSelected(item.id)}><div className="op-grow"><strong>{item.title}</strong><small>{customer(item.customerId)?.name}</small></div><Badge>{item.stage}</Badge><strong>{money(item.value)}</strong><ArrowRight size={16} /></button>)}</div></>
      : page === 'clientes' ? <CustomerManager w={w} onOpen={customerRecord => <Section title="Histórico comercial">{d.deals.filter(item => item.customerId === customerRecord.id).map(item => <div className="op-row" key={item.id}><strong className="op-grow">{item.title}</strong><Badge>{item.stage}</Badge><b>{money(item.value)}</b></div>)}</Section>} />
      : <><div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar oportunidade ou cliente" /><span className="op-muted">{active.length} oportunidades abertas</span></div><div className="kronos-pipeline">{columns.map((column, index) => <section key={column}><div className="kronos-column-head"><span>{String(index + 1).padStart(2, '0')}</span><h2>{column}</h2><small>{active.filter(item => item.stage === column).length}</small></div>{active.filter(item => item.stage === column).map(card)}{!active.some(item => item.stage === column) && <div className="kronos-lane-empty">Nenhuma oportunidade nesta etapa.</div>}</section>)}</div></>}

    {create && <Modal title="Nova oportunidade" onClose={() => setCreate(false)}>{d.customers.length ? <DealForm w={w} onClose={() => setCreate(false)} onCreated={id => setSelected(id)} /> : <Empty>Cadastre o cliente em “Clientes” antes de abrir a oportunidade.</Empty>}</Modal>}
  </>;
}

function DealForm({ w, deal, onClose, onCreated }: { w: Workspace; deal?: Deal; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('kronos');
  const custom = useMemo(() => operation.preferences.customFields.filter(field => field.visible && ['Cliente', 'Oportunidade', 'Qualificação', 'Próxima ação'].includes(field.group)), [operation.preferences.customFields]);
  const savedCustom = deal ? customValues(w.data, deal.id) : {};
  return <RecordForm draftKey={`kronos-deal:${deal?.id || 'new'}`} fields={[
    { name: 'title', label: operation.label('dealTitle', 'O que será negociado?'), required: true, wide: true, value: deal?.title },
    { name: 'customerId', label: operation.label('customer', 'Cliente'), required: true, options: customerOptions(w.data), value: deal?.customerId },
    ...(operation.fieldVisible('value') ? [{ name: 'value', label: `${operation.label('value', 'Valor previsto')} (R$)`, type: 'number', min: 0, step: 0.01, required: true, value: deal ? deal.value / 100 : '' }] : []),
    ...(operation.fieldVisible('source') ? [{ name: 'source', label: operation.label('source', 'Origem do contato'), value: deal?.source }] : []),
    ...(operation.fieldVisible('due') ? [{ name: 'due', label: operation.label('due', 'Próximo contato'), type: 'datetime-local', value: deal?.due ? (deal.due.includes('T') ? deal.due : `${deal.due}T09:00`) : '' }] : []),
    ...(operation.fieldVisible('nextAction') ? [{ name: 'nextAction', label: operation.label('nextAction', 'Objetivo do próximo contato'), wide: true, value: deal?.nextAction }] : []),
    ...(operation.fieldVisible('notes') ? [{ name: 'notes', label: operation.label('notes', 'Contexto da negociação'), type: 'textarea', wide: true, value: deal?.notes }] : []),
    ...custom.map(field => ({ name: `custom__${field.id}`, label: field.label, wide: true, value: savedCustom[field.id] || '' }))
  ]} onClose={onClose} onSave={form => w.mutate(data => {
    if (!data.customers.some(customer => customer.id === form.customerId)) throw new Error('Selecione um cliente.');
    const recordIdValue = deal?.id || uid();
    if (deal) {
      const current = data.deals.find(item => item.id === deal.id)!;
      current.title = form.title;
      current.customerId = form.customerId;
      if (form.value !== undefined) current.value = cents(form.value);
      if (form.source !== undefined) current.source = form.source;
      if (form.notes !== undefined) current.notes = form.notes;
      const pending = data.tasks.filter(item => item.dealId === deal.id && !item.done).sort((a, b) => a.due.localeCompare(b.due))[0];
      if (form.due !== undefined || form.nextAction !== undefined) {
        const due = form.due || '';
        const title = form.nextAction || '';
        if ((due && !title) || (title && !due)) throw new Error('Informe o próximo compromisso e a data juntos.');
        if (due && title) {
          if (pending) { pending.due = due; pending.title = title; } else data.tasks.push({ id: uid(), dealId: deal.id, title, due, done: false });
        } else if (pending) pending.done = true;
      }
      syncDealNextActivity(data, deal.id);
      current.events.push(event('Oportunidade atualizada'));
    } else {
      const columns = data.settings.salesStages?.length >= 2 ? data.settings.salesStages : fallbackColumns;
      const record: Deal = { id: recordIdValue, number: nextNumber(data.deals), title: form.title, customerId: form.customerId, value: form.value ? cents(form.value) : 0, source: form.source || '', due: '', nextAction: '', notes: form.notes || '', stage: columns[0], lostReason: '', createdAt: now(), events: [event('Oportunidade criada')] };
      data.deals.push(record);
      if ((form.due && !form.nextAction) || (form.nextAction && !form.due)) throw new Error('Informe o próximo compromisso e a data juntos.');
      if (form.due && form.nextAction) data.tasks.push({ id: uid(), dealId: record.id, title: form.nextAction, due: form.due, done: false });
      syncDealNextActivity(data, record.id);
      onCreated(record.id);
    }
    setCustomValues(data, recordIdValue, Object.fromEntries(custom.map(field => [field.id, form[`custom__${field.id}`] || savedCustom[field.id] || ''])));
  })} />;
}
