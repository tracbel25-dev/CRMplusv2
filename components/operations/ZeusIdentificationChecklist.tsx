'use client';

import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { uploadOperationalFile, R2AuthRequiredError } from '@/lib/r2/client';
import { activeJob, customValues, event, setCustomValues, uid } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import type { ZeusChecklistAssetFolder } from '@/lib/operations/checklistAssets';
import {
  ZEUS_CHECKLIST_CATEGORIES,
  ZEUS_CHECKLIST_FOLDER_LABELS,
  ZEUS_CHECKLIST_SEGMENT_BY_FOLDER,
  readZeusChecklistConfig,
  setZeusChecklistChoice,
  zeusChecklistCategoryForFolder,
  zeusChecklistState,
  type ZeusChecklistCategoryId,
} from '@/lib/operations/zeusChecklist';
import { createZeusChecklistLink, listZeusChecklists, syncZeusChecklistResponse } from '@/lib/operations/zeusChecklistClient';
import { ZEUS_ATTACHMENT_META_KEY, ZEUS_CHECKLIST_COMPLETED_KEY } from '@/lib/operations/zeusChecklistKeys';
import { Badge, Button, Section } from './ui';

async function localPhoto(file: File) {
  if (file.size > 750000) throw new Error('Sem sessão de armazenamento, escolha uma foto de até 750 KB.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
    reader.readAsDataURL(file);
  });
}

function attachmentMeta(raw: string | undefined) {
  try { return raw ? JSON.parse(raw) as Record<string, Record<string, unknown>> : {}; }
  catch { return {}; }
}

