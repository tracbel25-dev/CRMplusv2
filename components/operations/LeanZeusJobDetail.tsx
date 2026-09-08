'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileDown, Plus, X } from 'lucide-react';
import {
  Job, activeJob, advanceJob, customValues, date, effectiveQuoteStatus,
  event, money, setCustomValues, stages, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace } from '@/lib/operations/storage';
import {
  Badge, Button, Confirm, Empty, Modal, QuotePanel, RecordForm,
  Section, Timeline, Title
} from './ui';

type EditMode = 'Ficha' | 'Diagnóstico' | 'Execução' | null;

export function LeanZeusJobDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  const router = useRouter();
  const operation = useOperationPreferences('zeus');
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [finish, setFinish] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [report, setReport] = useState(false);
  const [finalNote, setFinalNote] = useState(false);
  const d = w.data;
  const s = d.settings;
  const job = d.jobs.find(item => item.id === recordId);

  if (!job) return <>
    <Button variant="text" onClick={() => router.push('/zeus/atendimentos')}><ArrowLeft size={17} />Voltar aos atendimentos</Button>
    <Empty>Esta ordem de serviço não foi encontrada.</Empty>
  </>;

  const asset = d.assets.find(item => item.id === job.assetId);
  const customer = d.customers.find(item => item.id === job.customerId);
  if (!asset || !customer) return <Empty>Os dados vinculados a esta ordem de serviço estão incompletos.</Empty>;

  const flow = stages(s);
  const stageIndex = Math.max(0, flow.indexOf(job.stage));
  const nextStage = flow[stageIndex + 1];
  const quoteStatus = effectiveQuoteStatus(job.quote);
  const pendingTasks = job.tasks.filter(item => !item.done);
  const active = activeJob(job);
  const patch = (fn: (current: Job) => void, message?: string) => w.mutate(data => fn(data.jobs.find(item => item.id === job.id)!), message);

  const customerCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Cliente');
  const assetCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Veículo / equipamento');
  const jobCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Atendimento');
  const combinedCustom = [
    ...customerCustom.map(field => ({ field, target: customer.id })),
    ...assetCustom.map(field => ({ field, target: asset.id })),
    ...jobCustom.map(field => ({ field, target: job.id }))
  ];

  const blockedByDiagnosis = job.stage === 'Diagnóstico' && !job.diagnosis.trim();
  const blockedByBudget = job.stage === 'Orçamento' && quoteStatus !== 'Aprovado';
  const blockedByExecution = job.stage === 'Execução' && pendingTasks.length > 0;

  const nowLabel = blockedByDiagnosis ? 'Registrar o diagnóstico antes de seguir'
    : blockedByBudget ? (quoteStatus === 'Expirado' ? 'Revisar o orçamento vencido' : 'Resolver a decisão do orçamento')
      : blockedByExecution ? `Concluir ${pendingTasks.length} serviço(s) pendente(s)`
        : job.stage === 'Entrega' ? 'Entregar e encerrar esta OS'
          : nextStage ? `Levar esta OS para ${nextStage}` : 'Atendimento concluído';

  const workTitle = job.stage === 'Ficha' ? 'Entender o atendimento'
    : job.stage === 'Diagnóstico' ? 'Diagnóstico técnico'
      : job.stage === 'Orçamento' ? 'Serviços, peças e decisão'
        : job.stage === 'Execução' ? 'Executar o serviço'
          : job.stage === 'Conferência' ? 'Conferir antes da entrega'
            : job.stage === 'Entrega' ? 'Entregar ao cliente'
              : job.stage;

  const advance = async () => {
    if (!active) return;
    if (blockedByDiagnosis) { setEditMode('Diagnóstico'); return; }
    if (blockedByBudget || blockedByExecution) {
      document.getElementById('zeus-current-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (job.stage === 'Entrega') { setFinish(true); return; }
    await w.mutate(data => advanceJob(data, job.id, job.stage), nextStage ? `OS avançou para ${nextStage}.` : 'Etapa atualizada.');
  };

  const primaryAction = active && (blockedByDiagnosis || blockedByBudget || blockedByExecution || nextStage || job.stage === 'Entrega');
  const primaryButtonLabel = blockedByDiagnosis ? 'Registrar diagnóstico e avançar'
    : blockedByBudget ? 'Resolver orçamento abaixo'
      : blockedByExecution ? 'Ver serviços pendentes'
        : job.stage === 'Entrega' ? 'Registrar entrega e encerrar'
          : nextStage ? `Avançar para ${nextStage}` : '';

  return <>
    <Button variant="text" onClick={() => router.push('/zeus/atendimentos')}><ArrowLeft size={17} />Voltar aos atendimentos</Button>
    <Title
      eyebrow={`OS ${String(job.number).padStart(4, '0')} · ${job.type}`}
      title={asset.identifier}
      action={operation.actionVisible('report') ? <Button variant="secondary" onClick={() => setReport(true)}><FileDown size={16} />Relatório</Button> : undefined}
    >
      {customer.name} · {asset.model}{job.technician && ` · ${job.technician}`}
    </Title>

    <div className="zeus-stage-rail" aria-label="Fluxo da ordem de serviço">
      {flow.map((stage, index) => <span key={stage} className={index < stageIndex ? 'done' : index === stageIndex ? 'current' : ''}>{String(index + 1).padStart(2, '0')} · {stage}</span>)}
    </div>

    <div className="zeus-workbench" style={{ marginTop: 18 }}>
      <main className="zeus-now" id="zeus-current-work">
        <div className="zeus-now-head">
          <div><span>Trabalho atual</span><strong>{workTitle}</strong><small>{nowLabel}</small></div>
          <Badge tone={['Aguardando aprovação', 'Aguardando peça', 'Pausado'].includes(job.status) ? 'warning' : ''}>{job.status}</Badge>
        </div>

        {primaryAction && <div className="zeus-primary-action">
          <div><span>Agora</span><strong>{nowLabel}</strong></div>
          {primaryButtonLabel && <Button onClick={() => { void advance(); }}>{primaryButtonLabel}</Button>}
        </div>}

        {job.stage === 'Ficha' && <>
          <Section title={operation.label('complaint', 'Relato do cliente')} action={active ? <Button variant="secondary" onClick={() => setEditMode('Ficha')}>Editar ficha</Button> : undefined}>
            <p className="op-prewrap">{job.complaint}</p>
            {operation.fieldVisible('internalNotes') && job.notes && <><h3>{operation.label('internalNotes', 'Observações internas')}</h3><p className="op-prewrap">{job.notes}</p></>}
          </Section>
        </>}

        {job.stage === 'Diagnóstico' && <Section title={operation.label('diagnosis', 'Diagnóstico')} action={active && job.diagnosis ? <Button variant="secondary" onClick={() => setEditMode('Diagnóstico')}>Editar diagnóstico</Button> : undefined}>
          {job.diagnosis ? <p className="op-prewrap">{job.diagnosis}</p> : <Empty>Registre sintomas, causa identificada e solução recomendada. Ao salvar, a OS segue para a próxima etapa.</Empty>}
        </Section>}

        {job.stage === 'Orçamento' && <Section title="Orçamento desta OS">
          {active ? <QuotePanel w={w} quote={job.quote} jobId={job.id} /> : <><Badge>{quoteStatus}</Badge><p>Orçamento preservado no histórico.</p></>}
        </Section>}

        {job.stage === 'Execução' && <Section title="Serviços em execução" action={active ? <Button variant="secondary" onClick={() => setEditMode('Execução')}><Plus size={16} />Adicionar tarefa / atualização</Button> : undefined}>
          {job.tasks.map(task => <label className="op-check-row" key={task.id}>
            <input type="checkbox" checked={!!task.done} disabled={!active || job.stage !== 'Execução'} onChange={change => patch(current => {
              if (current.stage !== 'Execução') throw new Error('A etapa de execução não está ativa.');
              const line = current.tasks.find(item => item.id === task.id)!;
              line.done = change.target.checked;
              current.events.push(event(`${line.done ? 'Concluído' : 'Reaberto'}: ${line.description}`));
            })} />
            <strong>{task.description}</strong><Badge>{task.done ? 'Concluído' : 'Pendente'}</Badge>
          </label>)}
          {!job.tasks.length && <Empty>Adicione as tarefas reais desta execução.</Empty>}
        </Section>}

        {['Conferência', 'Entrega'].includes(job.stage) && <Section title={job.stage === 'Conferência' ? 'Conferência final' : 'Entrega'}>
          <div className="op-detail-pairs">
            <div><span>Serviços concluídos</span><strong>{job.tasks.filter(item => item.done).length} de {job.tasks.length}</strong></div>
            <div><span>Situação</span><strong>{job.status}</strong></div>
            <div><span>Peças registradas</span><strong>{job.quote.lines.filter(line => line.kind === 'Peça').length}</strong></div>
            <div><span>Orçamento</span><strong>{s.budgetEnabled ? quoteStatus : 'Não utilizado'}</strong></div>
          </div>
          {active && <Button variant="secondary" onClick={() => setFinalNote(true)}>Registrar observação final</Button>}
        </Section>}

        {!active && <Section title="Atendimento encerrado"><Badge>{job.status}</Badge><p>O trabalho desta OS foi preservado. Consulte os detalhes e o histórico abaixo quando necessário.</p></Section>}

        <div className="zeus-support">
          <details>
            <summary>Ficha completa do atendimento</summary>
            <div>
              <div className="op-detail-pairs">
                <div><span>{operation.label('customerName', 'Cliente')}</span><strong>{customer.name}</strong>{operation.fieldVisible('customerPhone') && <small>{customer.phone || 'Sem telefone'}</small>}</div>
                <div><span>{s.assetLabel}</span><strong>{asset.model} {operation.fieldVisible('year') && asset.year}</strong>{operation.fieldVisible('meter') && <small>{s.meterLabel}: {asset.meter || 'Não informado'}</small>}</div>
                {operation.fieldVisible('technician') && <div><span>{operation.label('technician', 'Responsável')}</span><strong>{job.technician || 'Não definido'}</strong></div>}
                {operation.fieldVisible('due') && <div><span>{operation.label('due', 'Prazo')}</span><strong>{job.due ? date(job.due, true) : 'Não definido'}</strong></div>}
                {combinedCustom.map(({ field, target }) => <div key={`${target}-${field.id}`}><span>{field.label}</span><strong>{customValues(d, target)[field.id] || 'Não informado'}</strong></div>)}
              </div>
              <h3>{operation.label('complaint', 'Relato do cliente')}</h3><p className="op-prewrap">{job.complaint}</p>
              {job.diagnosis && <><h3>{operation.label('diagnosis', 'Diagnóstico')}</h3><p className="op-prewrap">{job.diagnosis}</p></>}
              {active && <Button variant="secondary" onClick={() => setEditMode('Ficha')}>Editar ficha</Button>}
            </div>
          </details>

          {operation.actionVisible('attachments') && <details>
            <summary>Fotos e evidências ({job.attachments.length})</summary>
            <div>
              {active && <label className="op-button secondary">Adicionar foto<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={input => {
                const file = input.target.files?.[0]; if (!file) return;
                if (file.size > 750000) { w.setError('Escolha uma foto de até 750 KB nesta versão local.'); return; }
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { w.setError('Use uma imagem JPEG, PNG ou WebP.'); return; }
                const reader = new FileReader();
                reader.onload = () => patch(current => { current.attachments.push({ id: uid(), name: file.name, data: String(reader.result) }); current.events.push(event(`Foto anexada: ${file.name}`)); });
                reader.readAsDataURL(file); input.target.value = '';
              }} /></label>}
              <div className="op-photos" style={{ marginTop: 14 }}>{job.attachments.map(photo => <figure key={photo.id}><img src={photo.data} alt={photo.name} /><figcaption>{photo.name}</figcaption>{active && <button className="op-icon" aria-label={`Remover ${photo.name}`} onClick={() => patch(current => { current.attachments = current.attachments.filter(item => item.id !== photo.id); })}><X size={16} /></button>}</figure>)}</div>
              {!job.attachments.length && <Empty>Nenhuma evidência anexada.</Empty>}
            </div>
          </details>}

          <details>
            <summary>Histórico da OS</summary>
            <div><Timeline events={[...job.events, ...job.quote.events].sort((a, b) => a.at.localeCompare(b.at))} /></div>
          </details>
        </div>
      </main>

      <aside className="zeus-context-stack">
        <div className="zeus-context-card"><span>{s.assetLabel}</span><strong>{asset.identifier}</strong><small>{asset.model}{asset.year ? ` · ${asset.year}` : ''}</small></div>
        <div className="zeus-context-card"><span>Cliente</span><strong>{customer.name}</strong><small>{customer.phone || 'Sem telefone cadastrado'}</small></div>
        {operation.fieldVisible('technician') && <div className="zeus-context-card"><span>Responsável</span><strong>{job.technician || 'Não definido'}</strong></div>}
        {operation.fieldVisible('due') && <div className="zeus-context-card"><span>Prazo</span><strong>{job.due ? date(job.due, true) : 'Não definido'}</strong></div>}
        {active && operation.actionVisible('manualStatus') && <div className="zeus-context-card"><span>Situação operacional</span><select aria-label="Situação do atendimento" value={job.status} disabled={job.status === 'Aguardando aprovação'} onChange={change => patch(current => { current.status = change.target.value; current.events.push(event(`Situação: ${current.status}`)); })}>{Array.from(new Set([job.status, 'Em andamento', 'Aguardando peça', 'Pausado'])).map(value => <option key={value}>{value}</option>)}</select></div>}
        <div className="zeus-context-card"><span>Resumo</span><strong>{job.tasks.filter(item => item.done).length}/{job.tasks.length} serviços</strong><small>{job.quote.lines.filter(line => line.kind === 'Peça').length} peça(s) registrada(s)</small></div>
      </aside>
    </div>

    {active && operation.actionVisible('cancel') && <div className="op-record-secondary-actions"><Button variant="danger" onClick={() => setCancel(true)}>Cancelar OS</Button></div>}

    {editMode && <Modal title={editMode === 'Diagnóstico' ? 'Diagnóstico técnico' : editMode === 'Execução' ? 'Atualizar execução' : 'Editar atendimento'} onClose={() => setEditMode(null)}>
      <RecordForm
        draftKey={`zeus-lean-edit:${job.id}:${editMode}`}
        fields={editMode === 'Diagnóstico'
          ? [{ name: 'diagnosis', label: operation.label('diagnosis', 'Diagnóstico'), type: 'textarea', required: true, wide: true, value: job.diagnosis }]
          : editMode === 'Execução'
            ? [{ name: 'task', label: 'Nova tarefa de execução', wide: true }, { name: 'update', label: 'Atualização', type: 'textarea', wide: true }]
            : [
              ...(operation.fieldVisible('technician') ? [{ name: 'technician', label: operation.label('technician', 'Responsável'), value: job.technician }] : []),
              ...(operation.fieldVisible('due') ? [{ name: 'due', label: operation.label('due', 'Prazo'), type: 'datetime-local', value: job.due }] : []),
              { name: 'complaint', label: operation.label('complaint', 'Relato'), type: 'textarea', wide: true, required: true, value: job.complaint },
              ...(operation.fieldVisible('internalNotes') ? [{ name: 'notes', label: operation.label('internalNotes', 'Observações internas'), type: 'textarea', wide: true, value: job.notes }] : []),
              ...customerCustom.map(field => ({ name: `customer__${field.id}`, label: field.label, wide: true, value: customValues(d, customer.id)[field.id] || '' })),
              ...assetCustom.map(field => ({ name: `asset__${field.id}`, label: field.label, wide: true, value: customValues(d, asset.id)[field.id] || '' })),
              ...jobCustom.map(field => ({ name: `job__${field.id}`, label: field.label, wide: true, value: customValues(d, job.id)[field.id] || '' }))
            ]}
        submit={editMode === 'Diagnóstico' && job.stage === 'Diagnóstico' ? 'Salvar diagnóstico e avançar' : 'Salvar'}
        onClose={() => setEditMode(null)}
        onSave={form => w.mutate(data => {
          const current = data.jobs.find(item => item.id === job.id)!;
          if (editMode === 'Execução') {
            if (form.task?.trim()) { current.tasks.push({ id: uid(), description: form.task.trim(), done: false }); current.events.push(event(`Tarefa adicionada: ${form.task.trim()}`)); }
            if (form.update?.trim()) current.events.push(event(form.update.trim()));
          } else if (editMode === 'Diagnóstico') {
            current.diagnosis = form.diagnosis;
            current.events.push(event('Diagnóstico atualizado'));
            if (current.stage === 'Diagnóstico') advanceJob(data, current.id, 'Diagnóstico');
          } else {
            if (form.technician !== undefined) current.technician = form.technician;
            if (form.due !== undefined) current.due = form.due;
            current.complaint = form.complaint;
            if (form.notes !== undefined) current.notes = form.notes;
            setCustomValues(data, customer.id, Object.fromEntries(customerCustom.map(field => [field.id, form[`customer__${field.id}`] ?? customValues(data, customer.id)[field.id] ?? ''])));
            setCustomValues(data, asset.id, Object.fromEntries(assetCustom.map(field => [field.id, form[`asset__${field.id}`] ?? customValues(data, asset.id)[field.id] ?? ''])));
            setCustomValues(data, job.id, Object.fromEntries(jobCustom.map(field => [field.id, form[`job__${field.id}`] ?? customValues(data, job.id)[field.id] ?? ''])));
            current.events.push(event('Ficha atualizada'));
          }
        }, editMode === 'Diagnóstico' && job.stage === 'Diagnóstico' ? 'Diagnóstico salvo e OS avançada.' : 'Atendimento atualizado.')}
      />
    </Modal>}

    {finalNote && <Modal title="Observação final" onClose={() => setFinalNote(false)}><RecordForm draftKey={`zeus-final:${job.id}`} fields={[{ name: 'note', label: operation.label('finalNotes', 'Observação final'), type: 'textarea', required: true, wide: true }]} onClose={() => setFinalNote(false)} onSave={form => patch(current => { current.events.push(event(`Observação final: ${form.note}`)); }, 'Observação final registrada.')} /></Modal>}
    {finish && <Confirm title="Confirmar entrega e encerramento?" onClose={() => setFinish(false)} onConfirm={() => w.mutate(data => advanceJob(data, job.id, job.stage), 'Atendimento encerrado e enviado ao histórico.')}>A OS será preservada no histórico com todas as movimentações.</Confirm>}
    {cancel && <Modal title="Cancelar ordem de serviço" onClose={() => setCancel(false)}><RecordForm fields={[{ name: 'reason', label: 'Motivo do cancelamento', type: 'textarea', wide: true, required: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={form => patch(current => { current.status = 'Cancelado'; current.events.push(event(`Cancelado: ${form.reason}`)); })} /></Modal>}
    {report && <Modal title="Relatório do atendimento" wide onClose={() => setReport(false)}><div className="op-print-document"><span className="op-kicker">{s.business || 'Oficina'}</span><h2>Relatório · OS {job.number}</h2><p>{s.phone} {s.email}</p><div className="op-detail-pairs"><div><span>Cliente</span><strong>{customer.name}</strong></div><div><span>{s.identifierLabel}</span><strong>{asset.identifier} · {asset.model}</strong></div><div><span>Abertura</span><strong>{date(job.createdAt, true)}</strong></div><div><span>Situação</span><strong>{job.status}</strong></div></div><h3>Relato</h3><p>{job.complaint}</p><h3>Diagnóstico</h3><p>{job.diagnosis || 'Não registrado'}</p><h3>Serviços realizados</h3>{job.tasks.length ? job.tasks.map(task => <div className="op-row" key={task.id}><span className="op-grow">{task.description}</span><Badge>{task.done ? 'Concluído' : 'Pendente'}</Badge></div>) : <p>Sem tarefas de execução registradas.</p>}<h3>Peças registradas</h3>{job.quote.lines.filter(line => line.kind === 'Peça').length ? job.quote.lines.filter(line => line.kind === 'Peça').map(line => <div className="op-row" key={line.id}><span className="op-grow">{line.description}{line.brand ? ` · ${line.brand}` : ''}</span><span>{line.quantity} × {money(line.price)}</span></div>) : <p>Sem peças registradas.</p>}</div><div className="op-form-footer"><Button onClick={() => window.print()}>Imprimir / salvar PDF</Button></div></Modal>}
  </>;
}
