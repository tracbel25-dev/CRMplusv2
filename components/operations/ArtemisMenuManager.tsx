'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Product } from '@/lib/operations/model';
import { cents, money, uid } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { buildOperationalFormMass } from '@/lib/ai/formMass';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { deleteOperationalFile, uploadOperationalFile } from '@/lib/r2/client';
import { OperationalR2Image } from './OperationalR2Image';
import { Badge, Button, Empty, Modal, SearchBox, Title } from './ui';

export type ArtemisProduct = Product & { imageObjectKey?: string };

type Draft = {
  id: string;
  name: string;
  category: string;
  price: string;
  preparation: string;
  description: string;
  allergens: string;
  stockControlled: boolean;
  minimum: string;
  imageObjectKey: string;
};

type AISuggestionState = {
  interactionId: string;
  values: Record<string, string>;
  selected: Record<string, boolean>;
  lessonsUsed: number;
  massUsed: number;
};

const suggestionLabels: Record<string, string> = {
  category: 'Categoria',
  description: 'Descrição',
  allergens: 'Ingredientes e alergênicos',
  preparation: 'Preparo estimado',
};

function productWithImage(product: Product): ArtemisProduct {
  return product as ArtemisProduct;
}

async function accessToken() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

function makeDraft(product?: Product): Draft {
  const current = product ? productWithImage(product) : undefined;
  return {
    id: product?.id || uid(),
    name: product?.name || '',
    category: product?.category || '',
    price: product ? String(product.price / 100) : '',
    preparation: product ? String(product.preparation || '') : '',
    description: product?.description || '',
    allergens: product?.allergens || '',
    stockControlled: product?.stockControlled || false,
    minimum: product ? String(product.minimum || 0) : '0',
    imageObjectKey: current?.imageObjectKey || '',
  };
}

function ImagePreview({ objectKey, preview, name }: { objectKey: string; preview: string; name: string }) {
  if (preview) return <img src={preview} alt={name || 'Prévia do produto'} />;
  if (objectKey) return <OperationalR2Image app="artemis" storedData={`r2:${objectKey}`} alt={name || 'Imagem do produto'} />;
  return <div className="artemis-product-image-empty"><ImagePlus size={28} /><span>Sem imagem</span></div>;
}

