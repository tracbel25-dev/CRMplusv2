'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, FileDown, Plus, Wrench } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Appointment, Asset, Job, activeJob, date, effectiveQuoteStatus, event, localDay, matches, newJob, setCustomValues, stages, uid } from '@/lib/operations/model';
import { customerSuggestions, resolveCustomer } from '@/lib/operations/customers';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { useZeusServiceTypes } from '@/lib/operations/serviceTypes';
import { Workspace, csv } from '@/lib/operations/storage';
import { defaultQuoteValidity, initialJobStatus, zeusJobsForAsset, zeusJobsForCustomer } from '@/lib/operations/zeus';
import { readZeusChecklistConfig, setZeusChecklistChoice } from '@/lib/operations/zeusChecklist';
import type { ZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import { ZEUS_RELATED_JOB_KEY, ZEUS_WARRANTY_REASON_KEY } from '@/lib/operations/zeusChecklistKeys';
import { zeusViewHasFeature } from '@/lib/operations/zeusPlans';
import { Badge, Button, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section, Title } from './ui';
import { ZeusFilterBar, type FilterDefinition } from './ZeusFilterBar';
import { ZeusChecklistChoicePicker } from './ZeusChecklistChoicePicker';
import { useRecordRoute } from './useRecordRoute';

const assetKey = (value: string) => value.replace(/\W/g, '').toUpperCase();
const JOB_FILTER_KEYS = ['Número da OS', 'Identificação', 'Cliente', 'Veículo', 'Tipo', 'Etapa', 'Responsável', 'Status', 'Orçamento', 'Prazo'];

function jobBudgetState(job: Job) {
  const hasBudget = job.quote.lines.length > 0 || job.stage === 'Orçamento' || job.quote.status !== 'Rascunho';
  return hasBudget ? effectiveQuoteStatus(job.quote) : 'Sem orçamento';
}

function jobDeadlineBucket(due: string) {
  if (!due) return 'Sem prazo';
  const key = due.slice(0, 10);
  const today = localDay();
  if (!key) return 'Sem prazo';
  if (key < today) return 'Atrasado';
  if (key === today) return 'Vence hoje';
  return 'No prazo';
}

export function Zeus({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const router = useRouter();
  const access = useStoreAccess();
  const d = w.data;
  const s = d.settings;
  const operation = useOperationPreferences('zeus');
  const identifierLabel = operation.label('identifier', s.identifierLabel || 'Identificação');
  const assetLabel = operation.label('asset', s.assetLabel || 'Item atendido');
  const simpleFlow = !zeusViewHasFeature(s, 'checklist') && !zeusViewHasFeature(s, 'diagnosis') && !zeusViewHasFeature(s, 'budgets');
  const canViewJobs = access.hasPermission('zeus', 'jobs_view');
  const canCreateJobs = access.hasPermission('zeus', 'jobs_create');
  const canViewAppointments = access.hasPermission('zeus', 'appointments_view');
  const canManageAppointments = access.hasPermission('zeus', 'appointments_manage');
  const canExport = access.hasPermission('zeus', 'reports_export') && zeusViewHasFeature(s, 'export');
  const [query, setQuery] = useState('');
  const [create, setCreate] = useState<Appointment | 'new' | null>(null);
  const [schedule, setSchedule] = useState<Appointment | 'new' | null>(null);
  const [, setSelected] = useRecordRoute(recordId, '/zeus/atendimentos');
  const [assetCustomer, setAssetCustomer] = useState('');
  const [day, setDay] = useState(localDay());
  const [week, setWeek] = useState(false);
  const [createdJobId, setCreatedJobId] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('createdAt');
  const [descending, setDescending] = useState(true);

  const findCustomer = (id: string) => d.customers.find(customer => customer.id === id)?.name || 'Cliente';
  const findAsset = (id: string) => d.assets.find(asset => asset.id === id);
  const hasResponsible = operation.fieldVisible('technician');
  const searchedJobs = d.jobs.filter(job => matches(query, job.number, findCustomer(job.customerId), findAsset(job.assetId)?.identifier, findAsset(job.assetId)?.model, job.type, hasResponsible ? job.technician : ''));

  const definitions = useMemo<FilterDefinition[]>(() => {
    const values: Record<string, string[]> = {
      'Número da OS': Array.from(new Set(d.jobs.map(job => String(job.number).padStart(4, '0')))).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      Identificação: Array.from(new Set(d.jobs.map(job => findAsset(job.assetId)?.identifier || 'Sem identificação'))).sort(),
      Cliente: Array.from(new Set(d.jobs.map(job => findCustomer(job.customerId)))).sort(),
      Veículo: Array.from(new Set(d.jobs.map(job => findAsset(job.assetId)?.model || 'Sem modelo'))).sort(),
      Tipo: Array.from(new Set(d.jobs.map(job => job.type))).sort(),
      Etapa: Array.from(new Set(d.jobs.map(job => job.stage))).sort(),
      Responsável: Array.from(new Set(d.jobs.map(job => job.technician || 'Sem responsável'))).sort(),
      Status: Array.from(new Set(d.jobs.map(job => job.status))).sort(),
      Orçamento: Array.from(new Set(d.jobs.map(jobBudgetState))).sort(),
      Prazo: ['Atrasado', 'Vence hoje', 'No prazo', 'Sem prazo']
    };
    const display: Record<string, string> = {
      Identificação: identifierLabel,
      Veículo: assetLabel,
      Tipo: operation.label('type', 'Tipo de OS'),
      Responsável: operation.label('technician', 'Técnico'),
      Cliente: operation.label('customer', 'Cliente'),
      Prazo: operation.label('due', 'Prazo previsto')
    };
    const available = JOB_FILTER_KEYS.filter(key => {
      if (key === 'Cliente') return operation.fieldVisible('customer');
      if (key === 'Identificação') return operation.fieldVisible('identifier');
      if (key === 'Veículo') return operation.fieldVisible('asset');
      if (key === 'Tipo') return operation.fieldVisible('type');
      if (key === 'Responsável') return operation.fieldVisible('technician');
      if (key === 'Prazo') return operation.fieldVisible('due');
      if (key === 'Orçamento') return zeusViewHasFeature(s, 'budgets');
      return true;
    });
    return available.map(key => ({ key, label: display[key] || key, options: values[key] || [] }));
  }, [d.jobs, d.assets, d.customers, operation, identifierLabel, assetLabel, s.planCode, s.planFeatures]);

  const filteredJobs = (list: Job[]) => list.filter(job => {
    const asset = findAsset(job.assetId);
    const values: Record<string, string> = {
      'Número da OS': String(job.number).padStart(4, '0'),
      Identificação: asset?.identifier || 'Sem identificação',
      Cliente: findCustomer(job.customerId),
      Veículo: asset?.model || 'Sem modelo',
      Tipo: job.type,
      Etapa: job.stage,
      Responsável: job.technician || 'Sem responsável',
      Status: job.status,
      Orçamento: jobBudgetState(job),
      Prazo: jobDeadlineBucket(job.due)
    };
    return Object.entries(activeFilters).every(([key, selected]) => !selected.length || selected.includes(values[key]));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const approvalSince = (job: Job) => [...job.quote.events].reverse().find(item => item.text.toLocaleLowerCase('pt-BR').includes('enviad'))?.at || job.createdAt;

  const appointmentList = (list: Appointment[]) => list.length ? <div className="op-agenda">{[...list].sort((a, b) => a.at.localeCompare(b.at)).map(appointment => <div className="op-agenda-row" key={appointment.id}>
    <time>{new Date(appointment.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<small>{date(appointment.at)}</small></time>
    <div className="op-grow"><strong className="op-identifier">{findAsset(appointment.assetId)?.identifier}</strong><span>{findCustomer(appointment.customerId)} · {findAsset(appointment.assetId)?.model}</span><small>{appointment.type}{hasResponsible && appointment.technician ? ` · ${appointment.technician}` : ''} · {appointment.status}</small></div>
    <div className="op-actions">{appointment.status === 'Agendado' ? <>{canManageAppointments && <Button variant="secondary" onClick={() => setSchedule(appointment)}>Reagendar</Button>}{canCreateJobs && <Button onClick={() => setCreate(appointment)}>Abrir OS <ArrowRight size={16} /></Button>}</> : appointment.jobId && canViewJobs && <Button variant="secondary" onClick={() => setSelected(appointment.jobId!)}>Ver OS</Button>}</div>
  </div>)}</div> : <Empty icon={<CalendarDays size={28} />}>Nenhum atendimento agendado neste período.</Empty>;

  const jobList = (list: Job[]) => list.length ? <div className="op-job-list">{list.map(job => {
    const asset = findAsset(job.assetId);
    const flow = stages(s);
    const waiting = job.status === 'Aguardando checklist' ? 'Checklist de entrada ainda não concluído' : job.status === 'Aguardando aprovação' ? `Aguardando decisão desde ${date(approvalSince(job))}` : job.status === 'Aguardando diagnóstico' ? 'Identificação finalizada · diagnóstico ainda não iniciado' : job.status === 'Aguardando peça' ? 'Serviço parado por peça' : job.status === 'Pausado' ? 'Atendimento pausado' : '';
    return <button key={job.id} className="op-job" onClick={() => setSelected(job.id)}>
      <div className="op-job-identity"><small>OS {String(job.number).padStart(4, '0')} · {job.type}</small><strong>{asset?.identifier}</strong><span>{findCustomer(job.customerId)}</span><small>{asset?.model}</small></div>
      <div className="op-job-work"><strong>{job.stage}</strong>{hasResponsible && <span>{job.technician || `Sem ${operation.label('technician', 'responsável').toLowerCase()}`}</span>}{waiting && <small className="op-overdue">{waiting}</small>}<div className="op-stage-meter">{flow.map(stage => <i key={stage} className={flow.indexOf(stage) <= flow.indexOf(job.stage) ? 'filled' : ''} />)}</div></div>
      <div className="op-job-state"><Badge tone={['Aguardando checklist', 'Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status) ? 'warning' : ''}>{job.status}</Badge>{job.due && <small>{date(job.due, true)}</small>}<ArrowRight size={18} /></div>
    </button>;
  })}</div> : <Empty icon={<Wrench size={28} />}>{query ? 'Nenhum atendimento encontrado.' : 'As ordens de serviço aparecerão aqui.'}</Empty>;

  const startHomeJobs = [...d.jobs.filter(activeJob)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const startStopped = startHomeJobs.filter(job => ['Pausado', 'Aguardando peça'].includes(job.status));
  const startStoppedIds = new Set(startStopped.map(job => job.id));
  const startReady = startHomeJobs.filter(job =>
    !startStoppedIds.has(job.id) &&
    (job.status === 'Pronto para retirada' || job.stage === 'Entrega')
  );
  const startReadyIds = new Set(startReady.map(job => job.id));
  const startIdentification = startHomeJobs.filter(job =>
    !startStoppedIds.has(job.id) &&
    !startReadyIds.has(job.id) &&
    job.stage === 'Identificação'
  );
  const startIdentificationIds = new Set(startIdentification.map(job => job.id));
  const startWorking = startHomeJobs.filter(job =>
    !startStoppedIds.has(job.id) &&
    !startReadyIds.has(job.id) &&
    !startIdentificationIds.has(job.id)
  );
  const startHomeSection = (title: string, list: Job[]) => list.length ? (
    <Section
      title={`${title} (${list.length})`}
      action={<Link href="/zeus/atendimentos" className="op-text-link">Ver todos <ArrowRight size={15} /></Link>}
    >
      {jobList(list.slice(0, 4))}
    </Section>
  ) : null;

  return <>
    {page === 'inicio' && <>
      <Title eyebrow={simpleFlow ? 'Resumo da oficina' : 'Bancada de trabalho'} title={simpleFlow ? 'Sua oficina hoje' : 'Hoje na oficina'} action={<>{simpleFlow && canViewJobs && <Link className="op-button secondary" href="/zeus/atendimentos">Ver atendimentos <ArrowRight size={16} /></Link>}{s.scheduleEnabled && operation.actionVisible('module:agendamentos') && canViewAppointments && <Link className="op-button secondary" href="/zeus/agendamentos"><CalendarDays size={17} />{canManageAppointments ? 'Agendar' : 'Ver agenda'}</Link>}{canCreateJobs && <Button onClick={() => setCreate('new')}><Plus size={18} />Novo atendimento</Button>}</>} />
      <div className="zeus-date-strip"><span>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>{canViewJobs && !simpleFlow && <SearchBox value={query} onChange={setQuery} placeholder={`Buscar ${identifierLabel.toLowerCase()}, cliente ou OS`} />}</div>
      {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && canViewAppointments && <Section title="Agendamentos de hoje" action={<Link href="/zeus/agendamentos" className="op-text-link">Ver semana <ArrowRight size={15} /></Link>}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === localDay() && appointment.status === 'Agendado'))}</Section>}
      {canViewJobs && simpleFlow ? <>
        {!startHomeJobs.length && <Empty icon={<Wrench size={28} />}>Nenhum atendimento em aberto. Use <strong>Novo atendimento</strong> para começar.</Empty>}
        {startHomeSection('Em identificação', startIdentification)}
        {startHomeSection('Em andamento', startWorking)}
        {startHomeSection('Parados', startStopped)}
        {startHomeSection('Prontos para entregar', startReady)}
      </> : <>
        {zeusViewHasFeature(s, 'checklist') && d.jobs.some(job => job.status === 'Aguardando checklist') && <Section title="Aguardando checklist">{jobList(searchedJobs.filter(job => job.status === 'Aguardando checklist'))}</Section>}
        {s.budgetEnabled && d.jobs.some(job => job.status === 'Aguardando aprovação') && <Section title="Aguardando aprovação">{jobList(searchedJobs.filter(job => job.status === 'Aguardando aprovação'))}</Section>}
        {d.jobs.some(job => job.status === 'Aguardando diagnóstico') && <Section title="Aguardando diagnóstico">{jobList(searchedJobs.filter(job => job.status === 'Aguardando diagnóstico'))}</Section>}
        {d.jobs.some(job => ['Aguardando peça', 'Pausado'].includes(job.status)) && <Section title="Parados / dependências">{jobList(searchedJobs.filter(job => ['Aguardando peça', 'Pausado'].includes(job.status)))}</Section>}
        <Section title="Em trabalho" action={<span className="op-muted">{d.jobs.filter(job => activeJob(job) && !['Aguardando checklist', 'Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status)).length} atendimentos</span>}>{jobList(searchedJobs.filter(job => activeJob(job) && !['Aguardando checklist', 'Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status)))}</Section>
      </>}
      {s.scheduleEnabled && operation.actionVisible('module:agendamentos') && canViewAppointments && <Section title="Próximos atendimentos">{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) > localDay() && appointment.status === 'Agendado').slice(0, 5))}</Section>}
      {!canViewJobs && !canViewAppointments && <Empty>Seu perfil não possui áreas operacionais liberadas no Zeus.</Empty>}
    </>}

    {(page === 'atendimentos' || page === 'historico') && <>
      <Title eyebrow={page === 'historico' ? 'Arquivo técnico' : 'Operação'} title={page === 'historico' ? 'Histórico de atendimentos' : 'Atendimentos'} action={<>{canExport && <Button variant="secondary" onClick={() => csv('atendimentos.csv', [['OS', identifierLabel, 'Cliente', operation.label('type', 'Tipo'), 'Etapa', 'Status', 'Abertura'], ...searchedJobs.filter(job => page === 'historico' ? !activeJob(job) : activeJob(job)).map(job => [job.number, findAsset(job.assetId)?.identifier, findCustomer(job.customerId), job.type, job.stage, job.status, date(job.createdAt)])])}><FileDown size={17} />Exportar</Button>}{page !== 'historico' && canCreateJobs && <Button onClick={() => setCreate('new')}><Plus size={18} />Novo atendimento</Button>}</>} />
      <ZeusFilterBar query={query} onQuery={setQuery} definitions={definitions} active={activeFilters} onActive={setActiveFilters} placeholder={hasResponsible ? `Buscar ${identifierLabel.toLowerCase()}, cliente, ${operation.label('technician', 'responsável').toLowerCase()} ou OS` : `Buscar ${identifierLabel.toLowerCase()}, cliente ou OS`} />
      {jobList(filteredJobs(searchedJobs.filter(job => page === 'historico' ? !activeJob(job) : activeJob(job))))}
    </>}

    {page === 'agendamentos' && <>
      <Title eyebrow="Agenda da oficina" title="Organize as próximas chegadas" action={canManageAppointments ? <Button onClick={() => setSchedule('new')}><Plus size={18} />Novo agendamento</Button> : undefined} />
      <div className="op-toolbar"><div className="op-actions"><Button variant="secondary" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() - (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronLeft size={17} /></Button><input type="date" value={day} onChange={change => setDay(change.target.value)} /><Button variant="secondary" onClick={() => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + (week ? 7 : 1)); setDay(localDay(value)); }}><ChevronRight size={17} /></Button><Button variant="secondary" onClick={() => setDay(localDay())}>Hoje</Button></div><div className="op-tabs"><button className={!week ? 'active' : ''} onClick={() => setWeek(false)}>Dia</button><button className={week ? 'active' : ''} onClick={() => setWeek(true)}>Semana</button></div></div>
      {week ? <div className="zeus-week">{Array.from({ length: 7 }, (_, index) => { const value = new Date(day + 'T12:00:00'); value.setDate(value.getDate() + index); const key = localDay(value); return <Section key={key} title={value.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === key))}</Section>; })}</div> : <Section title={date(day)}>{appointmentList(d.appointments.filter(appointment => appointment.at.slice(0, 10) === day))}</Section>}
    </>}

    {page === 'clientes' && <CustomerManager w={w} title={`Clientes e ${assetLabel.toLowerCase()}s`} onOpen={customer => <><Section title={`${assetLabel}s`} action={<Button variant="secondary" onClick={() => setAssetCustomer(customer.id)}><Plus size={16} />Adicionar</Button>}>{d.assets.filter(asset => asset.customerId === customer.id).map(asset => <div className="op-row" key={asset.id}><div className="op-grow"><strong className="op-identifier">{asset.identifier}</strong><span>{asset.model} · {asset.year || 'Ano não informado'}</span></div><Badge>{zeusJobsForAsset(d, asset.id, customer.id).length} OS</Badge></div>)}{!d.assets.some(asset => asset.customerId === customer.id) && <Empty>Nenhum cadastro associado.</Empty>}</Section><Section title="Histórico do cliente">{zeusJobsForCustomer(d, customer.id).map(job => <div className="op-row" key={job.id}><strong>OS {job.number}</strong><span>{job.type} · {date(job.createdAt)}</span><Badge>{job.status}</Badge></div>)}</Section></>} />}

    {create && <Modal title={`Identificação do ${assetLabel.toLowerCase()}`} wide onClose={() => setCreate(null)}><JobForm w={w} appointment={create === 'new' ? undefined : create} onClose={() => setCreate(null)} onCreated={id => { setCreate(null); setCreatedJobId(id); }} /></Modal>}
    {schedule && <Modal title={schedule === 'new' ? 'Novo agendamento' : 'Reagendar atendimento'} wide onClose={() => setSchedule(null)}><AppointmentForm w={w} appointment={schedule === 'new' ? undefined : schedule} onClose={() => setSchedule(null)} /></Modal>}
    {assetCustomer && <Modal title={`Cadastrar ${assetLabel.toLowerCase()}`} onClose={() => setAssetCustomer('')}><AssetForm w={w} customerId={assetCustomer} onClose={() => setAssetCustomer('')} /></Modal>}
    {createdJobId && <Modal title="OS aberta" onClose={() => setCreatedJobId('')}><div className="zeus-created-choice"><p>A OS foi aberta na etapa <strong>Identificação</strong> e está em <strong>{d.jobs.find(item => item.id === createdJobId)?.status || 'andamento'}</strong>.</p><div className="op-actions"><Button variant="secondary" onClick={() => { setCreatedJobId(''); router.push('/zeus'); }}>Voltar para tela inicial</Button>{canViewJobs && <Button onClick={() => { const id = createdJobId; setCreatedJobId(''); setSelected(id); }}>Ver ordem de serviço <ArrowRight size={16} /></Button>}</div></div></Modal>}
  </>;
}

