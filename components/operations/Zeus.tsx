'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Wrench } from 'lucide-react';
import { Appointment, Asset, Job, activeJob, date, event, localDay, matches, newJob, setCustomValues, stages, uid } from '@/lib/operations/model';
import { customerSuggestions, resolveCustomer } from '@/lib/operations/customers';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { useZeusServiceTypes } from '@/lib/operations/serviceTypes';
import { Workspace, csv } from '@/lib/operations/storage';
import { defaultQuoteValidity, initialJobStatus, readZeusPreferences } from '@/lib/operations/zeus';
import { Badge, Button, Confirm, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section, Title } from './ui';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';
import { useRecordRoute } from './useRecordRoute';

const assetKey = (value: string) => value.replace(/\W/g, '').toUpperCase();

export function Zeus({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const router = useRouter();
  const d = w.data;
  const s = d.settings;
  const operation = useOperationPreferences('zeus');
  const prefs = readZeusPreferences(d);
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState(false);
  const [schedule, setSchedule] = useState<Appointment | 'new' | null>(null);
  const [, setSelected] = useRecordRoute(recordId, '/zeus/atendimentos');
  const [assetCustomer, setAssetCustomer] = useState('');
  const [day, setDay] = useState(localDay());
  const [week, setWeek] = useState(false);
  const [confirm, setConfirm] = useState<Appointment | null>(null);
  const [createdJobId, setCreatedJobId] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('createdAt');
  const [descending, setDescending] = useState(true);

  const findCustomer = (id: string) => d.customers.find(customer => customer.id === id)?.name || 'Cliente';
  const findAsset = (id: string) => d.assets.find(asset => asset.id === id);
  const searchedJobs = d.jobs.filter(job => matches(query, job.number, findCustomer(job.customerId), findAsset(job.assetId)?.identifier, findAsset(job.assetId)?.model, job.type, job.technician));

  const definitions = useMemo<FilterDefinition[]>(() => {
    const values = {
      Status: Array.from(new Set(d.jobs.map(job => job.status))).sort(),
      Etapa: Array.from(new Set(d.jobs.map(job => job.stage))).sort(),
      Tipo: Array.from(new Set(d.jobs.map(job => job.type))).sort(),
      Responsável: Array.from(new Set(d.jobs.map(job => job.technician || 'Sem responsável'))).sort(),
      Cliente: Array.from(new Set(d.jobs.map(job => findCustomer(job.customerId)))).sort()
    };
    const display: Record<string, string> = { Tipo: operation.label('type', 'Tipo'), Responsável: operation.label('technician', 'Responsável'), Cliente: operation.label('customer', 'Cliente') };
    return prefs.jobFilters.map(key => ({ key, label: display[key] || key, options: values[key as keyof typeof values] || [] })).filter(item => item.options.length);
  }, [d.jobs, prefs.jobFilters, operation]);

  const filteredJobs = (list: Job[]) => list.filter(job => {
    const values: Record<string, string> = { Status: job.status, Etapa: job.stage, Tipo: job.type, Responsável: job.technician || 'Sem responsável', Cliente: findCustomer(job.customerId) };
    return Object.entries(activeFilters).every(([key, selected]) => !selected.length || selected.includes(values[key]));
  }).sort((a, b) => {
    const value = (job: Job) => sort === 'number' ? job.number : sort === 'due' ? job.due : job.createdAt;
    const av = value(a); const bv = value(b);
    const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return descending ? -result : result;
  });

  const approvalSince = (job: Job) => [...job.quote.events].reverse().find(item => item.text.toLocaleLowerCase('pt-BR').includes('enviad'))?.at || job.createdAt;

  const appointmentList = (list: Appointment[]) => list.length ? <div className="op-agenda">{[...list].sort((a, b) => a.at.localeCompare(b.at)).map(appointment => <div className="op-agenda-row" key={appointment.id}>
    <time>{new Date(appointment.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<small>{date(appointment.at)}</small></time>
    <div className="op-grow"><strong className="op-identifier">{findAsset(appointment.assetId)?.identifier}</strong><span>{findCustomer(appointment.customerId)} · {findAsset(appointment.assetId)?.model}</span><small>{appointment.type}{appointment.technician && ` · ${appointment.technician}`} · {appointment.status}</small></div>
    <div className="op-actions">{appointment.status === 'Agendado' ? <><Button variant="secondary" onClick={() => setSchedule(appointment)}>Reagendar</Button><Button onClick={() => setConfirm(appointment)}>Abrir OS <ArrowRight size={16} /></Button></> : appointment.jobId && <Button variant="secondary" onClick={() => setSelected(appointment.jobId!)}>Ver OS</Button>}</div>
  </div>)}</div> : <Empty icon={<CalendarDays size={28} />}>Nenhum atendimento agendado neste período.</Empty>;

  const jobList = (list: Job[]) => list.length ? <div className="op-job-list">{list.map(job => {
    const asset = findAsset(job.assetId);
    const flow = stages(s);
    const waiting = job.status === 'Aguardando aprovação' ? `Aguardando decisão desde ${date(approvalSince(job))}` : job.status === 'Aguardando diagnóstico' ? 'Identificação finalizada · diagnóstico ainda não iniciado' : job.status === 'Aguardando peça' ? 'Serviço parado por peça' : job.status === 'Pausado' ? 'Atendimento pausado' : '';
    return <button key={job.id} className="op-job" onClick={() => setSelected(job.id)}>
      <div className="op-job-identity"><small>OS {String(job.number).padStart(4, '0')} · {job.type}</small><strong>{asset?.identifier}</strong><span>{findCustomer(job.customerId)}</span><small>{asset?.model}</small></div>
      <div className="op-job-work"><strong>{job.stage}</strong><span>{job.technician || `Sem ${operation.label('technician', 'responsável').toLowerCase()}`}</span>{waiting && <small className="op-overdue">{waiting}</small>}<div className="op-stage-meter">{flow.map(stage => <i key={stage} className={flow.indexOf(stage) <= flow.indexOf(job.stage) ? 'filled' : ''} />)}</div></div>
      <div className="op-job-state"><Badge tone={['Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status) ? 'warning' : ''}>{job.status}</Badge>{job.due && <small>{date(job.due, true)}</small>}<ArrowRight size={18} /></div>
    </button>;
  })}</div> : <Empty icon={<Wrench size={28} />}>{query ? 'Nenhum atendimento encontrado.' : 'As ordens de serviço aparecerão aqui.'}</Empty>;

  return <>
    {page === 'inicio' && <>
      <Title eyebrow="Bancada de trabalho" title="Hoje na oficina" action={<>{s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Link className="op-button secondary" href="/zeus/agendamentos"><CalendarDays size={17} />Agendar</Link>}<Button onClick={() => setCreate(true)}><Plus size={18} />Novo atendimento</Button></>} />
      <div className="zeus-date-strip"><span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span><SearchBox value={query} onChange={setQuery} placeholder={`Buscar ${s.identifierLabel.toLowerCase()}, cliente ou OS`} /></div>
      {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Section title="Agendamentos de hoje" action={<Link href="/zeus/agendamentos" className="op-text-link">Ver semana <ArrowRight size={15} /></Link>}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === localDay() && appointment.status === 'Agendado'))}</Section>}
      {s.budgetEnabled && d.jobs.some(job => job.status === 'Aguardando aprovação') && <Section title="Aguardando aprovação">{jobList(searchedJobs.filter(job => job.status === 'Aguardando aprovação'))}</Section>}
      {d.jobs.some(job => job.status === 'Aguardando diagnóstico') && <Section title="Aguardando diagnóstico">{jobList(searchedJobs.filter(job => job.status === 'Aguardando diagnóstico'))}</Section>}
      {d.jobs.some(job => ['Aguardando peça', 'Pausado'].includes(job.status)) && <Section title="Parados / dependências">{jobList(searchedJobs.filter(job => ['Aguardando peça', 'Pausado'].includes(job.status)))}</Section>}
      <Section title="Em trabalho" action={<span className="op-muted">{d.jobs.filter(job => activeJob(job) && !['Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status)).length} atendimentos</span>}>{jobList(searchedJobs.filter(job => activeJob(job) && !['Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status)))}</Section>
      {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && <Section title="Próximos atendimentos">{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) > localDay() && appointment.status === 'Agendado').slice(0, 5))}</Section>}
    </>}

    {(page === 'atendimentos' || page === 'historico') && <>
      <Title eyebrow={page === 'historico' ? 'Arquivo técnico' : 'Operação'} title={page === 'historico' ? 'Histórico de atendimentos' : 'Atendimentos'} action={<><Button variant="secondary" onClick={() => csv('atendimentos.csv', [['OS', s.identifierLabel, 'Cliente', operation.label('type', 'Tipo'), 'Etapa', 'Status', 'Abertura'], ...searchedJobs.filter(job => page === 'historico' ? !activeJob(job) : activeJob(job)).map(job => [job.number, findAsset(job.assetId)?.identifier, findCustomer(job.customerId), job.type, job.stage, job.status, date(job.createdAt)])])}><FileDown size={17} />Exportar</Button>{page !== 'historico' && <Button onClick={() => setCreate(true)}><Plus size={18} />Novo atendimento</Button>}</>} />
      <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={activeFilters} onActive={setActiveFilters} sort={sort} sortOptions={[{ value: 'createdAt', label: 'Data de abertura' }, { value: 'number', label: 'Número da OS' }, { value: 'due', label: operation.label('due', 'Prazo previsto') }]} descending={descending} onSort={setSort} onDescending={setDescending} placeholder={`Buscar ${s.identifierLabel.toLowerCase()}, cliente, ${operation.label('technician', 'responsável').toLowerCase()} ou OS`} />
      {jobList(filteredJobs(searchedJobs.filter(job => page === 'historico' ? !activeJob(job) : activeJob(job))))}
    </>}

    {page === 'agendamentos' && <>
      <Title eyebrow="Agenda da oficina" title="Organize as próximas chegadas" action={<Button onClick={() => setSchedule('new')}><Plus size={18} />Novo agendamento</Button>} />
      <div className="op-toolbar"><div className="op-actions"><Button variant="secondary" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() - (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronLeft size={17} /></Button><input type="date" value={day} onChange={change => setDay(change.target.value)} /><Button variant="secondary" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronRight size={17} /></Button><Button variant="secondary" onClick={() => setDay(localDay())}>Hoje</Button></div><div className="op-tabs"><button className={!week ? 'active' : ''} onClick={() => setWeek(false)}>Dia</button><button className={week ? 'active' : ''} onClick={() => setWeek(true)}>Semana</button></div></div>
      {week ? <div className="zeus-week">{Array.from({ length: 7 }, (_, index) => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + index); const key = localDay(value); return <Section key={key} title={value.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === key))}</Section>; })}</div> : <Section title={date(day)}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === day))}</Section>}
    </>}

    {page === 'clientes' && <CustomerManager w={w} title={`Clientes e ${s.assetLabel.toLowerCase()}s`} onOpen={customer => <><Section title={`${s.assetLabel}s`} action={<Button variant="secondary" onClick={() => setAssetCustomer(customer.id)}><Plus size={16} />Adicionar</Button>}>{d.assets.filter(asset => asset.customerId === customer.id).map(asset => <div className="op-row" key={asset.id}><div className="op-grow"><strong className="op-identifier">{asset.identifier}</strong><span>{asset.model} · {asset.year || 'Ano não informado'}</span></div><Badge>{d.jobs.filter(job => job.assetId === asset.id).length} OS</Badge></div>)}{!d.assets.some(asset => asset.customerId === customer.id) && <Empty>Nenhum cadastro associado.</Empty>}</Section><Section title="Histórico do cliente">{d.jobs.filter(job => job.customerId === customer.id).map(job => <div className="op-row" key={job.id}><strong>OS {job.number}</strong><span>{job.type} · {date(job.createdAt)}</span><Badge>{job.status}</Badge></div>)}</Section></>} />}

    {create && <Modal title={`Identificação do ${s.assetLabel.toLowerCase()}`} wide onClose={() => setCreate(false)}><JobForm w={w} onClose={() => setCreate(false)} onCreated={id => { setCreate(false); setCreatedJobId(id); }} /></Modal>}
    {schedule && <Modal title={schedule === 'new' ? 'Novo agendamento' : 'Reagendar atendimento'} wide onClose={() => setSchedule(null)}><AppointmentForm w={w} appointment={schedule === 'new' ? undefined : schedule} onClose={() => setSchedule(null)} /></Modal>}
    {confirm && <Confirm title="Iniciar atendimento?" label="Abrir ordem de serviço" onClose={() => setConfirm(null)} onConfirm={() => w.mutate(next => { const id = newJob(next, { customerId: confirm.customerId, assetId: confirm.assetId, type: confirm.type, technician: confirm.technician, due: '', complaint: confirm.notes, diagnosis: '', notes: '' }, confirm.id); const job = next.jobs.find(item => item.id === id)!; job.status = initialJobStatus(next.settings); job.quote.validUntil = defaultQuoteValidity(next); job.events.push(event(`Situação: ${job.status}`)); setCreatedJobId(id); }, 'Ordem de serviço aberta.')}>Os dados deste agendamento serão aproveitados na ordem de serviço.</Confirm>}
    {assetCustomer && <Modal title={`Cadastrar ${s.assetLabel.toLowerCase()}`} onClose={() => setAssetCustomer('')}><AssetForm w={w} customerId={assetCustomer} onClose={() => setAssetCustomer('')} /></Modal>}
    {createdJobId && <Modal title="Identificação concluída" onClose={() => setCreatedJobId('')}><div className="zeus-created-choice"><p>A ficha foi salva e a OS está em <strong>{d.jobs.find(item => item.id === createdJobId)?.status || 'aguardando próxima etapa'}</strong>. O que você quer fazer agora?</p><div className="op-actions"><Button variant="secondary" onClick={() => { setCreatedJobId(''); router.push('/zeus'); }}>Voltar para tela inicial</Button><Button onClick={() => { const id = createdJobId; setCreatedJobId(''); setSelected(id); }}>Ver ordem de serviço <ArrowRight size={16} /></Button></div></div></Modal>}
  </>;
}

