'use client';

import { useState } from 'react';
import { ListTree, Plus, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import type { Product } from '@/lib/operations/model';
import { cents, uid } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { Button, Modal } from './ui';

type ProductVariant = { id: string; name: string; price: number; available: boolean };
type ArtemisProduct = Product & { variants?: ProductVariant[] };
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
type VariantDraft = { id: string; name: string; price: string };

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

function productVariants(product: Product) {
  return ((product as ArtemisProduct).variants || []).filter(item => item && item.id && item.name);
}

function VariantEditor({ w, product, suggested, onClose }: { w: Workspace; product: Product; suggested: string[]; onClose: () => void }) {
  const existing = productVariants(product);
  const [rows, setRows] = useState<VariantDraft[]>(() => existing.length
    ? existing.map(item => ({ id: item.id, name: item.name, price: String(item.price / 100) }))
    : suggested.map(name => ({ id: uid(), name, price: '' }))
  );
  const [saving, setSaving] = useState(false);

  const add = () => setRows(current => [...current, { id: uid(), name: '', price: '' }]);
  const update = (id: string, field: 'name' | 'price', value: string) => setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
  const remove = (id: string) => setRows(current => current.filter(row => row.id !== id));

  const save = async () => {
    const named = rows.filter(row => row.name.trim());
    if (!named.length) { w.setError('Cadastre pelo menos uma opção ou use “Remover todas” para deixar o produto sem variações.'); return; }
    const variants: ProductVariant[] = [];
    for (const row of named) {
      const value = Number(row.price.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) { w.setError(`Informe o preço manual da opção ${row.name.trim()}.`); return; }
      variants.push({ id: row.id, name: row.name.trim(), price: cents(value), available: true });
    }
    setSaving(true);
    const ok = await w.mutate(data => {
      const current = data.products.find(item => item.id === product.id) as ArtemisProduct | undefined;
      if (!current) throw new Error('Produto não encontrado.');
      current.variants = variants;
    }, 'Opções do produto salvas.');
    setSaving(false);
    if (ok) onClose();
  };

  const clear = async () => {
    setSaving(true);
    const ok = await w.mutate(data => {
      const current = data.products.find(item => item.id === product.id) as ArtemisProduct | undefined;
      if (!current) throw new Error('Produto não encontrado.');
      current.variants = [];
    }, 'Variações removidas.');
    setSaving(false);
    if (ok) onClose();
  };

  return <div className="artemis-variant-editor">
    <p className="op-callout">A IA pode sugerir nomes de opções, mas <strong>não define preços</strong>. Preencha cada valor manualmente.</p>
    <div className="artemis-variant-list">
      {rows.map(row => <div key={row.id} className="artemis-variant-row">
        <label><span>Opção / tamanho</span><input value={row.name} onChange={event => update(row.id, 'name', event.target.value)} placeholder="Ex.: Média" /></label>
        <label><span>Preço (R$)</span><input type="number" min="0" step="0.01" value={row.price} onChange={event => update(row.id, 'price', event.target.value)} placeholder="Manual" /></label>
        <button className="op-icon" type="button" onClick={() => remove(row.id)} aria-label={`Remover ${row.name || 'opção'}`}><Trash2 size={17} /></button>
      </div>)}
      {!rows.length && <p className="op-muted">Nenhuma opção cadastrada. Adicione tamanhos, volumes ou outras variações quando fizer sentido para este produto.</p>}
    </div>
    <div className="op-actions"><Button variant="secondary" onClick={add}><Plus size={16} />Adicionar opção</Button>{existing.length > 0 && <Button variant="text" disabled={saving} onClick={() => void clear()}>Remover todas</Button>}</div>
    <div className="op-form-footer"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button disabled={saving || !rows.some(row => row.name.trim())} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar opções'}</Button></div>
    <style jsx>{`.artemis-variant-editor{display:grid;gap:16px}.artemis-variant-list{display:grid;gap:10px}.artemis-variant-row{display:grid;grid-template-columns:1fr 180px 42px;gap:10px;align-items:end}.artemis-variant-row label{display:grid;gap:6px}.artemis-variant-row label span{font-size:12px;color:var(--op-muted)}.artemis-variant-row input{width:100%;border:1px solid var(--op-line);border-radius:10px;padding:10px;background:var(--op-paper);color:inherit}@media(max-width:700px){.artemis-variant-row{grid-template-columns:1fr 1fr 42px}}`}</style>
  </div>;
}

export function ArtemisMenuIntelligence({ w }: { w: Workspace }) {
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [configuring, setConfiguring] = useState<{ product: Product; suggested: string[] } | null>(null);
  const [manualProductId, setManualProductId] = useState(() => w.data.products[0]?.id || '');

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

  const configureVariants = (suggestion: ReviewSuggestion) => {
    const product = w.data.products.find(item => item.id === suggestion.productId);
    if (!product) { w.setError('Produto sugerido não foi encontrado.'); return; }
    setConfiguring({ product, suggested: suggestion.variantNames || [] });
  };

  const openManualVariants = () => {
    const fallbackId = manualProductId || w.data.products[0]?.id || '';
    const product = w.data.products.find(item => item.id === fallbackId);
    if (!product) { w.setNotice('Cadastre um produto antes de configurar opções.'); return; }
    setConfiguring({ product, suggested: [] });
  };

  const productName = (id?: string) => w.data.products.find(item => item.id === id)?.name || '';
  const selectedManualId = w.data.products.some(item => item.id === manualProductId) ? manualProductId : (w.data.products[0]?.id || '');

  return <>
    <section className="artemis-menu-intelligence">
      <div className="artemis-menu-intelligence-head">
        <div><span className="op-kicker">Cardápio inteligente</span><h2>Revisar organização com IA</h2><p>A IA observa o que já foi cadastrado e procura lacunas como tamanhos, opções, categorias confusas e produtos incompletos.</p></div>
        <Button variant="secondary" disabled={busy} onClick={() => void runReview()}><Sparkles size={17} />{busy ? 'Analisando…' : 'Revisar cardápio'}</Button>
      </div>

      {w.data.products.length > 0 && <div className="artemis-manual-options">
        <div><strong>Opções e tamanhos</strong><small>Você também pode gerenciar manualmente as variações de qualquer produto.</small></div>
        <select value={selectedManualId} onChange={event => setManualProductId(event.target.value)}>{w.data.products.map(product => <option key={product.id} value={product.id}>{product.name}{productVariants(product).length ? ` · ${productVariants(product).length} opção(ões)` : ''}</option>)}</select>
        <Button variant="secondary" onClick={openManualVariants}>Gerenciar opções</Button>
      </div>}

      {review && <div className="artemis-menu-review">
        <div className="artemis-menu-review-summary"><WandSparkles size={18} /><span>{review.summary || 'Revisão concluída.'}</span>{Number(review.memory?.lessonsUsed || 0) > 0 && <small>{review.memory?.lessonsUsed} aprendizado(s) privado(s) considerado(s)</small>}</div>
        {review.suggestions.length ? <div className="artemis-menu-review-grid">{review.suggestions.map((suggestion, index) => <article key={`${suggestion.kind}-${suggestion.productId || index}-${index}`}>
          <div className="artemis-menu-review-icon">{suggestion.kind === 'category' || suggestion.kind === 'organization' ? <ListTree size={18} /> : <Sparkles size={18} />}</div>
          <div><strong>{suggestion.title}</strong>{suggestion.productId && <small>{productName(suggestion.productId)}</small>}<p>{suggestion.reason}</p>{suggestion.variantNames?.length ? <div className="artemis-variant-chips">{suggestion.variantNames.map(name => <span key={name}>{name}</span>)}</div> : null}</div>
          <div className="op-actions">
            {suggestion.kind === 'variants' && suggestion.productId && <Button variant="secondary" onClick={() => configureVariants(suggestion)}>Configurar opções</Button>}
            {suggestion.kind === 'category' && suggestion.suggestedCategory && <Button variant="secondary" onClick={() => void applyCategory(suggestion)}>Aplicar categoria</Button>}
          </div>
        </article>)}</div> : <p className="op-muted">Nenhum ajuste relevante encontrado com os dados atuais.</p>}
      </div>}
    </section>
    {configuring && <Modal title={`Opções · ${configuring.product.name}`} wide onClose={() => setConfiguring(null)}><VariantEditor w={w} product={configuring.product} suggested={configuring.suggested} onClose={() => setConfiguring(null)} /></Modal>}
    <style jsx>{`.artemis-menu-intelligence{display:grid;gap:14px;margin-bottom:22px;padding:18px;border:1px solid var(--op-line);border-radius:16px;background:var(--op-paper)}.artemis-menu-intelligence-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.artemis-menu-intelligence-head h2{margin:4px 0 6px;font-size:20px}.artemis-menu-intelligence-head p{margin:0;color:var(--op-muted);max-width:720px}.artemis-manual-options{display:grid;grid-template-columns:1fr minmax(190px,260px) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-soft)}.artemis-manual-options small{display:block;color:var(--op-muted);margin-top:3px}.artemis-manual-options select{width:100%;padding:10px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:inherit}.artemis-menu-review{display:grid;gap:12px}.artemis-menu-review-summary{display:flex;gap:9px;align-items:center;padding:11px 13px;border-radius:11px;background:var(--op-soft)}.artemis-menu-review-summary small{margin-left:auto;color:var(--op-muted)}.artemis-menu-review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.artemis-menu-review-grid article{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:13px;border:1px solid var(--op-line);border-radius:12px}.artemis-menu-review-grid article>.op-actions{grid-column:2}.artemis-menu-review-grid strong{display:block}.artemis-menu-review-grid small{display:block;color:var(--op-muted);margin-top:3px}.artemis-menu-review-grid p{margin:7px 0 0;color:var(--op-muted);line-height:1.45}.artemis-menu-review-icon{width:32px;height:32px;border-radius:9px;background:var(--op-soft);display:grid;place-items:center}.artemis-variant-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.artemis-variant-chips span{padding:5px 8px;border-radius:999px;background:var(--op-soft);font-size:12px}.op-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:720px){.artemis-menu-intelligence-head{display:grid}.artemis-menu-review-summary{align-items:flex-start;flex-wrap:wrap}.artemis-menu-review-summary small{margin-left:0;width:100%}.artemis-manual-options{grid-template-columns:1fr}}`}</style>
  </>;
}