function customFieldDefs(operation: ReturnType<typeof useOperationPreferences>, groups: string[]) {
  const helpMap = ((operation.preferences as typeof operation.preferences & { fieldHelp?: Record<string, string> }).fieldHelp || {});
  return operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => ({ name: `custom__${field.id}`, label: field.label, wide: true, help: helpMap[`custom:${field.id}`] }));
}
function customFromForm(operation: ReturnType<typeof useOperationPreferences>, groups: string[], form: Record<string, string>) {
  return Object.fromEntries(operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => [field.id, form[`custom__${field.id}`] || '']));
}

function JobForm({ w, appointment, onClose, onCreated }: { w: Workspace; appointment?: Appointment; onClose: () => void; onCreated: (id: string) => void }) {
  const operation = useOperationPreferences('zeus');
  const serviceTypes = useZeusServiceTypes();
  const checklistAllowed = zeusViewHasFeature(w.data.settings, 'checklist');
  const checklistConfig = readZeusChecklistConfig(w.data);
  const [search, setSearch] = useState('');
  const [assetId, setAssetId] = useState(appointment?.assetId || '');
  const [checklistFolder, setChecklistFolder] = useState<ZeusChecklistAssetFolder | ''>(checklistAllowed && checklistConfig.enabled ? checklistConfig.defaultAssetFolder : '');
  const [relatedJobId, setRelatedJobId] = useState('');
  const [warrantyReason, setWarrantyReason] = useState('');
  const s = w.data.settings;
  const identifierLabel = operation.label('identifier', s.identifierLabel || 'Identificação');
  const assetLabel = operation.label('asset', s.assetLabel || 'Item atendido');
  const asset = w.data.assets.find(item => item.id === assetId);
  const currentCustomer = asset ? w.data.customers.find(item => item.id === asset.customerId) : undefined;
  const suggestions = customerSuggestions(w.data);
  const customGroups = ['Cliente', 'Veículo / equipamento', 'Atendimento'];
  const results = !appointment && search.trim() ? w.data.assets.filter(item => matches(search, item.identifier, item.model, w.data.customers.find(customer => customer.id === item.customerId)?.name)).slice(0, 8) : [];
  const previousJobs = asset ? zeusJobsForAsset(w.data, asset.id, asset.customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20) : [];

  return <>
    {!appointment && <SearchBox value={search} onChange={value => { setSearch(value); if (assetId) { setAssetId(''); setRelatedJobId(''); setWarrantyReason(''); } }} placeholder={`Digite ${identifierLabel.toLowerCase()}, ${assetLabel.toLowerCase()} ou cliente`} />}
    {results.length > 0 && !asset && <div className="op-picker-results">{results.map(item => <button type="button" className="op-row" key={item.id} onClick={() => { setAssetId(item.id); setRelatedJobId(''); setWarrantyReason(''); }}><strong>{item.identifier}</strong><span>{item.model} · {w.data.customers.find(customer => customer.id === item.customerId)?.name}</span><ArrowRight size={16} /></button>)}</div>}
    {asset && <div className="op-callout"><strong>{asset.identifier} · {asset.model}</strong><span>{currentCustomer?.name}</span>{!appointment && <button type="button" className="op-text-link" onClick={() => { setAssetId(''); setSearch(''); setRelatedJobId(''); setWarrantyReason(''); }}>Trocar</button>}</div>}

    {checklistAllowed && <ZeusChecklistChoicePicker value={checklistFolder} onChange={setChecklistFolder} defaultFolder={checklistConfig.defaultAssetFolder} />}

    {asset && previousJobs.length > 0 && <div className="op-fields" style={{ marginBottom: 14 }}><label className="op-field"><span>OS relacionada — retorno / garantia (opcional)</span><select value={relatedJobId} onChange={event => setRelatedJobId(event.target.value)}><option value="">Nenhuma</option>{previousJobs.map(previous => <option value={previous.id} key={previous.id}>OS {String(previous.number).padStart(4, '0')} · {previous.type} · {date(previous.createdAt)}</option>)}</select><small>Use quando este atendimento for continuação, retorno ou garantia de uma OS anterior do mesmo veículo/equipamento.</small></label>{relatedJobId && <label className="op-field"><span>Motivo do retorno / garantia</span><textarea value={warrantyReason} onChange={event => setWarrantyReason(event.target.value)} placeholder="Ex.: retorno do serviço executado na OS anterior" /></label>}</div>}

    <RecordForm draftKey={`zeus-job:${appointment?.id || 'new'}`} fields={[
      ...(!asset ? [
        { name: 'customer', label: operation.label('customer', 'Cliente'), required: true, suggestions, hint: 'Digite o nome. Se existir, o Zeus reaproveita; se não existir, cria automaticamente.', configKey: 'customer' },
        { name: 'identifier', label: identifierLabel, required: true, value: search, configKey: 'identifier' },
        { name: 'model', label: assetLabel, required: true, configKey: 'asset' }
      ] : []),
      { name: 'type', label: operation.label('type', 'Tipo de atendimento'), value: appointment?.type || serviceTypes[0] || 'Atendimento', options: (serviceTypes.length ? serviceTypes : ['Atendimento']).map(value => ({ value, label: value })), configKey: 'type' },
      { name: 'complaint', label: operation.label('complaint', 'Relato do cliente'), value: appointment?.notes, type: 'textarea', wide: true, configKey: 'complaint', hint: 'Opcional. Você pode completar a ficha depois de abrir a OS.' }
    ]} submit="Abrir ordem de serviço" onClose={onClose} onSave={form => w.mutate(data => {
      let selectedAsset = assetId ? data.assets.find(item => item.id === assetId) : undefined;
      let cid = selectedAsset?.customerId || '';
      let aid = selectedAsset?.id || '';
      if (!selectedAsset) {
        const identifier = form.identifier.trim();
        const resolved = resolveCustomer(data, form.customer);
        cid = resolved.id;
        const exact = data.assets.find(item => assetKey(item.identifier) === assetKey(identifier));
        if (exact) {
          if (exact.customerId !== cid) throw new Error('Esta identificação já está vinculada a outro cliente. Selecione o cadastro existente ou informe outra identificação.');
          selectedAsset = exact;
          aid = exact.id;
        } else {
          aid = uid();
          data.assets.push({ id: aid, customerId: cid, identifier: identifier.toUpperCase(), model: form.model.trim(), year: '', meter: '' });
        }
      }
      const id = newJob(data, {
        assetId: aid,
        customerId: cid,
        type: form.type || appointment?.type || serviceTypes[0] || 'Atendimento',
        technician: appointment?.technician || '',
        due: '',
        complaint: form.complaint?.trim() || 'Não informado',
        diagnosis: '',
        notes: ''
      }, appointment?.id);
      const job = data.jobs.find(item => item.id === id)!;
      if (checklistAllowed) setZeusChecklistChoice(data, id, checklistFolder);
      job.status = checklistAllowed && checklistFolder ? 'Aguardando checklist' : initialJobStatus(data.settings);
      job.quote.validUntil = defaultQuoteValidity(data);
      job.events.push(event(`Situação: ${job.status}`));
      setCustomValues(data, id, {
        [ZEUS_RELATED_JOB_KEY]: relatedJobId,
        [ZEUS_WARRANTY_REASON_KEY]: warrantyReason.trim(),
      });
      if (relatedJobId) {
        const origin = data.jobs.find(item => item.id === relatedJobId);
        job.events.push(event(`Retorno/garantia vinculado à OS ${origin ? String(origin.number).padStart(4, '0') : relatedJobId}`));
      }
      onCreated(id);
    }, 'Ordem de serviço aberta.')} />
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
    <SearchBox value={search} onChange={value => { setSearch(value); if (assetId && !appointment) setAssetId(''); }} placeholder={`Digite ${operation.label('asset', w.data.settings.assetLabel || 'Item atendido').toLowerCase()}, identificação ou cliente`} />
    {results.length > 0 && <div className="op-picker-results">{results.map(item => <button type="button" className="op-row" key={item.id} onClick={() => setAssetId(item.id)}><strong>{item.identifier}</strong><span>{item.model} · {w.data.customers.find(current => current.id === item.customerId)?.name}</span></button>)}</div>}
    {asset && <div className="op-callout"><strong>{asset.identifier} · {asset.model}</strong><span>{customer?.name}</span>{!appointment && <button type="button" className="op-text-link" onClick={() => { setAssetId(''); setSearch(''); }}>Trocar</button>}</div>}
    <RecordForm draftKey={`zeus-appointment:${appointment?.id || 'new'}`} fields={[
      ...(!asset ? [
        { name: 'customer', label: operation.label('customer', 'Cliente'), required: true, suggestions, hint: 'Digite e continue. Um cliente novo é criado automaticamente se não existir.', configKey: 'customer' },
        { name: 'phone', label: operation.label('phone', 'Telefone'), type: 'tel', configKey: 'phone' },
        { name: 'identifier', label: operation.label('identifier', w.data.settings.identifierLabel || 'Identificação'), required: true, value: search, configKey: 'identifier' },
        { name: 'model', label: operation.label('asset', w.data.settings.assetLabel || 'Item atendido'), required: true, configKey: 'asset' }
      ] : []),
      { name: 'at', label: operation.label('scheduleDate', 'Data e horário'), type: 'datetime-local', required: true, value: appointment?.at, configKey: 'scheduleDate' },
      { name: 'type', label: operation.label('type', 'Tipo de atendimento'), value: appointment?.type, required: true, options: serviceTypes.map(value => ({ value, label: value })), configKey: 'type' },
      ...(operation.fieldVisible('technician') ? [{ name: 'technician', label: operation.label('technician', 'Responsável'), value: appointment?.technician, configKey: 'technician' }] : []),
      { name: 'notes', label: operation.label('internalNotes', 'Observações'), type: 'textarea', wide: true, value: appointment?.notes, configKey: 'internalNotes' }
    ]} onClose={onClose} onSave={form => w.mutate(data => {
      let selectedAsset = assetId ? data.assets.find(item => item.id === assetId) : undefined;
      if (!selectedAsset) {
        const resolved = resolveCustomer(data, form.customer, { phone: form.phone });
        const exact = data.assets.find(item => assetKey(item.identifier) === assetKey(form.identifier));
        if (exact) {
          if (exact.customerId !== resolved.id) throw new Error('Esta identificação já está vinculada a outro cliente. Selecione o cadastro existente ou informe outra identificação.');
          selectedAsset = exact;
        } else {
          selectedAsset = { id: uid(), customerId: resolved.id, identifier: form.identifier.trim().toUpperCase(), model: form.model.trim(), year: '', meter: '' };
          data.assets.push(selectedAsset);
        }
      }
      const next: Appointment = { id: appointment?.id || uid(), customerId: selectedAsset.customerId, assetId: selectedAsset.id, at: form.at, type: form.type, technician: operation.fieldVisible('technician') ? (form.technician || '') : '', notes: form.notes || '', status: 'Agendado' };
      const index = data.appointments.findIndex(item => item.id === next.id);
      if (index < 0) data.appointments.push(next); else data.appointments[index] = next;
    }, 'Agendamento salvo.')} />
  </>;
}

function AssetForm({ w, customerId, onClose }: { w: Workspace; customerId: string; onClose: () => void }) {
  const operation = useOperationPreferences('zeus');
  const s = w.data.settings;
  const identifierLabel = operation.label('identifier', s.identifierLabel || 'Identificação');
  const assetLabel = operation.label('asset', s.assetLabel || 'Item atendido');
  const meterLabel = operation.label('meter', s.meterLabel || 'Medição');
  return <RecordForm draftKey={`zeus-asset:${customerId}:new`} fields={[{ name: 'identifier', label: identifierLabel, required: true, configKey: 'identifier' }, { name: 'model', label: assetLabel, required: true, configKey: 'asset' }, { name: 'year', label: operation.label('year', 'Ano'), configKey: 'year' }, { name: 'meter', label: meterLabel, configKey: 'meter' }]} onClose={onClose} onSave={form => w.mutate(data => { if (data.assets.some(asset => assetKey(asset.identifier) === assetKey(form.identifier))) throw new Error('Esta identificação já está cadastrada.'); data.assets.push({ id: uid(), customerId, identifier: form.identifier, model: form.model, year: form.year || '', meter: form.meter || '' } as Asset); })} />;
}