'use client';

import { useMemo, useState } from 'react';
import { Check, Clipboard, Link2, RefreshCw } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { createExternalLink, externalDraft, syncExternalResponses } from '@/lib/operations/externalLinks';
import { OperationalAIAssist } from './OperationalAIAssist';

const labels: Record<AppId, string> = {
  zeus: 'Compartilhar orçamento',
  artemis: 'Compartilhar cardápio',
  'athena-pesquisa': 'Pedir avaliação',
  kronos: 'Pedir retorno',
  'athena-orcamentos': 'Enviar orçamento'
};

export function ExternalShare({ w, app, page, recordId }: { w: Workspace; app: AppId; page: string; recordId: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const draft = useMemo(() => externalDraft(app, page, recordId, w.data), [app, page, recordId, w.data]);
  if (!w.accountId || w.accountId === 'guest') return null;

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const next = await createExternalLink(w, app, draft);
      setUrl(next);
      await navigator.clipboard.writeText(next).catch(() => undefined);
      setCopied(true);
      w.setNotice('Link externo criado e copiado.');
    } catch (error) { w.setError(error instanceof Error ? error.message : 'Não foi possível criar o link.'); }
    finally { setBusy(false); }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const count = await syncExternalResponses(w, app);
      if (!count) w.setNotice('Nenhuma resposta externa nova.');
    } catch (error) { w.setError(error instanceof Error ? error.message : 'Não foi possível receber as respostas externas.'); }
    finally { setBusy(false); }
  };

  return <div className="op-external-share">
    {(app === 'zeus' || app === 'artemis') && <OperationalAIAssist w={w} app={app} />}
    {app !== 'zeus' && draft && (!url ? <button className="op-icon" type="button" onClick={() => { void create(); }} disabled={busy} title={labels[app]} aria-label={labels[app]}><Link2 size={19} /></button>
      : <button className="op-icon" type="button" onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); }} title="Copiar link" aria-label="Copiar link">{copied ? <Check size={19} /> : <Clipboard size={19} />}</button>)}
    <button className="op-icon" type="button" onClick={() => { void sync(); }} disabled={busy} title="Receber respostas externas" aria-label="Receber respostas externas"><RefreshCw size={18} /></button>
  </div>;
}
