'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { clientMessage } from '@/lib/clientMessage';
import { Button } from './ui';

export function FieldHelpAISuggestions({ app, fieldKey, label, description, currentHelp, onApply }: { app: AppId; fieldKey: string; label: string; description: string; currentHelp: string; onApply: (value: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [interactionId, setInteractionId] = useState('');
  const [error, setError] = useState('');

  const authHeaders = async () => {
    const { data } = await createStoreClient().auth.getSession();
    if (!data.session) throw new Error('Sua sessão expirou. Entre novamente.');
    return { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` };
  };

  const learn = async (text: string) => {
    if (!interactionId || text.trim().length < 8) return;
    try {
      const headers = await authHeaders();
      await fetch(`/api/ai/${app}/feedback`, { method: 'POST', headers, body: JSON.stringify({ interactionId, correctedText: text.trim() }) });
    } catch {
      // Feedback é melhoria incremental; não bloqueia a personalização.
    }
  };

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/ai/${app}/settings-help`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fieldKey, label, description, currentHelp }),
      });
      const result = await response.json().catch(() => ({})) as { suggestions?: string[]; interactionId?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível gerar sugestões.');
      setSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
      setInteractionId(result.interactionId || '');
    } catch (reason) {
      setError(clientMessage(reason, 'Não foi possível gerar sugestões agora.'));
    } finally {
      setLoading(false);
    }
  };

  const reject = () => {
    void learn(currentHelp);
    setSuggestions([]);
    setInteractionId('');
  };

  return <div className="op-ai-help-control">
    <Button variant="secondary" onClick={() => { void generate(); }} disabled={loading}><Sparkles size={15}/>{loading ? 'Gerando…' : 'Personalizar com IA'}</Button>
    {error && <small className="op-error-text">{error}</small>}
    {suggestions.length > 0 && <div className="op-ai-help-suggestions" role="listbox" aria-label={`Sugestões para ${label}`}>
      <div className="op-ai-help-head"><strong>Sugestões</strong><button type="button" className="op-icon" aria-label="Rejeitar sugestões" onClick={reject}><X size={15}/></button></div>
      {suggestions.map(suggestion => <button type="button" className="op-ai-help-option" key={suggestion} onClick={() => { onApply(suggestion); void learn(suggestion); setSuggestions([]); setInteractionId(''); }}>{suggestion}</button>)}
    </div>}
  </div>;
}
