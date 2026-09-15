'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, FileDown, Plus, Sparkles, X } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { deleteOperationalFile, R2AuthRequiredError, uploadOperationalFile } from '@/lib/r2/client';
import {
  Job, activeJob, advanceJob, customValues, date, effectiveQuoteStatus,
  event, money, setCustomValues, stages, total, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace } from '@/lib/operations/storage';
import { Badge, Button, Confirm, Empty, Modal, RecordForm, Section, Timeline, Title } from './ui';
import { ZeusQuotePanel } from './ZeusQuotePanel';
import { OperationalR2Image, r2KeyFromStoredData } from './OperationalR2Image';
import { ZeusStageAssistant } from './ZeusStageAssistant';

type EditMode = 'Ficha' | 'Execução' | null;
type AISuggestion = { title: string; reason: string; category: string };

function DiagnosisEditor({ w, job, assetLabel, onClose }: { w: Workspace; job: Job; assetLabel: string; onClose: () => void }) {
  const asset = w.data.assets.find(item => item.id === job.assetId);
  const [value, setValue] = useState(job.diagnosis);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInteractionId, setAiInteractionId] = useState('');
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [usedAI, setUsedAI] = useState(false);

  const assist = async () => {
    setAiBusy(true);
    try {
      const supabase = createStoreClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Entre com a conta da empresa para usar as sugestões da IA.');
      const response = await fetch('/api/zeus/diagnostico', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          complaint: job.complaint,
          currentDiagnosis: value,
          asset: `${asset?.identifier || ''} ${asset?.model || ''} ${asset?.year || ''} ${assetLabel}: ${asset?.meter || ''}`,
          serviceType: job.type,
          notes: job.notes
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar sugestões.');
      setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
      setAiInteractionId(String(payload.interactionId || ''));
      w.setNotice('Sugestões preparadas. Nada foi preenchido automaticamente.');
    } catch (reason) { w.setError(reason instanceof Error ? reason.message : 'Não foi possível usar a assistência do diagnóstico.'); }
    finally { setAiBusy(false); }
  };

  const applySuggestion = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion?.title.trim()) return;
    const line = `- ${suggestion.title.trim()}`;
    setValue(current => current.trim() ? `${current.trim()}\n${line}` : line);
    setUsedAI(true);
  };

  const save = async () => {
    const savedValue = value.trim();
    if (!savedValue) { w.setError('Registre o diagnóstico antes de salvar.'); return; }
    setBusy(true);
    const ok = await w.mutate(data => {
      const current = data.jobs.find(item => item.id === job.id)!;
      current.diagnosis = savedValue;
      current.events.push(event('Diagnóstico atualizado'));
    }, 'Diagnóstico salvo.');

    if (ok && aiInteractionId && usedAI) {
      const learn = window.confirm('Usar este diagnóstico confirmado para melhorar as próximas sugestões do Zeus nesta oficina?');
      if (learn) {
        try {
          const supabase = createStoreClient();
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) throw new Error('Sua sessão expirou antes de registrar o aprendizado.');
          const response = await fetch('/api/ai/zeus/feedback', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ interactionId: aiInteractionId, correctedText: savedValue }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Não foi possível registrar o aprendizado.');
          if (payload.learned) w.setNotice('Aprendizado salvo para melhorar sugestões futuras desta oficina.');
        } catch (reason) {
          w.setError(reason instanceof Error ? reason.message : 'O diagnóstico foi salvo, mas o aprendizado não pôde ser registrado.');
        }
      }
    }

    setBusy(false);
    if (ok) onClose();
  };

  return <Modal title="Diagnóstico técnico" onClose={onClose} wide>
    <div className="zeus-diagnosis-editor">
      <div className="op-callout"><strong>IA como apoio</strong><span> Ela sugere verificações e possibilidades. Você escolhe o que faz sentido, edita e decide o que entra no diagnóstico.</span></div>
      <label className="op-field"><span>Diagnóstico registrado pelo profissional</span><textarea rows={9} value={value} onChange={event => setValue(event.target.value)} placeholder="Registre aqui apenas o que foi observado, verificado ou concluído pela oficina." /></label>
      {suggestions.length > 0 && <div className="zeus-ai-suggestions"><strong>Sugestões para avaliar</strong>{suggestions.map((item, index) => <div className="zeus-ai-suggestion" key={`${item.title}-${index}`}><div className="op-grow"><Badge>{item.category}</Badge><input aria-label={`Editar sugestão ${index + 1}`} value={item.title} onChange={event => setSuggestions(current => current.map((row, i) => i === index ? { ...row, title: event.target.value } : row))} /><small>{item.reason}</small></div><Button variant="secondary" onClick={() => applySuggestion(index)}>Adicionar ao diagnóstico</Button></div>)}</div>}
      <div className="op-form-footer"><Button variant="secondary" disabled={aiBusy || busy} onClick={() => { void assist(); }}><Sparkles size={16} />{aiBusy ? 'Buscando sugestões…' : suggestions.length ? 'Atualizar sugestões' : 'Ver sugestões da IA'}</Button><Button disabled={busy || aiBusy} onClick={() => { void save(); }}>{busy ? 'Salvando…' : 'Salvar diagnóstico'}</Button></div>
    </div>
  </Modal>;
}

