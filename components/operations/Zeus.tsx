'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Wrench, X } from 'lucide-react';
import {
  Appointment, Asset, Job, activeJob, advanceJob, date, event, localDay, matches,
  newJob, stages, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, CustomerManager, Empty, Modal, QuotePanel, RecordForm,
  SearchBox, Section, Timeline, Title, customerOptions
} from './ui';
import { WorkflowControl } from './WorkflowControl';

export function Zeus({ w, page }: { w: Workspace; page: string }) {
  const d = w.data;
  const s = d.settings;
  const operation = useOperationPreferences('zeus');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [schedule, setSchedule] = useState<Appointment | 'new' | null>(null);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [assetCustomer, setAssetCustomer] = useState('');
  const [day, setDay] = useState(localDay());
  const [week, setWeek] = useState(false);
  const [confirm, setConfirm] = useState<Appointment | null>(null);

  const findCustomer = (id: string) => d.customers.find(customer => customer.id === id)?.name || 'Cliente';
  const findAsset = (id: string) => d.assets.find(asset => asset.id === id);
  const jobs = d.jobs.filter(job => matches(
    query,
    job.number,
    findCustomer(job.customerId),
    findAsset(job.assetId)?.identifier,
    findAsset(job.assetId)?.model,
    job.type,
    job.technician
  ));

  const appointmentList = (list: Appointment[]) => list.length
    ? <div className="op-agenda">{[...list].sort((a, b) => a.at.localeCompare(b.at)).map(appointment => <div className="op-agenda-row" key={appointment.id}>
      <time>{new Date(appointment.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<small>{date(appointment.at)}</small></time>
      <div className="op-grow">
        <strong className="op-identifier">{findAsset(appointment.assetId)?.identifier}</strong>
        <span>{findCustomer(appointment.customerId)} · {findAsset(appointment.assetId)?.model}</span>
        <small>{appointment.type}{appointment.technician && ` · ${appointment.technician}`} · {appointment.status}</small>
      </div>
      <div className="op-actions">
        {appointment.status === 'Agendado'
          ? <><Button variant="secondary" onClick={() => setSchedule(appointment)}>Reagendar</Button><Button onClick={() => setConfirm(appointment)}>Abrir OS <ArrowRight size={16} /></Button></>
          : appointment.jobId && <Button variant="secondary" onClick={() => setSelected(appointment.jobId!)}>Ver OS</Button>}
      </div>
    </div>)}</div>
    : <Empty icon={<CalendarDays size={28} />}>Nenhum atendimento agendado neste período.</Empty>;

  const jobList = (list: Job[]) => list.length
    ? <div className="op-job-list">{list.map(job => {
      const asset = findAsset(job.assetId);
      const flow = stages(s);
      return <button key={job.id} className="op-job" onClick={() => setSelected(job.id)}>
        <div className="op-job-identity">
          <small>OS {String(job.number).padStart(4, '0')} · {job.type}</small>
          <strong>{asset?.identifier}</strong>
          <span>{findCustomer(job.customerId)}</span>
          <small>{asset?.model}</small>
        </div>
        <div className="op-job-work">
          <strong>{job.stage}</strong>
          <span>{job.technician || 'Sem responsável'}</span>
          <div className="op-stage-meter" aria-label={`Etapa ${job.stage}`}>{flow.map(stage => <i key={stage} className={flow.indexOf(stage) <= flow.indexOf(job.stage) ? 'filled' : ''} />)}</div>
        </div>
        <div className="op-job-state">
          <Badge tone={job.status === 'Aguardando aprovação' ? 'warning' : ''}>{job.status}</Badge>
          {job.due && <small className={new Date(job.due) < new Date() && activeJob(job) ? 'op-overdue' : ''}>{new Date(job.due) < new Date() && activeJob(job) ? 'Prazo vencido · ' : ''}{date(job.due, true)}</small>}
          <ArrowRight size={18} />
        </div>
      </button>;
    })}</div>
    : <Empty icon={<Wrench size={28} />}>{query ? 'Nenhum atendimento encontrado.' : 'As ordens de serviço aparecerão aqui.'}</Empty>;

  const chosen = d.jobs.find(job => job.id === selected);

  return <>
    {chosen
      ? <JobDetail w={w} job={chosen} onBack={() => setSelected('')} />
      : <>
        {page === 'inicio' && <>
          <Title eyebrow="Bancada de trabalho" title="Hoje na oficina" action={<>
            {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Link className="op-button secondary" href="/zeus/agendamentos"><CalendarDays size={17} />Agendar</Link>}
            <Button onClick={() => setCreate(true)}><Plus size={18} />Novo atendimento</Button>
          </>} />
          <div className="zeus-date-strip">
            <span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <SearchBox value={query} onChange={setQuery} placeholder={`Buscar ${s.identifierLabel.toLowerCase()}, cliente ou OS`} />
          </div>
          {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Section title="Agendamentos de hoje" action={<Link href="/zeus/agendamentos" className="op-text-link">Ver semana <ArrowRight size={15} /></Link>}>
            {appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === localDay() && appointment.status === 'Agendado'))}
          </Section>}
          {s.budgetEnabled && operation.actionVisible('budget') && d.jobs.some(job => job.status === 'Aguardando aprovação') && <Section title="Aguardando aprovação" className="zeus-pending">
            {jobList(jobs.filter(job => job.status === 'Aguardando aprovação'))}
          </Section>}
          <Section title="Em andamento" action={<span className="op-muted">{d.jobs.filter(activeJob).length} atendimentos</span>}>
            {jobList(jobs.filter(activeJob))}
          </Section>
          {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Section title="Próximos atendimentos">
            {appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) > localDay() && appointment.status === 'Agendado').slice(0, 5))}
          </Section>}
        </>}

        {(page === 'atendimentos' || page === 'historico') && <>
          <Title eyebrow={page === 'historico' ? 'Arquivo técnico' : 'Operação'} title={page === 'historico' ? 'Histórico de atendimentos' : 'Atendimentos'} action={<>
            <Button variant="secondary" onClick={() => csv('atendimentos.csv', [
              ['OS', s.identifierLabel, 'Cliente', 'Tipo', 'Etapa', 'Status', 'Abertura'],
              ...jobs.filter(job => page === 'historico' ? !activeJob(job) : activeJob(job)).map(job => [job.number, findAsset(job.assetId)?.identifier, findCustomer(job.customerId), job.type, job.stage, job.status, date(job.createdAt)])
            ])}><FileDown size={17} />Exportar</Button>
            {page !== 'historico' && <Button onClick={() => setCreate(true)}><Plus size={18} />Novo atendimento</Button>}
          </>} />
          <div className="op-toolbar">
            <SearchBox value={query} onChange={setQuery} placeholder={`Buscar ${s.identifierLabel.toLowerCase()}, cliente, técnico ou OS`} />
            <select aria-label="Filtrar status" value={filter} onChange={change => setFilter(change.target.value)}>
              {['Todos', ...(page === 'historico' ? ['Encerrado', 'Cancelado', 'Reprovado'] : ['Em andamento', 'Aguardando aprovação', 'Aguardando peça', 'Pausado', 'Pronto para retirada'])].map(value => <option key={value}>{value}</option>)}
            </select>
          </div>
          {jobList(jobs.filter(job => (page === 'historico' ? !activeJob(job) : activeJob(job)) && (filter === 'Todos' || job.status === filter)))}
        </>}

        {page === 'agendamentos' && <>
          <Title eyebrow="Agenda da oficina" title="Organize as próximas chegadas" action={<Button onClick={() => setSchedule('new')}><Plus size={18} />Novo agendamento</Button>} />
          <div className="op-toolbar">
            <div className="op-actions">
              <Button variant="secondary" title="Período anterior" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() - (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronLeft size={17} /></Button>
              <input aria-label="Data da agenda" type="date" value={day} onChange={change => setDay(change.target.value)} />
              <Button variant="secondary" title="Próximo período" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronRight size={17} /></Button>
              <Button variant="secondary" onClick={() => setDay(localDay())}>Hoje</Button>
            </div>
            <div className="op-tabs"><button className={!week ? 'active' : ''} onClick={() => setWeek(false)}>Dia</button><button className={week ? 'active' : ''} onClick={() => setWeek(true)}>Semana</button></div>
          </div>
          {week
            ? <div className="zeus-week">{Array.from({ length: 7 }, (_, index) => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + index); const key = localDay(value); return <Section key={key} title={value.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === key))}</Section>; })}</div>
            : <Section title={date(day)}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === day))}</Section>}
        </>}

        {page === 'clientes' && <CustomerManager w={w} title={`Clientes e ${s.assetLabel.toLowerCase()}s`} onOpen={customer => <>
          <Section title={`${s.assetLabel}s`} action={<Button variant="secondary" onClick={() => setAssetCustomer(customer.id)}><Plus size={16} />Adicionar</Button>}>
            {d.assets.filter(asset => asset.customerId === customer.id).map(asset => <div className="op-row" key={asset.id}>
              <div className="op-grow"><strong className="op-identifier">{asset.identifier}</strong><span>{asset.model} · {asset.year || 'Ano não informado'}</span></div>
              <Badge>{d.jobs.filter(job => job.assetId === asset.id).length} OS</Badge>
            </div>)}
            {!d.assets.some(asset => asset.customerId === customer.id) && <Empty>Nenhum cadastro associado.</Empty>}
          </Section>
          <Section title="Histórico do cliente">
            {d.jobs.filter(job => job.customerId === customer.id).map(job => <div className="op-row" key={job.id}><strong>OS {job.number}</strong><span>{job.type} · {date(job.createdAt)}</span><Badge>{job.status}</Badge></div>)}
          </Section>
        </>} />}
      </>}

    {create && <Modal title="Qual veículo ou equipamento será atendido?" wide onClose={() => setCreate(false)}><JobForm w={w} onClose={() => setCreate(false)} onCreated={id => setSelected(id)} /></Modal>}
    {schedule && <Modal title={schedule === 'new' ? 'Novo agendamento' : 'Reagendar atendimento'} onClose={() => setSchedule(null)}><AppointmentForm w={w} appointment={schedule === 'new' ? undefined : schedule} onClose={() => setSchedule(null)} /></Modal>}
    {confirm && <Confirm title="Iniciar atendimento?" label="Abrir ordem de serviço" onClose={() => setConfirm(null)} onConfirm={() => w.mutate(next => {
      const id = newJob(next, { customerId: confirm.customerId, assetId: confirm.assetId, type: confirm.type, technician: confirm.technician, due: '', complaint: confirm.notes, diagnosis: '', notes: '' }, confirm.id);
      setSelected(id);
    }, 'Ordem de serviço aberta.')}>Os dados deste agendamento serão aproveitados na ordem de serviço.</Confirm>}
    {assetCustomer && <Modal title={`Cadastrar ${s.assetLabel.toLowerCase()}`} onClose={() => setAssetCustomer('')}><RecordForm fields={[
      { name: 'identifier', label: s.identifierLabel, required: true },
      { name: 'model', label: s.assetLabel, required: true },
      ...(operation.fieldVisible('year') ? [{ name: 'year', label: operation.label('year', 'Ano') }] : []),
      ...(operation.fieldVisible('meter') ? [{ name: 'meter', label: s.meterLabel }] : [])
    ]} onClose={() => setAssetCustomer('')} onSave={values => w.mutate(next => {
      if (next.assets.some(asset => asset.identifier.replace(/\W/g, '').toUpperCase() === values.identifier.replace(/\W/g, '').toUpperCase())) throw new Error('Esta identificação já está cadastrada.');
      next.assets.push({ id: uid(), customerId: assetCustomer, identifier: values.identifier, model: values.model, year: values.year || '', meter: values.meter || '' } as Asset);
    })} /></Modal>}
  </>;
}