function ProductEditor({ w, product, onClose }: { w: Workspace; product?: Product; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => makeDraft(product));
  const originalKey = product ? productWithImage(product).imageObjectKey || '' : '';
  const [preview, setPreview] = useState('');
  const [uploadedKey, setUploadedKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AISuggestionState | null>(null);
  const [appliedAI, setAppliedAI] = useState<{ interactionId: string; fields: string[] } | null>(null);

  const set = (name: keyof Draft, value: string | boolean) => setDraft(current => ({ ...current, [name]: value }));

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadOperationalFile('artemis', file, { purpose: 'product-image', resourceId: draft.id });
      if (uploadedKey && uploadedKey !== originalKey && uploadedKey !== result.key) {
        await deleteOperationalFile('artemis', uploadedKey).catch(() => undefined);
      }
      setUploadedKey(result.key);
      setPreview(result.url);
      set('imageObjectKey', result.key);
      w.setNotice('Imagem enviada. Salve o produto para concluir a alteração.');
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setPreview('');
    set('imageObjectKey', '');
  };

  const close = async () => {
    if (uploadedKey && uploadedKey !== originalKey) await deleteOperationalFile('artemis', uploadedKey).catch(() => undefined);
    onClose();
  };

  const suggest = async () => {
    if (!draft.name.trim() && !draft.category.trim()) {
      w.setNotice('Informe pelo menos o nome ou a categoria antes de pedir sugestões.');
      return;
    }
    setAiBusy(true);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Entre com a conta do restaurante para usar a IA.');
      const values = {
        name: draft.name.trim(),
        category: draft.category.trim(),
        description: draft.description.trim(),
        allergens: draft.allergens.trim(),
        preparation: draft.preparation.trim(),
      };
      const response = await fetch('/api/ai/artemis/fill', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          fieldNames: ['category', 'description', 'allergens', 'preparation'],
          values,
          mass: buildOperationalFormMass('artemis', w.data),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível gerar sugestões.');
      const suggestions = payload?.suggestions && typeof payload.suggestions === 'object' ? payload.suggestions as Record<string, unknown> : {};
      const clean = Object.fromEntries(Object.entries(suggestions)
        .filter(([name, value]) => ['category', 'description', 'allergens', 'preparation'].includes(name) && String(value || '').trim())
        .map(([name, value]) => [name, String(value).trim()]));
      if (!Object.keys(clean).length) {
        w.setNotice('A IA não encontrou uma sugestão útil para estes dados.');
        return;
      }
      const currentValues: Record<string, string> = {
        category: draft.category,
        description: draft.description,
        allergens: draft.allergens,
        preparation: draft.preparation,
      };
      setAi({
        interactionId: String(payload.interactionId || ''),
        values: clean,
        selected: Object.fromEntries(Object.keys(clean).map(name => [name, !currentValues[name]?.trim()])),
        lessonsUsed: Number(payload?.memory?.lessonsUsed || 0),
        massUsed: Number(payload?.memory?.massUsed || 0),
      });
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível usar a IA agora.');
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestions = () => {
    if (!ai) return;
    const applied: string[] = [];
    setDraft(current => {
      const next = { ...current };
      for (const [name, value] of Object.entries(ai.values)) {
        if (!ai.selected[name]) continue;
        if (name === 'category') next.category = value;
        if (name === 'description') next.description = value;
        if (name === 'allergens') next.allergens = value;
        if (name === 'preparation') next.preparation = value.replace(/[^0-9]/g, '').slice(0, 4);
        applied.push(name);
      }
      return next;
    });
    if (ai.interactionId && applied.length) setAppliedAI({ interactionId: ai.interactionId, fields: applied });
    setAi(null);
    w.setNotice('Sugestões aplicadas. Revise e edite o que quiser antes de salvar.');
  };

  const feedbackAfterSave = async () => {
    if (!appliedAI?.interactionId) return;
    const token = await accessToken().catch(() => '');
    if (!token) return;
    const correctedText = appliedAI.fields.map(name => {
      const value = name === 'category' ? draft.category : name === 'description' ? draft.description : name === 'allergens' ? draft.allergens : draft.preparation;
      return `${name}: ${value}`;
    }).join('\n');
    if (correctedText.length < 8) return;
    await fetch('/api/ai/artemis/feedback', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ interactionId: appliedAI.interactionId, correctedText }),
    }).catch(() => undefined);
  };

  const save = async () => {
    const name = draft.name.trim();
    const category = draft.category.trim();
    if (!name || !category) { w.setError('Informe nome e categoria.'); return; }
    const priceValue = Number(String(draft.price).replace(',', '.'));
    if (!Number.isFinite(priceValue) || priceValue < 0) { w.setError('Informe um preço válido.'); return; }
    setSaving(true);
    const ok = await w.mutate(data => {
      const previous = data.products.find(item => item.id === draft.id);
      const value = {
        id: draft.id,
        name,
        category,
        price: cents(priceValue),
        description: draft.description.trim(),
        allergens: draft.allergens.trim(),
        preparation: Math.max(0, Math.round(Number(draft.preparation) || 0)),
        stockControlled: draft.stockControlled,
        stock: previous?.stock || 0,
        minimum: Math.max(0, Number(draft.minimum) || 0),
        available: previous?.available ?? true,
        imageObjectKey: draft.imageObjectKey || undefined,
      } as ArtemisProduct;
      const index = data.products.findIndex(item => item.id === value.id);
      if (index < 0) data.products.push(value); else data.products[index] = value;
    }, product ? 'Produto atualizado.' : 'Produto cadastrado.');
    if (ok) {
      if (originalKey && originalKey !== draft.imageObjectKey) await deleteOperationalFile('artemis', originalKey).catch(() => undefined);
      await feedbackAfterSave();
      setUploadedKey('');
      onClose();
    }
    setSaving(false);
  };

  return <div className="artemis-product-editor">
    <div className="artemis-product-editor-grid">
      <div className="artemis-product-image-field">
        <div className="artemis-product-image-preview"><ImagePreview objectKey={draft.imageObjectKey} preview={preview} name={draft.name} /></div>
        <div className="op-actions">
          <label className={`op-button secondary ${uploading ? 'disabled' : ''}`}><ImagePlus size={16} />{uploading ? 'Enviando…' : draft.imageObjectKey ? 'Trocar imagem' : 'Adicionar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={uploadImage} /></label>
          {draft.imageObjectKey && <Button variant="text" onClick={removeImage}><Trash2 size={16} />Remover</Button>}
        </div>
        <small className="op-muted">JPG, PNG ou WEBP. Arquivo privado no R2 do Artemis.</small>
      </div>

      <div className="artemis-product-fields">
        <div className="op-fields">
          <label className="op-field"><span>Nome *</span><input value={draft.name} onChange={event => set('name', event.target.value)} /></label>
          <label className="op-field"><span>Categoria *</span><input value={draft.category} onChange={event => set('category', event.target.value)} placeholder="Ex.: Pizza, Bebidas" /><small>Uma categoria nova é criada automaticamente ao salvar.</small></label>
          <label className="op-field"><span>Preço (R$) *</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => set('price', event.target.value)} /><small>O preço é sempre manual. A IA não recebe nem sugere valores.</small></label>
          <label className="op-field"><span>Preparo estimado (min)</span><input type="number" min="0" step="1" value={draft.preparation} onChange={event => set('preparation', event.target.value)} /></label>
          <label className="op-field wide"><span>Descrição</span><textarea rows={3} value={draft.description} onChange={event => set('description', event.target.value)} /></label>
          <label className="op-field wide"><span>Ingredientes e alergênicos</span><textarea rows={3} value={draft.allergens} onChange={event => set('allergens', event.target.value)} placeholder="Confirme sempre as sugestões antes de salvar." /></label>
          <label className="op-field"><span>Controlar estoque</span><select value={draft.stockControlled ? 'sim' : 'nao'} onChange={event => set('stockControlled', event.target.value === 'sim')}><option value="nao">Não</option><option value="sim">Sim</option></select></label>
          <label className="op-field"><span>Estoque mínimo</span><input type="number" min="0" step="0.01" value={draft.minimum} onChange={event => set('minimum', event.target.value)} /></label>
        </div>

        <div className="artemis-ai-action">
          <Button variant="secondary" disabled={aiBusy} onClick={() => void suggest()}><Sparkles size={17} />{aiBusy ? 'Pensando…' : 'Sugerir com IA'}</Button>
          <small>Usa apenas contexto sanitizado deste restaurante. Preço nunca é enviado.</small>
        </div>
      </div>
    </div>

    {ai && <section className="artemis-ai-suggestions" aria-label="Sugestões da IA">
      <div className="artemis-ai-suggestions-head"><div><span className="op-kicker">Assistência de IA</span><h3>Sugestões para este produto</h3><small>{ai.massUsed} padrão(ões) do restaurante · {ai.lessonsUsed} aprendizado(s) privado(s)</small></div><button className="op-icon" aria-label="Fechar sugestões" onClick={() => setAi(null)}><X size={18} /></button></div>
      <div className="artemis-ai-suggestion-list">{Object.entries(ai.values).map(([name, value]) => <label key={name}><input type="checkbox" checked={ai.selected[name] === true} onChange={event => setAi(current => current ? { ...current, selected: { ...current.selected, [name]: event.target.checked } } : current)} /><span><strong>{suggestionLabels[name] || name}</strong><small>{name === 'preparation' ? `${value} min` : value}</small></span></label>)}</div>
      <p className="op-muted">Campos já preenchidos começam desmarcados para não sobrescrever seu texto sem escolha explícita.</p>
      <div className="op-actions"><Button variant="secondary" onClick={() => setAi(null)}>Ignorar</Button><Button onClick={applySuggestions}>Aplicar selecionados</Button></div>
    </section>}

    <div className="op-form-footer"><Button variant="secondary" disabled={saving} onClick={() => void close()}>Cancelar</Button><Button disabled={saving || uploading} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar produto'}</Button></div>

    <style jsx>{`
      .artemis-product-editor{display:grid;gap:18px}.artemis-product-editor-grid{display:grid;grid-template-columns:minmax(220px,280px) 1fr;gap:22px}.artemis-product-image-field{display:grid;align-content:start;gap:10px}.artemis-product-image-preview{aspect-ratio:4/3;border:1px solid var(--op-line);border-radius:14px;overflow:hidden;background:var(--op-soft)}.artemis-product-image-preview :global(img){width:100%;height:100%;object-fit:cover}.artemis-product-image-empty{height:100%;display:grid;place-items:center;align-content:center;gap:8px;color:var(--op-muted)}.artemis-product-fields{display:grid;gap:14px}.artemis-ai-action{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding-top:4px}.artemis-ai-action small{color:var(--op-muted)}.artemis-ai-suggestions{display:grid;gap:14px;padding:16px;border:1px solid var(--op-line);border-radius:14px;background:var(--op-soft)}.artemis-ai-suggestions-head{display:flex;justify-content:space-between;gap:12px}.artemis-ai-suggestions-head h3{margin:4px 0}.artemis-ai-suggestion-list{display:grid;gap:8px}.artemis-ai-suggestion-list label{display:grid;grid-template-columns:22px 1fr;gap:10px;padding:11px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper)}.artemis-ai-suggestion-list small{display:block;margin-top:4px;line-height:1.45}.disabled{pointer-events:none;opacity:.6}@media(max-width:760px){.artemis-product-editor-grid{grid-template-columns:1fr}.artemis-product-image-field{max-width:none}}
    `}</style>
  </div>;
}