export function LeanZeusJobDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  const router = useRouter();
  const operation = useOperationPreferences('zeus');
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [finish, setFinish] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [report, setReport] = useState(false);
  const [finalNote, setFinalNote] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const d = w.data;
  const s = d.settings;
  const job = d.jobs.find(item => item.id === recordId);

  if (!job) return <><Button variant="text" onClick={() => router.push('/zeus/atendimentos')}><ArrowLeft size={17} />Voltar aos atendimentos</Button><Empty>Esta ordem de serviço não foi encontrada.</Empty></>;
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
  const label = (key: string, fallback: string) => operation.label(key, fallback);

  const customerCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Cliente');
  const assetCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Veículo / equipamento');
  const jobCustom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Atendimento');
  const combinedCustom = [...customerCustom.map(field => ({ field, target: customer.id })), ...assetCustom.map(field => ({ field, target: asset.id })), ...jobCustom.map(field => ({ field, target: job.id }))];

  const blockedByDiagnosis = job.stage === 'Diagnóstico' && !job.diagnosis.trim();
  const blockedByBudget = job.stage === 'Orçamento' && quoteStatus !== 'Aprovado';
  const blockedByExecution = job.stage === 'Execução' && pendingTasks.length > 0;
  const workTitle = job.stage === 'Identificação' ? 'Identificação concluída'
    : job.stage === 'Diagnóstico' ? label('diagnosis', 'Diagnóstico técnico')
      : job.stage === 'Orçamento' ? 'Serviços, peças e decisão'
        : job.stage === 'Execução' ? 'Executar o serviço'
          : job.stage === 'Conferência' ? 'Conferir antes da entrega'
            : job.stage === 'Entrega' ? 'Entregar ao cliente' : job.stage;

  const nowLabel = job.stage === 'Identificação' ? (nextStage ? `Aguardando iniciar ${nextStage.toLowerCase()}` : 'Identificação concluída')
    : blockedByDiagnosis ? 'Registrar o diagnóstico antes de seguir'
      : blockedByExecution ? `Concluir ${pendingTasks.length} serviço(s) pendente(s)`
        : job.stage === 'Entrega' ? 'Entregar e encerrar esta OS'
          : nextStage ? `Levar esta OS para ${nextStage}` : 'Atendimento concluído';

  const advance = async () => {
    if (!active) return;
    if (blockedByDiagnosis) { setDiagnosisOpen(true); return; }
    if (blockedByBudget) return;
    if (blockedByExecution) { document.getElementById('zeus-current-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (job.stage === 'Entrega') { setFinish(true); return; }
    await w.mutate(data => advanceJob(data, job.id, job.stage), nextStage ? `OS avançou para ${nextStage}.` : 'Etapa atualizada.');
  };

  const primaryButtonLabel = job.stage === 'Identificação' ? (nextStage === 'Diagnóstico' ? 'Iniciar diagnóstico' : nextStage ? `Avançar para ${nextStage}` : '')
    : blockedByDiagnosis ? 'Registrar diagnóstico'
      : blockedByExecution ? 'Ver serviços pendentes'
        : job.stage === 'Entrega' ? 'Registrar entrega e encerrar'
          : nextStage ? `Avançar para ${nextStage}` : '';
  const showPrimary = active && job.stage !== 'Orçamento' && !!primaryButtonLabel;

  const savePhotoLocally = async (file: File) => {
    if (file.size > 750000) throw new Error('Sem login, escolha uma foto de até 750 KB para salvar somente neste navegador.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler esta foto.'));
      reader.readAsDataURL(file);
    });
    await patch(current => {
      current.attachments.push({ id: uid(), name: file.name, data: dataUrl });
      current.events.push(event(`Foto anexada localmente: ${file.name}`));
    }, 'Foto salva neste navegador.');
  };

  const addPhoto = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { w.setError('Escolha uma foto de até 8 MB.'); return; }
    setPhotoBusy(true);
    try {
      try {
        const uploaded = await uploadOperationalFile('zeus', file);
        await patch(current => {
          current.attachments.push({ id: uid(), name: file.name, data: `r2:${uploaded.key}|${uploaded.url}` });
          current.events.push(event(`Foto enviada ao R2: ${file.name}`));
        }, 'Foto enviada e vinculada à OS.');
      } catch (reason) {
        if (!(reason instanceof R2AuthRequiredError)) throw reason;
        await savePhotoLocally(file);
        w.setNotice('Foto salva somente neste navegador. Entre com a conta para usar o armazenamento em nuvem.');
      }
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível anexar a foto.');
    } finally { setPhotoBusy(false); }
  };

  const removePhoto = async (photo: Job['attachments'][number]) => {
    const r2Key = r2KeyFromStoredData(photo.data);
    try {
      if (r2Key) await deleteOperationalFile('zeus', r2Key);
      await patch(current => {
        current.attachments = current.attachments.filter(item => item.id !== photo.id);
        current.events.push(event(`Foto removida: ${photo.name}`));
      }, 'Foto removida.');
    } catch (reason) { w.setError(reason instanceof Error ? reason.message : 'Não foi possível remover a foto.'); }
  };

  const toggleExecutionTask = async (taskId: string) => {
    if (!active || job.stage !== 'Execução') return;
    await patch(current => {
      const line = current.tasks.find(item => item.id === taskId);
      if (!line) throw new Error('Serviço não encontrado nesta OS.');
      line.done = !line.done;
      current.events.push(event(`${line.done ? 'Concluído' : 'Reaberto'}: ${line.description}`));
    }, 'Execução atualizada.');
  };

  let reportTotal = 0;
  try { reportTotal = total(job.quote.lines, job.quote.discount); } catch { reportTotal = 0; }

  return <>
    <Button variant="text" onClick={() => router.push('/zeus/atendimentos')}><ArrowLeft size={17} />Voltar aos atendimentos</Button>
    <Title eyebrow={`OS ${String(job.number).padStart(4, '0')} · ${job.type}`} title={asset.identifier} action={operation.actionVisible('report') ? <Button variant="secondary" onClick={() => setReport(true)}><FileDown size={16} />Relatório</Button> : undefined}>{customer.name} · {asset.model}{job.technician && ` · ${job.technician}`}</Title>

    <div className="zeus-stage-rail" aria-label="Fluxo da ordem de serviço">{flow.map((stage, index) => <span key={stage} className={index < stageIndex ? 'done' : index === stageIndex ? 'current' : ''}>{String(index + 1).padStart(2, '0')} · {stage}</span>)}</div>

    <div className="zeus-workbench" style={{ marginTop: 18 }}>
      <main className="zeus-now" id="zeus-current-work">
        <div className="zeus-now-head"><div><span>Trabalho atual</span><strong>{workTitle}</strong><small>{job.stage === 'Orçamento' ? 'Monte, salve e compartilhe quando estiver pronto.' : nowLabel}</small></div><div className="op-actions">{active && <ZeusStageAssistant w={w} job={job} />}<Badge tone={['Aguardando aprovação', 'Aguardando diagnóstico', 'Aguardando peça', 'Pausado'].includes(job.status) ? 'warning' : ''}>{job.status}</Badge></div></div>

        {showPrimary && <div className="zeus-primary-action"><div><span>Agora</span><strong>{nowLabel}</strong></div><Button onClick={() => { void advance(); }}>{primaryButtonLabel}</Button></div>}
        {job.stage === 'Identificação' && <Section title="Ficha identificada" action={active ? <Button variant="secondary" onClick={() => setEditMode('Ficha')}>Editar ficha</Button> : undefined}><p className="op-prewrap">{job.complaint}</p></Section>}
        {job.stage === 'Diagnóstico' && <Section title={label('diagnosis', 'Diagnóstico')} action={active ? <Button variant="secondary" onClick={() => setDiagnosisOpen(true)}>{job.diagnosis ? 'Editar diagnóstico' : 'Registrar diagnóstico'}</Button> : undefined}>{job.diagnosis ? <p className="op-prewrap">{job.diagnosis}</p> : <Empty>Registre os achados técnicos. A IA pode sugerir verificações sem preencher o diagnóstico por você.</Empty>}</Section>}
        {job.stage === 'Orçamento' && <Section title="Orçamento desta OS"><ZeusQuotePanel w={w} quote={job.quote} job={job} /></Section>}
        {job.stage === 'Execução' && <Section title="Serviços em execução" action={active ? <Button variant="secondary" onClick={() => setEditMode('Execução')}><Plus size={16} />Adicionar tarefa / atualização</Button> : undefined}>{job.tasks.map(task => <button type="button" className="op-check-row" key={task.id} disabled={!active || job.stage !== 'Execução'} aria-pressed={!!task.done} onClick={() => { void toggleExecutionTask(task.id); }} style={{ width: '100%', textAlign: 'left', background: 'transparent', color: 'inherit', borderLeft: 0, borderRight: 0, borderTop: 0 }}><span aria-hidden="true" style={{ width: 26, height: 26, flex: '0 0 26px', display: 'grid', placeItems: 'center', border: '1px solid var(--op-line)', background: task.done ? 'var(--op-accent)' : 'var(--op-paper)', color: task.done ? 'var(--op-on-accent)' : 'transparent' }}><Check size={16} /></span><strong>{task.description}</strong><Badge>{task.done ? 'Concluído' : 'Pendente'}</Badge></button>)}{!job.tasks.length && <Empty>Adicione as tarefas reais desta execução.</Empty>}</Section>}
        {['Conferência', 'Entrega'].includes(job.stage) && <Section title={job.stage === 'Conferência' ? 'Conferência final' : 'Entrega'}><div className="op-detail-pairs"><div><span>Serviços concluídos</span><strong>{job.tasks.filter(item => item.done).length} de {job.tasks.length}</strong></div><div><span>Situação</span><strong>{job.status}</strong></div><div><span>Peças registradas</span><strong>{job.quote.lines.filter(line => line.kind === 'Peça').length}</strong></div><div><span>Orçamento</span><strong>{s.budgetEnabled ? quoteStatus : 'Não utilizado'}</strong></div></div>{active && <Button variant="secondary" onClick={() => setFinalNote(true)}>Registrar observação final</Button>}</Section>}
        {!active && <Section title="Atendimento encerrado"><Badge>{job.status}</Badge><p>O trabalho desta OS foi preservado. O recebimento, quando existir, é tratado separadamente em Faturamento.</p></Section>}

        <div className="zeus-support">
          <details><summary>Ficha completa do atendimento</summary><div><div className="op-detail-pairs"><div><span>Cliente</span><strong>{customer.name}</strong><small>{customer.phone || 'Sem telefone'}</small></div><div><span>{s.assetLabel}</span><strong>{asset.model} {asset.year}</strong><small>{s.meterLabel}: {asset.meter || 'Não informado'}</small></div>{operation.fieldVisible('technician') && <div><span>{label('technician', 'Responsável')}</span><strong>{job.technician || 'Não definido'}</strong></div>}{operation.fieldVisible('due') && <div><span>{label('due', 'Prazo previsto')}</span><strong>{job.due ? date(job.due, true) : 'Não definido'}</strong></div>}{combinedCustom.map(({ field, target }) => <div key={`${target}-${field.id}`}><span>{field.label}</span><strong>{customValues(d, target)[field.id] || 'Não informado'}</strong></div>)}</div><h3>{label('complaint', 'Relato do cliente')}</h3><p className="op-prewrap">{job.complaint}</p>{job.diagnosis && <><h3>{label('diagnosis', 'Diagnóstico')}</h3><p className="op-prewrap">{job.diagnosis}</p></>}</div></details>
          {operation.actionVisible('attachments') && <details><summary>Fotos e evidências ({job.attachments.length})</summary><div>{active && <label className="op-button secondary">{photoBusy ? 'Enviando…' : 'Adicionar foto'}<input hidden disabled={photoBusy} type="file" accept="image/jpeg,image/png,image/webp" onChange={input => { const element = input.currentTarget; const file = element.files?.[0]; if (!file) return; void addPhoto(file).finally(() => { element.value = ''; }); }} /></label>}<div className="op-photos" style={{ marginTop: 14 }}>{job.attachments.map(photo => <figure key={photo.id}><OperationalR2Image app="zeus" storedData={photo.data} alt={photo.name} /><figcaption>{photo.name}</figcaption>{active && <button className="op-icon" aria-label={`Remover ${photo.name}`} onClick={() => { void removePhoto(photo); }}><X size={16} /></button>}</figure>)}</div>{!job.attachments.length && <Empty>Nenhuma evidência anexada.</Empty>}</div></details>}
          <details><summary>Histórico da OS</summary><div><Timeline events={[...job.events, ...job.quote.events].sort((a, b) => a.at.localeCompare(b.at))} /></div></details>
        </div>
      </main>

      <aside className="zeus-context-stack"><div className="zeus-context-card"><span>{s.assetLabel}</span><strong>{asset.identifier}</strong><small>{asset.model}{asset.year ? ` · ${asset.year}` : ''}</small></div><div className="zeus-context-card"><span>Cliente</span><strong>{customer.name}</strong><small>{customer.phone || 'Sem telefone cadastrado'}</small></div>{operation.fieldVisible('technician') && <div className="zeus-context-card"><span>{label('technician', 'Responsável')}</span><strong>{job.technician || 'Não definido'}</strong></div>}{operation.fieldVisible('due') && <div className="zeus-context-card"><span>{label('due', 'Prazo previsto')}</span><strong>{job.due ? date(job.due, true) : 'Não definido'}</strong></div>}{active && job.stage !== 'Identificação' && operation.actionVisible('manualStatus') && <div className="zeus-context-card"><span>Situação operacional</span><select aria-label="Situação do atendimento" value={job.status} disabled={job.status === 'Aguardando aprovação'} onChange={change => patch(current => { current.status = change.target.value; current.events.push(event(`Situação: ${current.status}`)); })}>{Array.from(new Set([job.status, 'Em andamento', 'Aguardando peça', 'Pausado'])).map(value => <option key={value}>{value}</option>)}</select></div>}<div className="zeus-context-card"><span>Resumo</span><strong>{job.tasks.filter(item => item.done).length}/{job.tasks.length} serviços</strong><small>{job.quote.lines.filter(line => line.kind === 'Peça').length} peça(s) registrada(s)</small></div></aside>
    </div>

    {active && operation.actionVisible('cancel') && <div className="op-record-secondary-actions"><Button variant="danger" onClick={() => setCancel(true)}>Cancelar OS</Button></div>}

    {diagnosisOpen && <DiagnosisEditor w={w} job={job} assetLabel={s.meterLabel} onClose={() => setDiagnosisOpen(false)} />}
    {editMode && <Modal title={editMode === 'Execução' ? 'Atualizar execução' : 'Editar atendimento'} onClose={() => setEditMode(null)}><RecordForm draftKey={`zeus-lean-edit:${job.id}:${editMode}`} fields={editMode === 'Execução' ? [{ name: 'task', label: 'Nova tarefa de execução', wide: true }, { name: 'update', label: 'Atualização', type: 'textarea', wide: true }] : [...(operation.fieldVisible('technician') ? [{ name: 'technician', label: label('technician', 'Responsável'), value: job.technician }] : []), ...(operation.fieldVisible('due') ? [{ name: 'due', label: label('due', 'Prazo previsto'), type: 'datetime-local', value: job.due }] : []), { name: 'complaint', label: label('complaint', 'Relato do cliente'), type: 'textarea', wide: true, required: true, value: job.complaint }, ...(operation.fieldVisible('internalNotes') ? [{ name: 'notes', label: label('internalNotes', 'Observações internas'), type: 'textarea', wide: true, value: job.notes }] : []), ...customerCustom.map(field => ({ name: `customer__${field.id}`, label: field.label, wide: true, value: customValues(d, customer.id)[field.id] || '' })), ...assetCustom.map(field => ({ name: `asset__${field.id}`, label: field.label, wide: true, value: customValues(d, asset.id)[field.id] || '' })), ...jobCustom.map(field => ({ name: `job__${field.id}`, label: field.label, wide: true, value: customValues(d, job.id)[field.id] || '' }))]} onClose={() => setEditMode(null)} onSave={form => w.mutate(data => { const current = data.jobs.find(item => item.id === job.id)!; if (editMode === 'Execução') { if (form.task?.trim()) { current.tasks.push({ id: uid(), description: form.task.trim(), done: false }); current.events.push(event(`Tarefa adicionada: ${form.task.trim()}`)); } if (form.update?.trim()) current.events.push(event(form.update.trim())); } else { if (form.technician !== undefined) current.technician = form.technician; if (form.due !== undefined) current.due = form.due; current.complaint = form.complaint; if (form.notes !== undefined) current.notes = form.notes; setCustomValues(data, customer.id, Object.fromEntries(customerCustom.map(field => [field.id, form[`customer__${field.id}`] ?? customValues(data, customer.id)[field.id] ?? '']))); setCustomValues(data, asset.id, Object.fromEntries(assetCustom.map(field => [field.id, form[`asset__${field.id}`] ?? customValues(data, asset.id)[field.id] ?? '']))); setCustomValues(data, job.id, Object.fromEntries(jobCustom.map(field => [field.id, form[`job__${field.id}`] ?? customValues(data, job.id)[field.id] ?? '']))); current.events.push(event('Ficha atualizada')); } }, 'Atendimento atualizado.')} /></Modal>}
    {finalNote && <Modal title="Observação final" onClose={() => setFinalNote(false)}><RecordForm draftKey={`zeus-final:${job.id}`} fields={[{ name: 'note', label: 'Observação final', type: 'textarea', required: true, wide: true }]} onClose={() => setFinalNote(false)} onSave={form => patch(current => { current.events.push(event(`Observação final: ${form.note}`)); }, 'Observação final registrada.')} /></Modal>}
    {finish && <Confirm title="Encerrar esta ordem de serviço?" label="Encerrar OS" onClose={() => setFinish(false)} onConfirm={async () => {
      const ok = await w.mutate(data => advanceJob(data, job.id, job.stage), 'Atendimento encerrado e enviado ao histórico.');
      if (ok) w.setNotice('OS encerrada. Se houver valor a receber, ela já está disponível em Faturamento.');
      return ok;
    }}>O trabalho operacional será encerrado e preservado no histórico. Cobrança e baixa ficam separadas na tela Faturamento.</Confirm>}
    {cancel && <Modal title="Cancelar ordem de serviço" onClose={() => setCancel(false)}><RecordForm fields={[{ name: 'reason', label: 'Motivo do cancelamento', type: 'textarea', wide: true, required: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={form => patch(current => { current.status = 'Cancelado'; current.events.push(event(`Cancelado: ${form.reason}`)); })} /></Modal>}
    {report && <Modal title="Relatório do atendimento" wide onClose={() => setReport(false)}><article className="op-print-document zeus-report-document"><header className="zeus-report-head"><div><span className="op-kicker">{s.business || 'Oficina'}</span><h2>Relatório da OS {String(job.number).padStart(4, '0')}</h2><p>{[s.phone, s.email, s.address].filter(Boolean).join(' · ')}</p></div><div className="zeus-report-status"><span>Situação</span><strong>{job.status}</strong></div></header><div className="zeus-report-summary"><div><span>Cliente</span><strong>{customer.name}</strong><small>{customer.phone}</small></div><div><span>{s.identifierLabel}</span><strong>{asset.identifier}</strong><small>{asset.model}{asset.year ? ` · ${asset.year}` : ''}</small></div><div><span>Abertura</span><strong>{date(job.createdAt, true)}</strong></div><div><span>{label('technician', 'Responsável')}</span><strong>{job.technician || 'Não definido'}</strong></div></div><section><h3>{label('complaint', 'Relato do cliente')}</h3><p className="op-prewrap">{job.complaint}</p></section><section><h3>{label('diagnosis', 'Diagnóstico')}</h3><p className="op-prewrap">{job.diagnosis || 'Não registrado'}</p></section><section><h3>Serviços realizados</h3>{job.tasks.length ? job.tasks.map(task => <div className="zeus-report-line" key={task.id}><span>{task.description}</span><strong>{task.done ? 'Concluído' : 'Pendente'}</strong></div>) : <p>Sem tarefas de execução registradas.</p>}</section><section><h3>Peças registradas</h3>{job.quote.lines.filter(line => line.kind === 'Peça').length ? job.quote.lines.filter(line => line.kind === 'Peça').map(line => <div className="zeus-report-line" key={line.id}><span>{line.description}{line.brand ? ` · ${line.brand}` : ''}</span><strong>{line.quantity} × {money(line.price)}</strong></div>) : <p>Sem peças registradas.</p>}</section>{s.budgetEnabled && job.quote.lines.length > 0 && <div className="zeus-report-total"><span>Valor registrado na OS</span><strong>{money(reportTotal)}</strong></div>}<footer>Documento de atendimento · {s.business || 'Oficina'} · gerado em {new Date().toLocaleString('pt-BR')}</footer></article><div className="op-form-footer"><Button onClick={() => window.print()}>Imprimir / salvar PDF</Button></div></Modal>}
  </>;
}