function JobForm({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('zeus');
  const [search, setSearch] = useState('');
  const [assetId, setAssetId] = useState('');
  const [newRecord, setNewRecord] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const s = w.data.settings;
  const asset = w.data.assets.find(item => item.id === assetId);

  return <>
    <SearchBox value={search} onChange={setSearch} placeholder={`Pesquisar por ${s.identifierLabel.toLowerCase()} ou cliente`} />
    {!asset && !newRecord && <>
      <div className="op-picker-results">{w.data.assets.filter(item => matches(search, item.identifier, w.data.customers.find(customer => customer.id === item.customerId)?.name)).map(item => <button className="op-row" key={item.id} onClick={() => { setAssetId(item.id); setCustomerId(item.customerId); }}><strong>{item.identifier}</strong><span>{item.model} · {w.data.customers.find(customer => customer.id === item.customerId)?.name}</span><ArrowRight size={16} /></button>)}</div>
      <Button variant="secondary" onClick={() => setNewRecord(true)}><Plus size={17} />Cadastrar novo neste atendimento</Button>
    </>}
    {(asset || newRecord) && <>
      <div className="op-callout">
        {asset
          ? <><strong>{asset.identifier} · {asset.model}</strong><span>{w.data.customers.find(customer => customer.id === asset.customerId)?.name}</span><button className="op-text-link" onClick={() => { setAssetId(''); setNewRecord(false); }}>Trocar identificação</button></>
          : <label className="op-field"><span>Cliente</span><select value={customerId} onChange={change => setCustomerId(change.target.value)}><option value="">Cadastrar novo cliente</option>{customerOptions(w.data).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
      </div>
      <RecordForm
        key={assetId + customerId}
        fields={[
          ...(newRecord ? [
            ...(!customerId ? [
              { name: 'customerName', label: operation.label('customerName', 'Nome do cliente'), required: true },
              ...(operation.fieldVisible('customerPhone') ? [{ name: 'phone', label: operation.label('customerPhone', 'Telefone'), type: 'tel' }] : [])
            ] : []),
            { name: 'identifier', label: s.identifierLabel, required: true, value: search },
            { name: 'model', label: s.assetLabel, required: true },
            ...(operation.fieldVisible('year') ? [{ name: 'year', label: operation.label('year', 'Ano') }] : []),
            ...(operation.fieldVisible('meter') ? [{ name: 'meter', label: s.meterLabel }] : [])
          ] : []),
          { name: 'type', label: operation.label('serviceType', 'Tipo de atendimento'), required: true, options: ['Diagnóstico', 'Revisão', 'Reparo', 'Retorno / Garantia'].map(value => ({ value, label: value })) },
          ...(operation.fieldVisible('technician') ? [{ name: 'technician', label: operation.label('technician', 'Responsável') }] : []),
          ...(operation.fieldVisible('due') ? [{ name: 'due', label: operation.label('due', 'Prazo previsto'), type: 'datetime-local' }] : []),
          { name: 'complaint', label: operation.label('complaint', 'Relato do cliente'), type: 'textarea', wide: true, required: true }
        ]}
        submit="Abrir atendimento"
        onClose={onClose}
        onSave={values => w.mutate(data => {
          let cid = customerId;
          let aid = assetId;
          if (newRecord) {
            if (!cid) {
              cid = uid();
              data.customers.push({ id: cid, name: values.customerName.trim(), phone: values.phone || '', email: '', notes: '' });
            }
            if (data.assets.some(item => item.identifier.replace(/\W/g, '').toUpperCase() === values.identifier.replace(/\W/g, '').toUpperCase())) throw new Error('Esta identificação já existe. Selecione o cadastro.');
            aid = uid();
            data.assets.push({ id: aid, customerId: cid, identifier: values.identifier.trim().toUpperCase(), model: values.model, year: values.year || '', meter: values.meter || '' });
          }
          const id = newJob(data, { assetId: aid, customerId: cid, type: values.type, technician: values.technician || '', due: values.due || '', complaint: values.complaint, diagnosis: '', notes: '' });
          onCreated(id);
        }, 'Atendimento aberto.')}
      />
      {asset && <Section title="Últimos atendimentos">
        {w.data.jobs.filter(job => job.assetId === assetId).slice(-3).reverse().map(job => <div className="op-row" key={job.id}><strong>OS {job.number}</strong><span>{date(job.createdAt)} · {job.type}</span><Badge>{job.status}</Badge></div>)}
        {!w.data.jobs.some(job => job.assetId === assetId) && <p className="op-muted">Primeiro atendimento deste cadastro.</p>}
      </Section>}
    </>}
  </>;
}

function AppointmentForm({ w, appointment, onClose }: { w: Workspace; appointment?: Appointment; onClose: () => void }) {
  const operation = useOperationPreferences('zeus');
  return <>
    {!w.data.assets.length
      ? <Empty>Abra um atendimento ou cadastre o cliente e o veículo em “Clientes e veículos” para agendar.</Empty>
      : <RecordForm fields={[
        { name: 'assetId', label: w.data.settings.assetLabel, required: true, value: appointment?.assetId, options: w.data.assets.map(asset => ({ value: asset.id, label: `${asset.identifier} · ${w.data.customers.find(customer => customer.id === asset.customerId)?.name}` })) },
        { name: 'at', label: 'Data e horário', type: 'datetime-local', required: true, value: appointment?.at },
        { name: 'type', label: operation.label('serviceType', 'Tipo'), value: appointment?.type, required: true, options: ['Diagnóstico', 'Revisão', 'Reparo', 'Retorno / Garantia'].map(value => ({ value, label: value })) },
        ...(operation.fieldVisible('technician') ? [{ name: 'technician', label: operation.label('technician', 'Responsável'), value: appointment?.technician }] : []),
        { name: 'notes', label: 'Observações', type: 'textarea', wide: true, value: appointment?.notes }
      ]} onClose={onClose} onSave={values => w.mutate(data => {
        const asset = data.assets.find(item => item.id === values.assetId);
        if (!asset) throw new Error('Selecione o veículo.');
        if (data.appointments.some(item => item.id !== appointment?.id && item.at === values.at && item.status === 'Agendado' && values.technician && item.technician === values.technician)) throw new Error('Este responsável já possui um agendamento neste horário.');
        const next: Appointment = { id: appointment?.id || uid(), customerId: asset.customerId, assetId: asset.id, at: values.at, type: values.type, technician: values.technician || '', notes: values.notes || '', status: 'Agendado' };
        const index = data.appointments.findIndex(item => item.id === next.id);
        if (index < 0) data.appointments.push(next);
        else {
          if (data.appointments[index].status !== 'Agendado') throw new Error('Este agendamento já foi iniciado ou cancelado.');
          data.appointments[index] = next;
        }
      })}>
        {appointment && <Button variant="danger" onClick={async () => {
          if (await w.mutate(data => {
            const current = data.appointments.find(item => item.id === appointment.id)!;
            if (current.status !== 'Agendado') throw new Error('Este agendamento não está disponível.');
            current.status = 'Cancelado';
          }, 'Agendamento cancelado.')) onClose();
        }}>Cancelar agendamento</Button>}
      </RecordForm>}
  </>;
}

function JobDetail({ w, job, onBack }: { w: Workspace; job: Job; onBack: () => void }) {
  const operation = useOperationPreferences('zeus');
  const [tab, setTab] = useState('Ficha');
  const [edit, setEdit] = useState(false);
  const [finish, setFinish] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [report, setReport] = useState(false);
  const d = w.data;
  const s = d.settings;
  const asset = d.assets.find(item => item.id === job.assetId)!;
  const customer = d.customers.find(item => item.id === job.customerId)!;
  const flow = stages(s);
  const patch = (fn: (job: Job) => void, message?: string) => w.mutate(data => fn(data.jobs.find(item => item.id === job.id)!), message);
  const nextLabel = job.stage === 'Entrega' ? 'Registrar entrega e encerrar' : `Avançar para ${flow[flow.indexOf(job.stage) + 1] || 'próxima etapa'}`;
  const tabs = [
    'Ficha',
    ...(s.diagnosisEnabled && operation.actionVisible('diagnosis') ? ['Diagnóstico'] : []),
    ...(s.budgetEnabled && operation.actionVisible('budget') ? ['Orçamento'] : []),
    'Execução',
    ...(operation.actionVisible('attachments') ? ['Anexos'] : []),
    'Linha do tempo'
  ];

  return <>
    <Button variant="text" onClick={onBack}><ArrowLeft size={17} />Voltar aos atendimentos</Button>
    <Title eyebrow={`Ordem de serviço ${String(job.number).padStart(4, '0')} · ${job.type}`} title={asset.identifier} action={operation.actionVisible('report') ? <Button variant="secondary" onClick={() => setReport(true)}><FileDown size={16} />Relatório</Button> : undefined}>
      {customer.name} · {asset.model}{job.technician && ` · ${job.technician}`}
    </Title>

    <WorkflowControl
      label="Etapa da ordem de serviço"
      steps={flow}
      current={job.stage}
      status={job.status}
      nextLabel={activeJob(job) ? nextLabel : undefined}
      onNext={activeJob(job) ? () => {
        if (job.stage === 'Entrega') setFinish(true);
        else void w.mutate(data => advanceJob(data, job.id, job.stage), 'Etapa atualizada.');
      } : undefined}
      actions={activeJob(job) && operation.actionVisible('manualStatus') && <select aria-label="Situação do atendimento" value={job.status} disabled={job.status === 'Aguardando aprovação'} onChange={change => patch(current => {
        current.status = change.target.value;
        current.events.push(event(`Situação: ${current.status}`));
      })}>{Array.from(new Set([job.status, 'Em andamento', 'Aguardando peça', 'Pausado'])).map(value => <option key={value}>{value}</option>)}</select>}
    />

    <div className="op-tabs">{tabs.map(value => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</div>

    {tab === 'Ficha' && <Section title="Ficha do atendimento" action={activeJob(job) && <Button variant="secondary" onClick={() => setEdit(true)}>Editar ficha</Button>}>
      <div className="op-detail-pairs">
        <div><span>{operation.label('customerName', 'Cliente')}</span><strong>{customer.name}</strong>{operation.fieldVisible('customerPhone') && <small>{customer.phone}</small>}</div>
        <div><span>{s.assetLabel}</span><strong>{asset.model} {operation.fieldVisible('year') && asset.year}</strong>{operation.fieldVisible('meter') && <small>{s.meterLabel}: {asset.meter || 'Não informado'}</small>}</div>
        {operation.fieldVisible('technician') && <div><span>{operation.label('technician', 'Responsável')}</span><strong>{job.technician || 'Não definido'}</strong></div>}
        {operation.fieldVisible('due') && <div><span>{operation.label('due', 'Prazo')}</span><strong>{date(job.due, true)}</strong></div>}
      </div>
      <h3>{operation.label('complaint', 'Relato do cliente')}</h3><p className="op-prewrap">{job.complaint}</p>
      {operation.fieldVisible('internalNotes') && job.notes && <><h3>{operation.label('internalNotes', 'Observações internas')}</h3><p className="op-prewrap">{job.notes}</p></>}
      {operation.preferences.customFields.filter(field => field.visible && ['Atendimento', 'Veículo / equipamento', 'Cliente'].includes(field.group)).length > 0 && <div className="op-config-runtime-note"><strong>Campos adicionais configurados</strong><span>{operation.preferences.customFields.filter(field => field.visible && ['Atendimento', 'Veículo / equipamento', 'Cliente'].includes(field.group)).map(field => field.label).join(' · ')}</span><small>Esses campos já fazem parte da configuração da conta; a persistência de valores depende da migração Supabase do aplicativo.</small></div>}
    </Section>}

    {tab === 'Diagnóstico' && <Section title={operation.label('diagnosis', 'Registro técnico')}>
      <p className="op-prewrap">{job.diagnosis || 'Registre os sintomas, a causa identificada e a solução recomendada.'}</p>
      {activeJob(job) && <Button onClick={() => setEdit(true)}>Registrar diagnóstico</Button>}
    </Section>}

    {tab === 'Orçamento' && <Section title="Serviços, peças e decisão">
      {activeJob(job) ? <QuotePanel w={w} quote={job.quote} jobId={job.id} /> : <><Badge>{job.quote.status}</Badge><p>Orçamento preservado no histórico.</p><Timeline events={job.quote.events} /></>}
    </Section>}

    {tab === 'Execução' && <Section title="Lista de serviços">
      {job.tasks.map(task => <label className="op-check-row" key={task.id}>
        <input type="checkbox" checked={!!task.done} disabled={!activeJob(job) || job.stage !== 'Execução'} onChange={change => patch(current => {
          if (current.stage !== 'Execução') throw new Error('A etapa de execução não está ativa.');
          const line = current.tasks.find(item => item.id === task.id)!;
          line.done = change.target.checked;
          current.events.push(event(`${line.done ? 'Concluído' : 'Reaberto'}: ${line.description}`));
        })} />
        <strong>{task.description}</strong><Badge>{task.done ? 'Concluído' : 'Pendente'}</Badge>
      </label>)}
      {!job.tasks.length && <Empty>Sem serviços registrados. Use “Adicionar tarefa” para organizar a execução.</Empty>}
      {activeJob(job) && <Button variant="secondary" onClick={() => setEdit(true)}><Plus size={16} />Adicionar tarefa / atualização</Button>}
    </Section>}

    {tab === 'Linha do tempo' && <Section title="Movimentações"><Timeline events={[...job.events, ...job.quote.events].sort((a, b) => a.at.localeCompare(b.at))} /></Section>}

    {tab === 'Anexos' && <Section title="Fotos do atendimento" action={activeJob(job) && <label className="op-button secondary">Adicionar foto<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async input => {
      const file = input.target.files?.[0];
      if (!file) return;
      if (file.size > 750000) { w.setError('Escolha uma foto de até 750 KB nesta versão local.'); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { w.setError('Use uma imagem JPEG, PNG ou WebP.'); return; }
      const reader = new FileReader();
      reader.onload = () => patch(current => {
        current.attachments.push({ id: uid(), name: file.name, data: String(reader.result) });
        current.events.push(event(`Foto anexada: ${file.name}`));
      });
      reader.readAsDataURL(file);
      input.target.value = '';
    }} /></label>}>
      <div className="op-photos">{job.attachments.map(photo => <figure key={photo.id}><img src={photo.data} alt={photo.name} /><figcaption>{photo.name}</figcaption>{activeJob(job) && <button className="op-icon" aria-label={`Remover ${photo.name}`} onClick={() => patch(current => { current.attachments = current.attachments.filter(item => item.id !== photo.id); })}><X size={16} /></button>}</figure>)}</div>
      {!job.attachments.length && <Empty>Adicione fotos como evidência do atendimento.</Empty>}
    </Section>}

    {activeJob(job) && operation.actionVisible('cancel') && <div className="op-record-secondary-actions"><Button variant="danger" onClick={() => setCancel(true)}>Cancelar OS</Button></div>}

    {edit && <Modal title={tab === 'Diagnóstico' ? 'Diagnóstico técnico' : tab === 'Execução' ? 'Atualizar execução' : 'Editar atendimento'} onClose={() => setEdit(false)}>
      <RecordForm fields={tab === 'Diagnóstico'
        ? [{ name: 'diagnosis', label: operation.label('diagnosis', 'Diagnóstico'), type: 'textarea', required: true, wide: true, value: job.diagnosis }]
        : tab === 'Execução'
          ? [{ name: 'task', label: 'Nova tarefa de execução', wide: true }, { name: 'update', label: 'Atualização', type: 'textarea', wide: true }]
          : [
            ...(operation.fieldVisible('technician') ? [{ name: 'technician', label: operation.label('technician', 'Responsável'), value: job.technician }] : []),
            ...(operation.fieldVisible('due') ? [{ name: 'due', label: operation.label('due', 'Prazo'), type: 'datetime-local', value: job.due }] : []),
            { name: 'complaint', label: operation.label('complaint', 'Relato'), type: 'textarea', wide: true, required: true, value: job.complaint },
            ...(operation.fieldVisible('internalNotes') ? [{ name: 'notes', label: operation.label('internalNotes', 'Observações internas'), type: 'textarea', wide: true, value: job.notes }] : [])
          ]}
        onClose={() => setEdit(false)}
        onSave={values => patch(current => {
          if (tab === 'Execução') {
            if (values.task.trim()) { current.tasks.push({ id: uid(), description: values.task, done: false }); current.events.push(event(`Tarefa adicionada: ${values.task}`)); }
            if (values.update.trim()) current.events.push(event(values.update));
          } else {
            if ('diagnosis' in values) current.diagnosis = values.diagnosis;
            else {
              if (values.technician !== undefined) current.technician = values.technician;
              if (values.due !== undefined) current.due = values.due;
              current.complaint = values.complaint;
              if (values.notes !== undefined) current.notes = values.notes;
            }
            current.events.push(event(tab === 'Diagnóstico' ? 'Diagnóstico atualizado' : 'Ficha atualizada'));
          }
        })}
      />
    </Modal>}

    {finish && <Confirm title="Confirmar entrega e encerramento?" onClose={() => setFinish(false)} onConfirm={() => w.mutate(data => advanceJob(data, job.id, job.stage), 'Atendimento encerrado e enviado ao histórico.')}>A OS será preservada no histórico com todas as movimentações.</Confirm>}

    {cancel && <Modal title="Cancelar ordem de serviço" onClose={() => setCancel(false)}><RecordForm fields={[{ name: 'reason', label: 'Motivo do cancelamento', type: 'textarea', wide: true, required: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={values => patch(current => { current.status = 'Cancelado'; current.events.push(event(`Cancelado: ${values.reason}`)); })} /></Modal>}

    {report && <Modal title="Relatório do atendimento" wide onClose={() => setReport(false)}>
      <div className="op-print-document">
        <span className="op-kicker">{s.business || 'Oficina'}</span>
        <h2>Relatório · OS {job.number}</h2><p>{s.phone} {s.email}</p>
        <div className="op-detail-pairs"><div><span>Cliente</span><strong>{customer.name}</strong></div><div><span>{s.identifierLabel}</span><strong>{asset.identifier} · {asset.model}</strong></div><div><span>Abertura</span><strong>{date(job.createdAt, true)}</strong></div><div><span>Situação</span><strong>{job.status}</strong></div></div>
        <h3>Relato</h3><p>{job.complaint}</p><h3>Diagnóstico</h3><p>{job.diagnosis || 'Não registrado'}</p>
        <h3>Serviços e peças</h3>{job.quote.lines.map(line => <div className="op-row" key={line.id}><span>{line.description} {line.brand}</span><Badge>{job.tasks.find(task => task.id === line.id)?.done ? 'Concluído' : line.kind}</Badge></div>)}
      </div>
      <div className="op-form-footer"><Button onClick={() => window.print()}>Imprimir / salvar PDF</Button></div>
    </Modal>}
  </>;
}
