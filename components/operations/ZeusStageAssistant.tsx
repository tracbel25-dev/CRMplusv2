'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Workspace } from '@/lib/operations/storage';
import type { Job } from '@/lib/operations/model';
import { Button, Modal } from './ui';

type Suggestion = { title: string; reason: string };

export function ZeusStageAssistant({ w, job }: { w: Workspace; job: Job }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const asset = w.data.assets.find(item => item.id === job.assetId);
  const customer = w.data.customers.find(item => item.id === job.customerId);

  const load = async () => {
    setOpen(true);
    setBusy(true);
    try {
      const { data } = await createStoreClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Entre novamente para usar a assistência da IA.');
      const context = [
        `Cliente: ${customer?.name || 'não informado'}`,
        `Veículo/equipamento: ${asset ? `${asset.identifier} ${asset.model} ${asset.year}` : 'não informado'}`,
        `Tipo: ${job.type}`,
        `Relato: ${job.complaint}`,
        job.diagnosis ? `Diagnóstico registrado: ${job.diagnosis}` : '',
        job.quote?.lines?.length ? `Itens previstos/aprovados: ${job.quote.lines.map(line => `${line.description}${line.brand ? ` (${line.brand})` : ''}`).join(', ')}` : '',
        job.tasks?.length ? `Execução: ${job.tasks.map(task => `${task.description} (${task.done ? 'concluído' : 'pendente'})`).join(', ')}` : '',
        job.notes ? `Observações: ${job.notes}` : '',
      ].filter(Boolean).join('\n');
      const response = await fetch('/api/zeus/assistente', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ stage: job.stage, context }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar sugestões.');
      setSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível usar a assistência da IA.');
      setOpen(false);
    } finally { setBusy(false); }
  };

  const addExecutionTask = async (title: string) => {
    const ok = await w.mutate(data => {
      const current = data.jobs.find(item => item.id === job.id);
      if (!current) throw new Error('OS não encontrada.');
      if (!current.tasks.some(task => task.description.trim().toLocaleLowerCase('pt-BR') === title.trim().toLocaleLowerCase('pt-BR'))) current.tasks.push({ id: crypto.randomUUID(), description: title.trim(), done: false });
    }, 'Sugestão adicionada à execução.');
    if (ok) w.setNotice('Sugestão adicionada. Você pode editar antes de concluir.');
  };

  return <>
    <Button variant="secondary" onClick={() => { void load(); }}><Sparkles size={16} />Sugestões da IA</Button>
    {open && <Modal title={`Sugestões para ${job.stage.toLowerCase()}`} wide onClose={() => setOpen(false)}>
      <div className="zeus-ai-helper">
        <p className="op-muted">A IA só sugere caminhos. Nada é aplicado sem você escolher.</p>
        {busy ? <p>Preparando sugestões…</p> : suggestions.length ? suggestions.map((item, index) => <div className="zeus-ai-suggestion" key={`${item.title}-${index}`}><div><strong>{item.title}</strong><small>{item.reason}</small></div>{job.stage === 'Execução' && <Button variant="secondary" onClick={() => { void addExecutionTask(item.title); }}>Adicionar à execução</Button>}</div>) : <p>Nenhuma sugestão disponível.</p>}
      </div>
    </Modal>}
  </>;
}
