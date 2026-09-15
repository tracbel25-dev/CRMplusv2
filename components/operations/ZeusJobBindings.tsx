'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Workspace } from '@/lib/operations/storage';
import { customValues, setCustomValues } from '@/lib/operations/model';
import {
  ZEUS_ATTACHMENT_META_KEY,
  ZEUS_CHECKLIST_COMPLETED_AT_KEY,
  ZEUS_CHECKLIST_COMPLETED_KEY,
  ZEUS_CHECKLIST_RESPONSE_KEY,
  ZEUS_RELATED_JOB_KEY,
  ZEUS_WARRANTY_REASON_KEY,
} from '@/lib/operations/zeusChecklistKeys';
import { Badge } from './ui';

function parseObject(raw: string | undefined) {
  try { const value = raw ? JSON.parse(raw) : {}; return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
  catch { return {}; }
}

export function ZeusAttachmentMetadataBridge({ w, jobId }: { w: Workspace; jobId: string }) {
  const seen = useRef<Set<string>>(new Set());
  const initializedFor = useRef('');
  const job = w.data.jobs.find(item => item.id === jobId);

  useEffect(() => {
    if (!job) return;
    if (initializedFor.current !== job.id) {
      initializedFor.current = job.id;
      seen.current = new Set(job.attachments.map(item => item.id));
      return;
    }
    const added = job.attachments.filter(item => !seen.current.has(item.id));
    job.attachments.forEach(item => seen.current.add(item.id));
    if (!added.length) return;
    void w.mutate(data => {
      const current = data.jobs.find(item => item.id === job.id);
      if (!current) return;
      const values = customValues(data, job.id);
      const metadata = parseObject(values[ZEUS_ATTACHMENT_META_KEY]);
      const capturedAt = new Date().toISOString();
      for (const attachment of added) {
        if (metadata[attachment.id]) continue;
        metadata[attachment.id] = {
          stage: current.stage,
          source: 'manual',
          author: data.settings.operator || '',
          createdAt: capturedAt,
          metadata: { purpose: current.stage.toLocaleLowerCase('pt-BR') },
        };
      }
      setCustomValues(data, job.id, { [ZEUS_ATTACHMENT_META_KEY]: JSON.stringify(metadata) });
    }, 'Origem das evidências registrada.');
  }, [job?.attachments.length, job?.stage, job?.id, w]);

  return null;
}

export function ZeusJobOperationalRecord({ w, jobId }: { w: Workspace; jobId: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const job = w.data.jobs.find(item => item.id === jobId);
  const values = customValues(w.data, jobId);
  const completed = values[ZEUS_CHECKLIST_COMPLETED_KEY] === 'true';
  const response = parseObject(values[ZEUS_CHECKLIST_RESPONSE_KEY]);
  const relatedId = String(values[ZEUS_RELATED_JOB_KEY] || '');
  const related = relatedId ? w.data.jobs.find(item => item.id === relatedId) : undefined;
  const warrantyReason = String(values[ZEUS_WARRANTY_REASON_KEY] || '');

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('#zeus-current-work .zeus-support');
    if (!host || !job) return;
    let slot = document.getElementById('zeus-operational-record-slot') as HTMLElement | null;
    if (!slot) { slot = document.createElement('div'); slot.id = 'zeus-operational-record-slot'; host.prepend(slot); }
    setTarget(slot);
    return () => { slot?.remove(); };
  }, [job?.id]);

  if (!target || !job || (!completed && !relatedId)) return null;
  const answers = Array.isArray(response.answers) ? response.answers as Array<{ item?: string; status?: string; note?: string }> : [];
  const damage = Array.isArray(response.damage) ? response.damage : [];
  const meter = String(response.meter || values.__zeus_checklist_meter__ || '');

  return createPortal(<>
    {completed && <details open={job.stage === 'Identificação'}><summary>Checklist de entrada concluído</summary><div className="zeus-checklist-record">
      <div className="op-detail-pairs"><div><span>Concluído em</span><strong>{values[ZEUS_CHECKLIST_COMPLETED_AT_KEY] ? new Date(values[ZEUS_CHECKLIST_COMPLETED_AT_KEY]).toLocaleString('pt-BR') : 'Registrado'}</strong></div><div><span>{w.data.settings.meterLabel}</span><strong>{meter || 'Não informado'}</strong></div><div><span>Responsável</span><strong>{String(response.name || 'Não informado')}</strong></div><div><span>Avarias marcadas</span><strong>{damage.length}</strong></div></div>
      {answers.length > 0 && <div className="zeus-checklist-record-items">{answers.map((answer, index) => <div key={`${answer.item}-${index}`}><span>{answer.item || `Item ${index + 1}`}</span><Badge tone={answer.status === 'Atenção' ? 'warning' : ''}>{answer.status || 'Registrado'}</Badge>{answer.note && <small>{answer.note}</small>}</div>)}</div>}
      {response.notes && <p className="op-prewrap"><strong>Observações:</strong> {String(response.notes)}</p>}
    </div></details>}
    {relatedId && <details><summary>Vínculo de retorno / garantia</summary><div className="op-detail-pairs"><div><span>OS de origem</span><strong>{related ? `OS ${String(related.number).padStart(4, '0')}` : 'OS relacionada'}</strong><small>{related ? `${related.type} · ${new Date(related.createdAt).toLocaleDateString('pt-BR')}` : relatedId}</small></div><div><span>Motivo</span><strong>{warrantyReason || 'Não informado'}</strong></div></div>{related && <a className="op-button secondary" href={`/zeus/atendimentos/${related.id}`}>Abrir OS de origem</a>}</details>}
    <style jsx global>{`.zeus-checklist-record{display:grid;gap:14px}.zeus-checklist-record-items{display:grid;border:1px solid var(--op-line)}.zeus-checklist-record-items>div{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:10px 12px;border-bottom:1px solid var(--op-line)}.zeus-checklist-record-items>div:last-child{border-bottom:0}.zeus-checklist-record-items small{grid-column:1/-1;color:var(--op-muted)}`}</style>
  </>, target);
}