export function ArtemisMenuManager({ w }: { w: Workspace }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const products = w.data.products.map(productWithImage);
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(item => item.category).filter(Boolean)))], [products]);
  const visible = products.filter(item => (category === 'Todos' || item.category === category) && `${item.name} ${item.category} ${item.description} ${item.allergens}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));

  return <>
    <Title eyebrow="Catálogo do restaurante" title="O que a casa serve" action={<><Link className="op-button secondary" href="/artemis/cardapio-digital">Ver cardápio</Link><Button onClick={() => setEditing('new')}><Plus size={18} />Novo produto</Button></>} />
    <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar produto ou ingrediente" /><div className="op-tabs">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
    <div className="artemis-menu">{visible.map(item => <article key={item.id} className={`artemis-menu-item ${!item.available ? 'unavailable' : ''}`}>
      <div className="artemis-catalog-image"><ImagePreview objectKey={item.imageObjectKey || ''} preview="" name={item.name} /></div>
      <span className="op-kicker">{item.category}</span><h2>{item.name}</h2><p>{item.description || 'Sem descrição cadastrada.'}</p>{item.allergens && <small>Ingredientes / alergênicos: {item.allergens}</small>}
      <div><strong>{money(item.price)}</strong><span className="op-muted">{item.preparation > 0 ? `${item.preparation} min` : ''}</span></div>
      <footer><Button variant="secondary" onClick={() => setEditing(item)}>Editar</Button><button className="op-toggle" aria-pressed={item.available} onClick={() => w.mutate(data => { const product = data.products.find(current => current.id === item.id)!; product.available = !product.available; })}><i />{item.available ? 'Disponível' : 'Indisponível'}</button></footer>
    </article>)}</div>
    {!visible.length && <Empty>{products.length ? 'Nenhum produto encontrado nesta seleção.' : 'Cadastre o primeiro produto do cardápio.'}</Empty>}
    {editing && <Modal title={editing === 'new' ? 'Novo produto' : 'Editar produto'} wide onClose={() => setEditing(null)}><ProductEditor w={w} product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /></Modal>}
    <style jsx>{`.artemis-catalog-image{width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:var(--op-soft);margin-bottom:10px}.artemis-catalog-image :global(img){width:100%;height:100%;object-fit:cover}.artemis-product-image-empty{height:100%;display:grid;place-items:center;align-content:center;gap:7px;color:var(--op-muted)}`}</style>
  </>;
}
