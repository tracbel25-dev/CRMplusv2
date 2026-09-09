'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { buildOperationalFormMass, type AIFormApp } from '@/lib/ai/formMass';

const labels: Record<string, string> = {
  complaint: 'Relato do cliente',
  notes: 'Observações',
  task: 'Tarefa',
  update: 'Atualização',
  reason: 'Motivo',
  category: 'Categoria',
  description: 'Descrição',
  allergens: 'Ingredientes e alergênicos',
  note: 'Observação',
};

const eligible: Record<AIFormApp, string[]> = {
  zeus: ['complaint', 'notes', 'task', 'update', 'reason'],
  artemis: ['category', 'description', 'allergens', 'note', 'notes'],
};

type SuggestionState = {
  form: HTMLFormElement;
  interactionId: string;
  suggestions: Record<string, string>;
  selected: Record<string, boolean>;
  massUsed: number;
  lessonsUsed: number;
};

function currentForm() {
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  for (const dialog of dialogs.reverse()) {
    const form = dialog.querySelector<HTMLFormElement>('form');
    if (form) return form;
  }
  return document.querySelector<HTMLFormElement>('#op-main form');
}

function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries().map(([key, value]) => [key, String(value)]));
}

function normalized(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function token() {
  const supabase = createStoreClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function sendCorrection(app: AIFormApp, interactionId: string, correctedText: string) {
  const accessToken = await token();
  if (!accessToken || !interactionId || correctedText.trim().length < 8) return;
  await fetch(`/api/ai/${app}/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ interactionId, correctedText }),
  }).catch(() => undefined);
}

export function OperationalAIAssist({ w, app }: { w: Workspace; app: AIFormApp }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<SuggestionState | null>(null);

  const prepare = async () => {
    const form = currentForm();
    if (!form) {
      w.setNotice('Abra um formulário para usar o preenchimento assistido.');
      return;
    }

    const names = [...new Set([...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[name]')].map(item => item.name).filter(Boolean))];
    if (!names.some(name => eligible[app].includes(name))) {
      w.setNotice('Este formulário não possui campos adequados para preenchimento assistido.');
      return;
    }

    setBusy(true);
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Entre com a conta da empresa para usar a assistência de IA.');
      const response = await fetch(`/api/ai/${app}/fill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          fieldNames: names,
          values: formValues(form),
          mass: buildOperationalFormMass(app, w.data),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar sugestões para este formulário.');
      const suggestions = payload.suggestions && typeof payload.suggestions === 'object' ? payload.suggestions as Record<string, string> : {};
      const entries = Object.entries(suggestions).filter(([name, value]) => eligible[app].includes(name) && String(value).trim());
      if (!entries.length) {
        w.setNotice('A IA não encontrou preenchimentos seguros e úteis para este formulário.');
        return;
      }
      const clean = Object.fromEntries(entries.map(([name, value]) => [name, String(value)]));
      setState({
        form,
        interactionId: String(payload.interactionId || ''),
        suggestions: clean,
        selected: Object.fromEntries(entries.map(([name]) => [name, true])),
        massUsed: Number(payload?.memory?.massUsed || 0),
        lessonsUsed: Number(payload?.memory?.lessonsUsed || 0),
      });
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível usar a assistência de IA.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!state) return;
    const applied: Record<string, string> = {};
    for (const [name, suggestion] of Object.entries(state.suggestions)) {
      if (!state.selected[name]) continue;
      const control = state.form.elements.namedItem(name);
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
      control.value = suggestion;
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      applied[name] = suggestion;
    }

    const interactionId = state.interactionId;
    const form = state.form;
    const original = Object.entries(applied).map(([name, value]) => `${name}: ${value}`).join('\n');
    if (interactionId && original) {
      form.addEventListener('submit', () => {
        const finalValues = formValues(form);
        const corrected = Object.keys(applied)
          .map(name => `${name}: ${String(finalValues[name] || '').trim()}`)
          .filter(line => !line.endsWith(':'))
          .join('\n');
        window.setTimeout(() => {
          const dialog = form.closest('dialog') as HTMLDialogElement | null;
          const saved = !form.isConnected || (dialog ? !dialog.open : true);
          if (saved && corrected.length >= 8 && normalized(corrected) !== normalized(original)) {
            void sendCorrection(app, interactionId, corrected);
          }
        }, 700);
      }, { once: true });
    }

    w.setNotice('Sugestões aplicadas. Revise antes de salvar. Alterações posteriores podem melhorar futuras sugestões desta conta.');
    setState(null);
  };

  return <>
    <button className="op-icon" type="button" onClick={() => { void prepare(); }} disabled={busy} title="Preenchimento assistido por IA" aria-label="Preenchimento assistido por IA">
      <Sparkles size={18} />
    </button>

    {state && <div role="dialog" aria-modal="false" aria-label="Sugestões de preenchimento" style={{ position: 'fixed', right: 18, top: 72, width: 'min(420px, calc(100vw - 36px))', maxHeight: 'calc(100vh - 100px)', overflow: 'auto', zIndex: 1000, padding: 18, borderRadius: 18, background: 'var(--op-surface, #fff)', color: 'var(--op-ink, #111)', border: '1px solid var(--op-line, #ddd)', boxShadow: '0 22px 60px rgba(0,0,0,.18)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div><span className="op-kicker">Assistência de IA</span><h3 style={{ margin: '4px 0 6px' }}>Sugestões para este formulário</h3><small className="op-muted">Baseadas no contexto atual, em {state.massUsed} padrões sanitizados da própria conta e em {state.lessonsUsed} aprendizado(s) relevante(s).</small></div>
        <button type="button" className="op-icon" aria-label="Fechar sugestões" onClick={() => setState(null)}><X size={18} /></button>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {Object.entries(state.suggestions).map(([name, suggestion]) => <label key={name} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10, alignItems: 'start', padding: 12, border: '1px solid var(--op-line, #ddd)', borderRadius: 12 }}>
          <input type="checkbox" checked={state.selected[name] !== false} onChange={event => setState(current => current ? { ...current, selected: { ...current.selected, [name]: event.target.checked } } : current)} />
          <span><strong>{labels[name] || name}</strong><small style={{ display: 'block', marginTop: 5, lineHeight: 1.45 }}>{suggestion}</small></span>
        </label>)}
      </div>

      <p className="op-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 14 }}>A IA não substitui revisão humana. Dados pessoais, identificadores únicos, valores comerciais de terceiros e preços de concorrentes não são usados como memória reutilizável.</p>
      <div className="op-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="op-button secondary" onClick={() => setState(null)}>Cancelar</button>
        <button type="button" className="op-button" onClick={apply}>Aplicar selecionados</button>
      </div>
    </div>}
  </>;
}