export function ZeusIdentificationChecklist({ w, jobId }: { w: Workspace; jobId: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState('');
  const [pickerCategory, setPickerCategory] = useState<ZeusChecklistCategoryId | ''>('');
  const job = w.data.jobs.find(item => item.id === jobId);
  const config = readZeusChecklistConfig(w.data);
  const state = zeusChecklistState(w.data, jobId);
  const selectedFolder = state.folder;
  const selectedCategory = pickerCategory || (selectedFolder ? zeusChecklistCategoryForFolder(selectedFolder) : '');
  const visibleCategory = ZEUS_CHECKLIST_CATEGORIES.find(category => category.id === selectedCategory);
  const active = !!job && activeJob(job);
  const [configOpen, setConfigOpen] = useState(!state.folder);

  const checkStatus = async () => {
    if (!job || !w.accountId || w.accountId === 'guest') return;
    try {
      const result = await listZeusChecklists(job.id);
      const response = result.responses[0];
      const completed = !!response;
      setDone(completed || w.data.customFieldValues?.[job.id]?.[ZEUS_CHECKLIST_COMPLETED_KEY] === 'true');
      if (response && w.data.customFieldValues?.[job.id]?.[ZEUS_CHECKLIST_COMPLETED_KEY] !== 'true') {
        await syncZeusChecklistResponse(w, job.id, response);
      }
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o checklist.');
    }
  };

  useEffect(() => {
    setDone(state.completed);
    if (state.completed) setConfigOpen(false);
  }, [jobId, state.completed]);

  useEffect(() => {
    const host = document.getElementById('zeus-current-work');
    if (!host || !job || job.stage !== 'Identificação') return;
    let slot = document.getElementById('zeus-identification-checklist-slot') as HTMLElement | null;
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'zeus-identification-checklist-slot';
      const first = host.querySelector(':scope > .op-section');
      if (first?.parentElement === host) first.after(slot); else host.appendChild(slot);
    }
    setTarget(slot);
    return () => { slot?.remove(); };
  }, [job?.id, job?.stage]);

  useEffect(() => {
    void checkStatus();
    const onFocus = () => { void checkStatus(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // A resposta externa muda fora desta árvore React; foco e sincronizador global atualizam o workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, w.accountId]);

  useEffect(() => {
    if (!job || job.stage !== 'Identificação') return;
    const button = document.querySelector<HTMLButtonElement>('#zeus-current-work .zeus-primary-action button');
    if (!button) return;
    const mustFinish = !!selectedFolder && !done;
    button.disabled = mustFinish;
    button.title = mustFinish ? 'Conclua o checklist de entrada antes de avançar.' : '';
  }, [job?.id, job?.stage, selectedFolder, done]);

  const choose = async (folder: ZeusChecklistAssetFolder | '') => {
    if (!job || done) return;
    if (folder) setPickerCategory(zeusChecklistCategoryForFolder(folder)); else setPickerCategory('');
    const ok = await w.mutate(data => setZeusChecklistChoice(data, job.id, folder), folder ? 'Checklist definido para esta OS.' : 'Checklist desabilitado para esta OS.');
    if (ok) setConfigOpen(false);
  };

  const openChecklist = async () => {
    if (!job || !selectedFolder || done) return;
    if (!w.accountId || w.accountId === 'guest') { w.setError('Entre com a conta da oficina para abrir o checklist.'); return; }
    setBusy('checklist');
    try {
      const segment = ZEUS_CHECKLIST_SEGMENT_BY_FOLDER[selectedFolder];
      const result = await createZeusChecklistLink({
        jobId: job.id,
        folder: selectedFolder,
        segment,
        items: config.itemsBySegment[segment],
        requireSignature: config.requireSignature,
      });
      const url = `${window.location.origin}/checklist/${result.token}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      await w.mutate(data => {
        const current = data.jobs.find(item => item.id === job.id);
        if (current && !current.events.some(item => item.text.includes('Checklist de entrada aberto'))) {
          current.events.push(event(`Checklist de entrada aberto · ${ZEUS_CHECKLIST_FOLDER_LABELS[selectedFolder]}`));
        }
      }, result.reused ? 'Checklist já estava aberto. Link reutilizado.' : 'Checklist aberto em nova aba.');
    } catch (reason) {
      const error = reason as Error & { completed?: boolean };
      if (error.completed) { setDone(true); setConfigOpen(false); await checkStatus(); }
      else w.setError(error.message || 'Não foi possível abrir o checklist.');
    } finally { setBusy(''); }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!job || !files?.length) return;
    setBusy('photo');
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: escolha uma foto de até 8 MB.`);
        let data = '';
        try {
          const uploaded = await uploadOperationalFile('zeus', file);
          data = `r2:${uploaded.key}|${uploaded.url}`;
        } catch (reason) {
          if (!(reason instanceof R2AuthRequiredError)) throw reason;
          data = await localPhoto(file);
        }
        const attachmentId = uid();
        const capturedAt = new Date().toISOString();
        await w.mutate(store => {
          const current = store.jobs.find(item => item.id === job.id);
          if (!current) return;
          current.attachments.push({ id: attachmentId, name: file.name, data });
          current.events.push(event(`Foto da identificação anexada: ${file.name}`));
          const values = customValues(store, job.id);
          const metadata = attachmentMeta(values[ZEUS_ATTACHMENT_META_KEY]);
          metadata[attachmentId] = { stage: 'Identificação', source: 'identification', author: store.settings.operator || '', createdAt: capturedAt, metadata: { purpose: 'entry' } };
          setCustomValues(store, job.id, { [ZEUS_ATTACHMENT_META_KEY]: JSON.stringify(metadata) });
        }, 'Foto vinculada à identificação.');
      }
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível anexar as fotos.');
    } finally { setBusy(''); }
  };

  if (!target || !job || job.stage !== 'Identificação') return null;
  const locked = !active || done;
  const selectedLabel = selectedFolder ? ZEUS_CHECKLIST_FOLDER_LABELS[selectedFolder] : 'Checklist desabilitado';

  return createPortal(<Section title="Checklist e fotos da identificação" action={done ? <Badge><CheckCircle2 size={13} />Checklist concluído</Badge> : undefined}>
    <div className="zeus-identification-checklist-grid">
      <div className="zeus-identification-actions span-full">
        <div><span>Checklist desta OS</span><strong>{selectedLabel}</strong><small>{done ? 'Já executado. Não é possível preencher novamente.' : selectedFolder ? 'Conclua para liberar a próxima etapa.' : 'A OS pode seguir sem checklist.'}</small></div>
        <div className="zeus-identification-action-buttons">
          {selectedFolder && !done && <Button disabled={busy === 'checklist'} onClick={() => { void openChecklist(); }}><ExternalLink size={16} />{busy === 'checklist' ? 'Abrindo…' : 'Preencher checklist'}</Button>}
          {!done && selectedFolder && <Button variant="secondary" disabled={busy === 'checklist'} onClick={() => { void checkStatus(); }}><RefreshCw size={15} />Atualizar</Button>}
        </div>
      </div>

      <details className="zeus-checklist-config span-full" open={configOpen} onToggle={event => setConfigOpen(event.currentTarget.open)}>
        <summary><div><span>Configuração do checklist</span><strong>{selectedFolder ? selectedLabel : 'Escolher checklist'}</strong></div><small>{configOpen ? 'Fechar' : done ? 'Consultar' : selectedFolder ? 'Alterar' : 'Escolher'}</small></summary>
        <div className="zeus-checklist-config-body">
          <div className="zeus-checklist-picker-head">
            <div><strong>Escolha a categoria</strong><small>{done ? 'Checklist bloqueado após a conclusão.' : 'Selecione o segmento e depois o modelo específico.'}</small></div>
            <button type="button" disabled={locked} className={`zeus-checklist-off ${!selectedFolder ? 'active' : ''}`} onClick={() => { void choose(''); }}>Não usar checklist</button>
          </div>
          <div className="zeus-checklist-categories">
            {ZEUS_CHECKLIST_CATEGORIES.map(category => <button type="button" key={category.id} disabled={locked} className={selectedCategory === category.id ? 'active' : ''} onClick={() => setPickerCategory(category.id)}><strong>{category.label}</strong><small>{category.description}</small></button>)}
          </div>
          {visibleCategory && <div className="zeus-checklist-models">
            <div className="zeus-checklist-models-head"><div><span>Modelo específico</span><strong>{visibleCategory.label}</strong></div><small>{selectedFolder && visibleCategory.folders.includes(selectedFolder) ? `Selecionado: ${ZEUS_CHECKLIST_FOLDER_LABELS[selectedFolder]}` : 'Escolha o equipamento correspondente à OS.'}</small></div>
            <div className="zeus-checklist-model-grid">{visibleCategory.folders.map(folder => <button type="button" disabled={locked} key={folder} className={selectedFolder === folder ? 'active' : ''} onClick={() => { void choose(folder); }}><strong>{ZEUS_CHECKLIST_FOLDER_LABELS[folder]}</strong>{config.defaultAssetFolder === folder && <em>Padrão</em>}</button>)}</div>
          </div>}
          {!done && <small className="zeus-checklist-picker-hint">O padrão da Configuração vem pré-selecionado, mas pode ser trocado nesta OS antes da inspeção.</small>}
        </div>
      </details>

      <div className="zeus-identification-photo-row span-full">
        <div><span>Fotos da identificação</span><small>As fotos de entrada continuam disponíveis em Fotos e evidências.</small></div>
        <div className="op-actions"><label className="op-button secondary"><Camera size={16} />{busy === 'photo' ? 'Enviando…' : 'Tirar / anexar'}<input hidden multiple disabled={busy === 'photo' || !active} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={input => { const element = input.currentTarget; void addPhotos(element.files).finally(() => { element.value = ''; }); }} /></label><Badge>{job.attachments.length} foto(s)</Badge></div>
      </div>
    </div>

    <style jsx global>{`
      .zeus-identification-checklist-grid{display:grid;grid-template-columns:1fr;gap:10px}.zeus-identification-checklist-grid .span-full{grid-column:1/-1}
      .zeus-identification-actions,.zeus-identification-photo-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid var(--op-line);background:var(--op-soft,#f7f9fb)}
      .zeus-identification-actions>div:first-child,.zeus-identification-photo-row>div:first-child{display:grid;gap:2px;min-width:0}.zeus-identification-actions span,.zeus-identification-photo-row span,.zeus-checklist-config summary span,.zeus-checklist-models-head span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--op-muted)}.zeus-identification-actions small,.zeus-identification-photo-row small,.zeus-checklist-config small,.zeus-checklist-picker-hint,.zeus-checklist-models-head small{color:var(--op-muted)}
      .zeus-identification-action-buttons{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.zeus-identification-action-buttons .op-button{white-space:nowrap}
      .zeus-checklist-config{border:1px solid var(--op-line);background:var(--op-paper)}.zeus-checklist-config>summary{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:58px;padding:11px 14px;cursor:pointer;list-style:none}.zeus-checklist-config>summary::-webkit-details-marker{display:none}.zeus-checklist-config>summary>div{display:grid;gap:2px;min-width:0}.zeus-checklist-config>summary>small{color:var(--op-accent);font-weight:700}.zeus-checklist-config[open]>summary{border-bottom:1px solid var(--op-line);background:var(--op-soft)}.zeus-checklist-config-body{display:grid;gap:12px;padding:14px}
      .zeus-checklist-picker-head,.zeus-checklist-models-head{display:flex;align-items:center;justify-content:space-between;gap:14px}.zeus-checklist-picker-head>div,.zeus-checklist-models-head>div{display:grid;gap:2px}.zeus-checklist-picker-head small{color:var(--op-muted)}
      .zeus-checklist-off,.zeus-checklist-categories button,.zeus-checklist-model-grid button{border:1px solid var(--op-line);background:var(--op-paper);color:inherit;cursor:pointer}.zeus-checklist-off{padding:8px 11px;min-height:38px}.zeus-checklist-off.active,.zeus-checklist-categories button.active,.zeus-checklist-model-grid button.active{border-color:var(--op-accent);box-shadow:inset 0 0 0 1px var(--op-accent);background:var(--op-tint)}
      .zeus-checklist-categories{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.zeus-checklist-categories button{min-height:62px;padding:9px;text-align:left;display:grid;align-content:center;gap:2px}.zeus-checklist-categories small{color:var(--op-muted);font-size:10px}.zeus-checklist-models{display:grid;gap:9px;padding-top:10px;border-top:1px solid var(--op-line)}.zeus-checklist-model-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.zeus-checklist-model-grid button{min-height:44px;padding:8px 9px;display:flex;align-items:center;justify-content:space-between;gap:7px;text-align:left}.zeus-checklist-model-grid em{font-size:9px;font-style:normal;text-transform:uppercase;color:var(--op-accent)}
      @media(max-width:980px){.zeus-checklist-categories{grid-template-columns:repeat(3,minmax(0,1fr))}.zeus-checklist-model-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.zeus-identification-actions,.zeus-identification-photo-row{align-items:flex-start;padding:11px 12px}.zeus-identification-actions{display:grid;grid-template-columns:minmax(0,1fr) auto}.zeus-identification-action-buttons{display:grid;grid-template-columns:auto auto;gap:6px}.zeus-identification-action-buttons .op-button{min-height:38px;padding:8px 10px;font-size:12px!important}.zeus-identification-photo-row{display:grid;grid-template-columns:minmax(0,1fr) auto}.zeus-identification-photo-row .op-actions{justify-content:flex-end}.zeus-identification-photo-row .op-button{min-height:38px;padding:8px 10px;font-size:12px!important}.zeus-checklist-config>summary{min-height:54px;padding:10px 12px}.zeus-checklist-config-body{padding:12px}.zeus-checklist-picker-head,.zeus-checklist-models-head{align-items:flex-start;flex-direction:column}.zeus-checklist-off{width:100%}.zeus-checklist-categories{display:flex;grid-template-columns:none;gap:7px;overflow-x:auto;padding:1px 1px 7px;scroll-snap-type:x proximity;overscroll-behavior-inline:contain}.zeus-checklist-categories button{flex:0 0 min(68vw,210px);min-height:58px;scroll-snap-align:start}.zeus-checklist-model-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.zeus-checklist-model-grid button{min-height:42px}.zeus-checklist-picker-hint{font-size:11px}}
      @media(max-width:430px){.zeus-identification-actions{grid-template-columns:1fr}.zeus-identification-action-buttons{grid-template-columns:1fr 1fr;width:100%}.zeus-identification-action-buttons .op-button{width:100%}.zeus-identification-photo-row{grid-template-columns:1fr}.zeus-identification-photo-row .op-actions{justify-content:flex-start}.zeus-checklist-model-grid{grid-template-columns:1fr 1fr}}
    `}</style>
  </Section>, target);
}
