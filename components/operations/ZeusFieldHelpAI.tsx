'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { clientMessage } from '@/lib/clientMessage';

type SuggestionResult = { suggestions?: string[]; interactionId?: string };

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

export function ZeusFieldHelpAI({ fieldKey, label, description, currentHelp, history, onApply }: {
  fieldKey: string;
  label: string;
  description: string;
  currentHelp: string;
  history: string[];
  onApply: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [interactionId, setInteractionId] = useState('');

  const suggest = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const token = await accessToken();
      if (!token) throw new Error('Entre na conta para usar a IA.');
      const response = await fetch('/api/ai/zeus/configuration', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', fieldKey, label, description, currentHelp, history }),
      });
      const payload = await response.json().catch(() => ({})) as SuggestionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível gerar sugestões.');
      const next = Array.isArray(payload.suggestions) ? payload.suggestions.filter(Boolean).slice(0, 4) : [];
      setSuggestions(next);
      setInteractionId(String(payload.interactionId || ''));
      setOpen(true);
      if (!next.length) setError('A IA não encontrou uma sugestão melhor para este campo agora.');
    } catch (reason) {
      setError(clientMessage(reason, 'Não foi possível sugerir uma dica agora.'));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (value: string) => {
    onApply(value);
    setOpen(false);
    if (!interactionId) return;
    try {
      const token = await accessToken();
      if (!token) return;
      await fetch('/api/ai/zeus/configuration', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'feedback', interactionId, fieldKey, label, chosen: value }),
      });
    } catch {
      // A escolha continua aplicada mesmo se o aprendizado privado não puder ser registrado.
    }
  };

  return <div className="op-config-ai-wrap">
    <button type="button" className="op-config-ai-button" disabled={busy} onClick={() => void suggest()}>
      <Sparkles size={14} />{busy ? 'Pensando…' : 'Personalizar com IA'}
    </button>
    {open && <div className="op-config-ai-suggestions" role="region" aria-label={`Sugestões para ${label}`}>
      <div className="op-config-ai-head"><strong>Sugestões</strong><button type="button" className="op-icon" aria-label="Fechar sugestões" onClick={() => setOpen(false)}><X size={15}/></button></div>
      {error && <small className="op-error-text">{error}</small>}
      {suggestions.map(value => <button type="button" className="op-config-ai-choice" key={value} onClick={() => void choose(value)}>{value}</button>)}
      {suggestions.length > 0 && <button type="button" className="op-text-link op-config-ai-reject" onClick={() => setOpen(false)}>Rejeitar sugestões</button>}
    </div>}
  </div>;
}
