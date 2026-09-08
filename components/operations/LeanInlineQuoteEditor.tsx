'use client';

import { useState } from 'react';
import { Quote, money, total } from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Button, LineEditor } from './ui';

export function LeanInlineQuoteEditor({ quote, onSave, onSaveAndSend }: { quote: Quote; onSave: (quote: Quote) => Promise<boolean>; onSaveAndSend: (quote: Quote) => Promise<boolean> }) {
  const operation = useOperationPreferences('athena-orcamentos');
  const [draft, setDraft] = useState(() => structuredClone(quote));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let sum = 0;
  try { sum = total(draft.lines, draft.discount); } catch {}

  const run = async (action: (value: Quote) => Promise<boolean>) => {
    if (busy) return;
    setError('');
    try {
      if (!draft.lines.length) throw new Error('Adicione ao menos um item.');
      total(draft.lines, draft.discount);
      if (!draft.validUntil) throw new Error('Informe a validade.');
      setBusy(true);
      await action(structuredClone(draft));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={event => { event.preventDefault(); void run(onSave); }}>
    <div className="op-fields">
      <label className="op-field"><span>{operation.label('quoteTitle', 'Título')}</span><input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label className="op-field"><span>{operation.label('validUntil', 'Validade')}</span><input type="date" required value={draft.validUntil} onChange={event => setDraft({ ...draft, validUntil: event.target.value })} /></label>
    </div>
    <LineEditor lines={draft.lines} onChange={lines => setDraft({ ...draft, lines })} parts showBrand={operation.fieldVisible('partBrand')} customerId={draft.customerId} />
    <div className="op-quote-total">
      {operation.fieldVisible('discount') && <label className="op-field"><span>{operation.label('discount', 'Desconto')} (R$)</span><input type="number" min="0" step="0.01" value={draft.discount / 100} onChange={event => setDraft({ ...draft, discount: Math.round(Number(event.target.value) * 100) })} /></label>}
      <div><small>Total</small><strong>{money(sum)}</strong></div>
    </div>
    {operation.fieldVisible('customerNotes') && <label className="op-field"><span>{operation.label('customerNotes', 'Observações para o cliente')}</span><textarea value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>}
    {error && <p className="op-error" role="alert">{error}</p>}
    <div className="op-form-footer"><Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar rascunho'}</Button><Button disabled={busy} onClick={() => { void run(onSaveAndSend); }}>{busy ? 'Salvando…' : 'Salvar e marcar como enviado'}</Button></div>
  </form>;
}
