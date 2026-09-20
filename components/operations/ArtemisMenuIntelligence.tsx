'use client';

import { useState } from 'react';
import { ListTree, Sparkles, WandSparkles } from 'lucide-react';
import type { Product } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { Button } from './ui';

type ReviewSuggestion = {
  kind: 'variants' | 'category' | 'completion' | 'organization';
  title: string;
  reason: string;
  productId?: string;
  productIds?: string[];
  suggestedCategory?: string;
  variantNames?: string[];
};
type ReviewResult = { summary: string; suggestions: ReviewSuggestion[]; memory?: { lessonsUsed?: number } };

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

function productVariants(product: Product) {
  return (product.variants || []).filter(item => item && item.id && item.name);
}

export function ArtemisMenuIntelligence({ w }: { w: Workspace }) {
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);

  const runReview = async () => {
    if (!w.data.products.length) { w.setNotice('Cadastre produtos antes de pedir uma revisão do cardápio.'); return; }
    setBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Entre com a conta do restaurante para usar a IA.');
      const products = w.data.products.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description,
        allergens: product.allergens,
        preparation: product.preparation,
        variantNames: productVariants(product).map(item => item.name),
      }));
      const response = await fetch('/api/ai/artemis/menu-review', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ products }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível revisar o cardápio.');
      setReview({ summary: String(payload.summary || ''), suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [], memory: payload.memory });
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível revisar o cardápio.');
    } finally {
      setBusy(false);
    }
  };

  const applyCategory = async (suggestion: ReviewSuggestion) => {
    const ids = new Set([suggestion.productId, ...(suggestion.productIds || [])].filter(Boolean) as string[]);
    const category = suggestion.suggestedCategory?.trim() || '';
    if (!ids.size || !category) return;
    const ok = await w.mutate(data => {
      data.products.forEach(product => { if (ids.has(product.id)) product.category = category; });
    }, `Categoria ajustada para ${category}.`);
    if (ok) setReview(current => current ? { ...current, suggestions: current.suggestions.filter(item => item !== suggestion) } : current);
  };

  const productName = (id?: string) => w.data.products.find(item => item.id === id)?.name || '';

  return <section className="artemis-menu-intelligence">
    <div className="artemis-menu-intelligence-head">
      <div><span className="op-kicker">Cardápio inteligente</span><h2>Revisar organização com IA</h2><p>A IA procura lacunas e sugere melhorias. Tamanhos, opções e preços são editados diretamente no produto.</p></div>
      <Button variant="secondary" disabled={busy} onClick={() => void runReview()}><Sparkles size={17} />{busy ? 'Analisando…' : 'Revisar cardápio'}</Button>
    </div>

    {review && <div className="artemis-menu-review">
      <div className="artemis-menu-review-summary"><WandSparkles size={18} /><span>{review.summary || 'Revisão concluída.'}</span>{Number(review.memory?.lessonsUsed || 0) > 0 && <small>{review.memory?.lessonsUsed} aprendizado(s) privado(s) considerado(s)</small>}</div>
      {review.suggestions.length ? <div className="artemis-menu-review-grid">{review.suggestions.map((suggestion, index) => <article key={`${suggestion.kind}-${suggestion.productId || index}-${index}`}>
        <div className="artemis-menu-review-icon">{suggestion.kind === 'category' || suggestion.kind === 'organization' ? <ListTree size={18} /> : <Sparkles size={18} />}</div>
        <div><strong>{suggestion.title}</strong>{suggestion.productId && <small>{productName(suggestion.productId)}</small>}<p>{suggestion.reason}</p>{suggestion.variantNames?.length ? <div className="artemis-variant-chips">{suggestion.variantNames.map(name => <span key={name}>{name}</span>)}</div> : null}</div>
        <div className="op-actions">
          {suggestion.kind === 'category' && suggestion.suggestedCategory && <Button variant="secondary" onClick={() => void applyCategory(suggestion)}>Aplicar categoria</Button>}
          {suggestion.kind === 'variants' && suggestion.productId && <Button variant="secondary" onClick={() => w.setNotice(`Abra “${productName(suggestion.productId)}” e use a aba Tamanhos e opções para revisar esta sugestão.`)}>Como aplicar</Button>}
        </div>
      </article>)}</div> : <p className="op-muted">Nenhum ajuste relevante encontrado com os dados atuais.</p>}
    </div>}

    <style jsx>{`.artemis-menu-intelligence{display:grid;gap:14px;margin-bottom:22px;padding:18px;border:1px solid var(--op-line);border-radius:16px;background:var(--op-paper)}.artemis-menu-intelligence-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.artemis-menu-intelligence-head h2{margin:4px 0 6px;font-size:20px}.artemis-menu-intelligence-head p{margin:0;color:var(--op-muted);max-width:720px}.artemis-menu-review{display:grid;gap:12px}.artemis-menu-review-summary{display:flex;gap:9px;align-items:center;padding:11px 13px;border-radius:11px;background:var(--op-soft)}.artemis-menu-review-summary small{margin-left:auto;color:var(--op-muted)}.artemis-menu-review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.artemis-menu-review-grid article{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:13px;border:1px solid var(--op-line);border-radius:12px}.artemis-menu-review-grid article>.op-actions{grid-column:2}.artemis-menu-review-grid strong{display:block}.artemis-menu-review-grid small{display:block;color:var(--op-muted);margin-top:3px}.artemis-menu-review-grid p{margin:7px 0 0;color:var(--op-muted);line-height:1.45}.artemis-menu-review-icon{width:32px;height:32px;border-radius:9px;background:var(--op-soft);display:grid;place-items:center}.artemis-variant-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.artemis-variant-chips span{padding:5px 8px;border-radius:999px;background:var(--op-soft);font-size:12px}.op-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:720px){.artemis-menu-intelligence-head{display:grid}.artemis-menu-review-summary{align-items:flex-start;flex-wrap:wrap}.artemis-menu-review-summary small{margin-left:0;width:100%}}`}</style>
  </section>;
}