function customFieldDefs(operation: ReturnType<typeof useOperationPreferences>, groups: string[]) {
  const helpMap = ((operation.preferences as typeof operation.preferences & { fieldHelp?: Record<string, string> }).fieldHelp || {});
  return operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => ({ name: `custom__${field.id}`, label: field.label, wide: true, help: helpMap[`custom:${field.id}`] }));
}
function customFromForm(operation: ReturnType<typeof useOperationPreferences>, groups: string[], form: Record<string, string>) {
  return Object.fromEntries(operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => [field.id, form[`custom__${field.id}`] || '']));
}

function JobForm({ w, onClose, onCreated }: { w: Workspace; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('zeus');
  const serviceTypes = useZeusServiceTypes();
  const [search, setSearch] = useState('');
  const [assetId, setAssetId] = useState('');
  const s = w.data.settings;
  const asset = w.data.assets.find(item => item.id === assetId);
  const currentCustomer = asset ? w.data.customers.find(item => item.id === asset.customerId) : undefined;
  const suggestions = customerSuggestions(w.data);
  const customGroups = ['Cliente', 'Veículo / equipamento', 'Atendimento'];
  const results = search.trim() ? w.data.assets.filter(item => matches(search, item.identifier, item.model, w.data.customers.find(customer => customer.id === item.customerId)?.name)).slice(0, 8) : [];

  return <>
    <SearchBox value={search} onChange={value => { setSearch(value); if (assetId) setAssetId(''); }} placeholder={`Digite ${s.identifierLabel.toLowerCase()}, ${s.assetLabel.toLowerCase()} ou cliente`} />
    {results.length > 0 && !asset && <div className="op-picker-results">{results.map(item => <button type="button" className="op-row" key={item.id} onClick={() => setAssetId(item.id)}><strong>{item.identifier}</strong><span>{item.model} · {w.data.customers.find(customer => customer.id === item.customerId)?.name}</span><ArrowRight size={16} /></button>)}</div>}
    {asset && <div className="op-callout"><strong>{asset.identifier} · {asset.model}</strong><span>{currentCustomer?.name}</span><button type="button" className="op-text-link" onClick={() => { setAssetId(''); setSearch(''); }}>Trocar</button></div>}
    <RecordForm draftKey="zeus-job:new" fields={[
      ...(!asset ? [
        { name: 'customer', label: operation.label('customer', 'Cliente'), required: true, suggestions, hint: 'Digite o nome. Se existir, o Zeus reaproveita; se não existir, cria automaticamente.', configKey: 'customer' },
        { name: 'phone', label: operation.label('phone', 'Telefone'), type: 'tel', configKey: 'phone' },
        { name: 'identifier', label: s.identifierLabel, required: true, value: search, configKey: 'identifier' },
        { name: 'model', label: s.assetLabel, required: true, configKey: 'asset' },
        { name: 'year', label: operation.label('year', 'Ano'), configKey: 'year' },
        { name: 'meter', label: s.meterLabel, configKey: 'meter' }
      ] : []),
      { name: 'type', label: operation.label('type', 'Tipo de atendimento'), required: true, options: serviceTypes.map(value => ({ value, label: value })), configKey: 'type' },
      { name: 'technician', label: operation.label('technician', 'Responsável'), configKey: 'technician' },
      { name: 'due', label: operation.label('due', 'Prazo previsto'), type: 'datetime-local', configKey: 'due' },
      { name: 'complaint', label: operation.label('complaint', 'Relato do cliente'), type: 'textarea', wide: true, required: true, configKey: 'complaint' },
      ...customFieldDefs(operation, customGroups)
    ]} submit="Finalizar identificação" onClose={onClose} onSave={form => w.mutate(data => {
      let selectedAsset = assetId ? data.assets.find(item => item.id === assetId) : undefined;
      let cid = selectedAsset?.customerId || '';
      let aid = selectedAsset?.id || '';
      if (!selectedAsset) {
        const identifier = form.identifier.trim();
        const exact = data.assets.find(item => assetKey(item.identifier) === assetKey(identifier));
        if (exact) { selectedAsset = exact; cid = exact.customerId; aid = exact.id; }
        else {
          const resolved = resolveCustomer(data, form.customer, { phone: form.phone });
          cid = resolved.id; aid = uid();
          data.assets.push({ id: aid, customerId: cid, identifier: identifier.toUpperCase(), model: form.model.trim(), year: form.year || '', meter: form.meter || '' });
        }
      }
      const id = newJob(data, { assetId: aid, customerId: cid, type: form.type, technician: form.technician || '', due: form.due || '', complaint: form.complaint, diagnosis: '', notes: '' });
      const job = data.jobs.find(item => item.id === id)!;
      job.status = initialJobStatus(data.settings);
      job.quote.validUntil = defaultQuoteValidity(data);
      job.events.push(event(`Situação: ${job.status}`));
      const values = customFromForm(operation, customGroups, form);
      if (cid) setCustomValues(data, cid, Object.fromEntries(operation.preferences.customFields.filter(field => field.group === 'Cliente').map(field => [field.id, values[field.id] || ''])));
      if (aid) setCustomValues(data, aid, Object.fromEntries(operation.preferences.customFields.filter(field => field.group === 'Veículo / equipamento').map(field => [field.id, values[field.id] || ''])));
      setCustomValues(data, id, Object.fromEntries(operation.preferences.customFields.filter(field => field.group === 'Atendimento').map(field => [field.id, values[field.id] || ''])));
      onCreated(id);
    }, 'Identificação salva.')} />
  </>;
}

function AppointmentForm({ w, appointment, onClose }: { w: Workspace; appointment?: Appointment; onClose: () => void }) {
  const operation = useOperationPreferences('zeus');
  const serviceTypes = useZeusServiceTypes();
  const [assetId, setAssetId] = useState(appointment?.assetId || '');
  const [search, setSearch] = useState('');
  const asset = w.data.assets.find(item => item.id === assetId);
  const customer = asset ? w.data.customers.find(item => item.id === asset.customerId) : undefined;
  const suggestions = customerSuggestions(w.data);
  const results = search.trim() ? w.data.assets.filter(item => matches(search, item.identifier, item.model, w.data.customers.find(current => current.id === item.customerId)?.name)).slice(0, 8) : [];
  return <>
    <SearchBox value={search} onChange={value => { setSearch(value); if (assetId && !appointment) setAssetId(''); }} placeholder={`Digite ${w.data.settings.assetLabel.toLowerCase()}, identificação ou cliente`} />
    {results.length > 0 && <div className="op-picker-results">{results.map(item => <button type="button" className="op-row" key={item.id} onClick={() => setAssetId(item.id)}><strong>{item.identifier}</strong><span>{item.model} · {w.data.customers.find(current => current.id === item.customerId)?.name}</span></button>)}</div>}
    {asset && <div className="op-callout"><strong>{asset.identifier} · {asset.model}</strong><span>{customer?.name}</span>{!appointment && <button type="button" className="op-text-link" onClick={() => { setAssetId(''); setSearch(''); }}>Trocar</button>}</div>}
    <RecordForm draftKey={`zeus-appointment:${appointment?.id || 'new'}`} fields={[
      ...(!asset ? [
        { name: 'customer', label: operation.label('customer', 'Cliente'), required: true, suggestions, hint: 'Digite e continue. Um cliente novo é criado automaticamente se não existir.', configKey: 'customer' },
        { name: 'phone', label: operation.label('phone', 'Telefone'), type: 'tel', configKey: 'phone' },
        { name: 'identifier', label: w.data.settings.identifierLabel, required: true, value: search, configKey: 'identifier' },
        { name: 'model', label: w.data.settings.assetLabel, required: true, configKey: 'asset' }
      ] : []),
      { name: 'at', label: operation.label('scheduleDate', 'Data e horário'), type: 'datetime-local', required: true, value: appointment?.at, configKey: 'scheduleDate' },
      { name: 'type', label: operation.label('type', 'Tipo de atendimento'), value: appointment?.type, required: true, options: serviceTypes.map(value => ({ value, label: value })), configKey: 'type' },
      { name: 'technician', label: operation.label('technician', 'Responsável'), value: appointment?.technician, configKey: 'technician' },
      { name: 'notes', label: operation.label('internalNotes', 'Observações'), type: 'textarea', wide: true, value: appointment?.notes, configKey: 'internalNotes' }
    ]} onClose={onClose} onSave={form => w.mutate(data => {
      let selectedAsset = assetId ? data.assets.find(item => item.id === assetId) : undefined;
      if (!selectedAsset) {
        const exact = data.assets.find(item => assetKey(item.identifier) === assetKey(form.identifier));
        if (exact) selectedAsset = exact;
        else {
          const resolved = resolveCustomer(data, form.customer, { phone: form.phone });
          selectedAsset = { id: uid(), customerId: resolved.id, identifier: form.identifier.trim().toUpperCase(), model: form.model.trim(), year: '', meter: '' };
          data.assets.push(selectedAsset);
        }
      }
      const next: Appointment = { id: appointment?.id || uid(), customerId: selectedAsset.customerId, assetId: selectedAsset.id, at: form.at, type: form.type, technician: form.technician || '', notes: form.notes || '', status: 'Agendado' };
      const index = data.appointments.findIndex(item => item.id === next.id);
      if (index < 0) data.appointments.push(next); else data.appointments[index] = next;
    }, 'Agendamento salvo.')} />
  </>;
}

function AssetForm({ w, customerId, onClose }: { w: Workspace; customerId: string; onClose: () => void }) {
  const operation = useOperationPreferences('zeus');
  const s = w.data.settings;
  return <RecordForm draftKey={`zeus-asset:${customerId}:new`} fields={[{ name: 'identifier', label: s.identifierLabel, required: true, configKey: 'identifier' }, { name: 'model', label: s.assetLabel, required: true, configKey: 'asset' }, { name: 'year', label: operation.label('year', 'Ano'), configKey: 'year' }, { name: 'meter', label: s.meterLabel, configKey: 'meter' }]} onClose={onClose} onSave={form => w.mutate(data => { if (data.assets.some(asset => assetKey(asset.identifier) === assetKey(form.identifier))) throw new Error('Esta identificação já está cadastrada.'); data.assets.push({ id: uid(), customerId, identifier: form.identifier, model: form.model, year: form.year || '', meter: form.meter || '' } as Asset); })} />;
}
