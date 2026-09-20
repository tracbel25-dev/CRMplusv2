'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Product, ProductVariant } from '@/lib/operations/model';
import { cents, localDay, money, productSoldOutToday, uid } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { buildOperationalFormMass } from '@/lib/ai/formMass';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { deleteOperationalFile, uploadOperationalFile } from '@/lib/r2/client';
import { OperationalR2Image } from './OperationalR2Image';
import { useOperationPreferences } from '@/lib/operations/configuration';
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
  dailyLimit: string;
};

type VariantDraft = { id: string; name: string; price: string; available: boolean; free: boolean; soldOutUntil: string };

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
    dailyLimit: product?.dailyLimit ? String(product.dailyLimit) : '',
  };
}

function ImagePreview({ objectKey, preview, name }: { objectKey: string; preview: string; name: string }) {
  if (preview) return <img src={preview} alt={name || 'Prévia do produto'} />;
  if (objectKey) return <OperationalR2Image app="artemis" storedData={`r2:${objectKey}`} alt={name || 'Imagem do produto'} />;
  return <div className="artemis-product-image-empty"><ImagePlus size={28} /><span>Sem imagem</span></div>;
}

function ProductEditor({ w, product, onClose }: { w: Workspace; product?: Product; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => makeDraft(product));
  const [tab, setTab] = useState<'dados' | 'foto' | 'tamanhos' | 'adicionais'>('dados');
  const [variants, setVariants] = useState<VariantDraft[]>(() => (product?.variants || []).map(item => ({
    id: item.id,
    name: item.name,
    price: String(item.price / 100),
    available: item.available !== false,
    free: item.price === 0,
    soldOutUntil: item.soldOutUntil || '',
  })));
  const originalKey = product ? productWithImage(product).imageObjectKey || '' : '';
  const [preview, setPreview] = useState('');
  const [uploadedKey, setUploadedKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [ai, setAi] = useState<AISuggestionState | null>(null);
  const [appliedAI, setAppliedAI] = useState<{ interactionId: string; fields: string[] } | null>(null);

  const set = (name: keyof Draft, value: string | boolean) => setDraft(current => ({ ...current, [name]: value }));
  const addVariant = () => setVariants(current => [...current, { id: uid(), name: '', price: '', available: true, free: false, soldOutUntil: '' }]);
  const updateVariant = (id: string, patch: Partial<VariantDraft>) => setVariants(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const removeVariant = (id: string) => setVariants(current => current.filter(item => item.id !== id));

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

  const validatedVariants = (): ProductVariant[] | null => {
    const named = variants.filter(item => item.name.trim());
    const output: ProductVariant[] = [];
    for (const row of named) {
      const raw = row.price.trim();
      if (!row.free && !raw) {
        w.setError(`Informe o preço da opção ${row.name.trim()} ou marque “Grátis”.`);
        setTab('tamanhos');
        return null;
      }
      const value = row.free ? 0 : Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) {
        w.setError(`Informe um preço válido para ${row.name.trim()}.`);
        setTab('tamanhos');
        return null;
      }
      output.push({ id: row.id, name: row.name.trim(), price: cents(value), available: row.available, soldOutUntil: row.soldOutUntil || undefined });
    }
    return output;
  };

  const save = async () => {
    const name = draft.name.trim();
    const category = draft.category.trim();
    if (!name || !category) { w.setError('Informe nome e categoria.'); setTab('dados'); return; }
    if (!draft.price.trim()) { w.setError('Informe o preço do produto. Campo vazio não pode virar R$ 0,00.'); setTab('dados'); return; }
    const priceValue = Number(draft.price.replace(',', '.'));
    if (!Number.isFinite(priceValue) || priceValue < 0) { w.setError('Informe um preço válido.'); setTab('dados'); return; }
    const savedVariants = validatedVariants();
    if (!savedVariants) return;
    const rawDailyLimit = draft.dailyLimit.trim();
    const dailyLimit = rawDailyLimit ? Number(rawDailyLimit.replace(',', '.')) : 0;
    if (rawDailyLimit && (!Number.isFinite(dailyLimit) || dailyLimit <= 0 || !Number.isInteger(dailyLimit))) {
      w.setError('A quantidade disponível hoje precisa ser um número inteiro maior que zero.');
      setTab('adicionais');
      return;
    }

    setSaving(true);
    const ok = await w.mutate(data => {
      const previous = data.products.find(item => item.id === draft.id);
      const nextDailyLimit = rawDailyLimit ? dailyLimit : undefined;
      let stock = previous?.stock || 0;
      let dailyStockDate = previous?.dailyStockDate;
      if (nextDailyLimit && (previous?.dailyLimit !== nextDailyLimit || dailyStockDate !== localDay())) {
        stock = nextDailyLimit;
        dailyStockDate = localDay();
      }
      const value = {
        ...(previous || {}),
        id: draft.id,
        name,
        category,
        price: cents(priceValue),
        description: draft.description.trim(),
        allergens: draft.allergens.trim(),
        preparation: Math.max(0, Math.round(Number(draft.preparation) || 0)),
        stockControlled: draft.stockControlled || !!nextDailyLimit,
        stock,
        minimum: Math.max(0, Number(draft.minimum) || 0),
        available: previous?.available ?? true,
        variants: savedVariants,
        dailyLimit: nextDailyLimit,
        dailyStockDate: nextDailyLimit ? dailyStockDate : undefined,
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
    <nav className="artemis-product-tabs" aria-label="Edição do produto">
      {[
        ['dados', 'Dados'],
        ['foto', 'Foto'],
        ['tamanhos', 'Tamanhos e opções'],
        ['adicionais', 'Adicionais'],
      ].map(([id, label]) => <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as typeof tab)}>{label}</button>)}
    </nav>

    {tab === 'dados' && <div className="artemis-product-fields">
      <div className="op-fields">
        <label className="op-field"><span>Nome *</span><input value={draft.name} onChange={event => set('name', event.target.value)} /></label>
        <label className="op-field"><span>Categoria *</span><input value={draft.category} onChange={event => set('category', event.target.value)} placeholder="Ex.: Pizza, Bebidas" /><small>Uma categoria nova é criada automaticamente ao salvar.</small></label>
        <label className="op-field"><span>Preço base (R$) *</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => set('price', event.target.value)} /><small>Campo vazio é inválido. Para produto gratuito, digite 0 explicitamente.</small></label>
        <label className="op-field wide"><span>Descrição</span><textarea rows={3} value={draft.description} onChange={event => set('description', event.target.value)} /></label>
      </div>
      <div className="artemis-ai-action">
        <Button variant="secondary" disabled={aiBusy} onClick={() => void suggest()}><Sparkles size={17} />{aiBusy ? 'Pensando…' : 'Sugerir com IA'}</Button>
        <small>A IA ajuda no preenchimento, mas não define preço nem publica alterações sozinha.</small>
      </div>
    </div>}

    {tab === 'foto' && <div className="artemis-product-image-field">
      <div className="artemis-product-image-preview"><ImagePreview objectKey={draft.imageObjectKey} preview={preview} name={draft.name} /></div>
      <div className="op-actions">
        <label className={`op-button secondary ${uploading ? 'disabled' : ''}`}><ImagePlus size={16} />{uploading ? 'Enviando…' : draft.imageObjectKey ? 'Trocar imagem' : 'Adicionar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={uploadImage} /></label>
        {draft.imageObjectKey && <Button variant="text" onClick={removeImage}><Trash2 size={16} />Remover</Button>}
      </div>
      <small className="op-muted">JPG, PNG ou WEBP. Arquivo privado no R2 do Artemis.</small>
    </div>}

    {tab === 'tamanhos' && <section className="artemis-variant-editor">
      <div><strong>Tamanhos e opções</strong><p className="op-muted">Cada opção mantém preço e disponibilidade próprios. O cliente só enxerga opções ativas.</p></div>
      <div className="artemis-variant-list">
        {variants.map(row => <div key={row.id} className="artemis-variant-row">
          <label><span>Nome</span><input value={row.name} onChange={event => updateVariant(row.id, { name: event.target.value })} placeholder="Ex.: Grande" /></label>
          <label><span>Preço (R$)</span><input type="number" min="0" step="0.01" value={row.price} disabled={row.free} onChange={event => updateVariant(row.id, { price: event.target.value })} placeholder={row.free ? '0,00' : 'Obrigatório'} /></label>
          <label className="artemis-check"><input type="checkbox" checked={row.free} onChange={event => updateVariant(row.id, { free: event.target.checked, price: event.target.checked ? '0' : row.price })} /><span>Grátis</span></label>
          <label className="artemis-check"><input type="checkbox" checked={row.available} onChange={event => updateVariant(row.id, { available: event.target.checked })} /><span>Disponível</span></label>
          <label className="artemis-check"><input type="checkbox" checked={row.soldOutUntil === localDay()} onChange={event => updateVariant(row.id, { soldOutUntil: event.target.checked ? localDay() : '' })} /><span>Esgotado hoje</span></label>
          <button className="op-icon" type="button" onClick={() => removeVariant(row.id)} aria-label={`Remover ${row.name || 'opção'}`}><Trash2 size={17} /></button>
        </div>)}
        {!variants.length && <p className="op-muted">Sem variações. O produto será vendido apenas pelo preço base.</p>}
      </div>
      <Button variant="secondary" onClick={addVariant}><Plus size={16} />Adicionar tamanho ou opção</Button>
    </section>}

    {tab === 'adicionais' && <div className="op-fields">
      <label className="op-field"><span>Preparo estimado (min)</span><input type="number" min="0" step="1" value={draft.preparation} onChange={event => set('preparation', event.target.value)} /></label>
      <label className="op-field wide"><span>Ingredientes e alergênicos</span><textarea rows={3} value={draft.allergens} onChange={event => set('allergens', event.target.value)} placeholder="Confirme sempre as sugestões antes de salvar." /></label>
      <label className="op-field"><span>Controlar estoque</span><select value={draft.stockControlled ? 'sim' : 'nao'} onChange={event => set('stockControlled', event.target.value === 'sim')}><option value="nao">Não</option><option value="sim">Sim</option></select></label>
      <label className="op-field"><span>Estoque mínimo</span><input type="number" min="0" step="0.01" value={draft.minimum} onChange={event => set('minimum', event.target.value)} /></label>
      <label className="op-field"><span>Quantidade disponível por dia</span><input type="number" min="1" step="1" value={draft.dailyLimit} onChange={event => set('dailyLimit', event.target.value)} placeholder="Ex.: 35" /><small>Opcional. Ao iniciar um novo dia, o saldo volta para essa quantidade.</small></label>
    </div>}

    {ai && <section className="artemis-ai-suggestions" aria-label="Sugestões da IA">
      <div className="artemis-ai-suggestions-head"><div><span className="op-kicker">Assistência de IA</span><h3>Sugestões para este produto</h3><small>{ai.massUsed} padrão(ões) do restaurante · {ai.lessonsUsed} aprendizado(s) privado(s)</small></div><button className="op-icon" aria-label="Fechar sugestões" onClick={() => setAi(null)}><X size={18} /></button></div>
      <div className="artemis-ai-suggestion-list">{Object.entries(ai.values).map(([name, value]) => <label key={name}><input type="checkbox" checked={ai.selected[name] === true} onChange={event => setAi(current => current ? { ...current, selected: { ...current.selected, [name]: event.target.checked } } : current)} /><span><strong>{suggestionLabels[name] || name}</strong><small>{name === 'preparation' ? `${value} min` : value}</small></span></label>)}</div>
      <p className="op-muted">Campos já preenchidos começam desmarcados para não sobrescrever seu texto sem escolha explícita.</p>
      <div className="op-actions"><Button variant="secondary" onClick={() => setAi(null)}>Ignorar</Button><Button onClick={applySuggestions}>Aplicar selecionados</Button></div>
    </section>}

    <div className="op-form-footer"><Button variant="secondary" disabled={saving} onClick={() => void close()}>Cancelar</Button><Button disabled={saving || uploading} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar produto'}</Button></div>

    <style jsx>{`
      .artemis-product-editor{display:grid;gap:18px}.artemis-product-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--op-line);padding-bottom:10px}.artemis-product-tabs button{border:0;background:transparent;color:var(--op-muted);padding:9px 11px;border-radius:9px}.artemis-product-tabs button.active{background:var(--op-soft);color:var(--op-ink);font-weight:700}.artemis-product-image-field{display:grid;align-content:start;gap:10px;max-width:520px}.artemis-product-image-preview{aspect-ratio:4/3;border:1px solid var(--op-line);border-radius:14px;overflow:hidden;background:var(--op-soft)}.artemis-product-image-preview :global(img){width:100%;height:100%;object-fit:cover}.artemis-product-image-empty{height:100%;display:grid;place-items:center;align-content:center;gap:8px;color:var(--op-muted)}.artemis-product-fields{display:grid;gap:14px}.artemis-ai-action{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding-top:4px}.artemis-ai-action small{color:var(--op-muted)}.artemis-ai-suggestions{display:grid;gap:14px;padding:16px;border:1px solid var(--op-line);border-radius:14px;background:var(--op-soft)}.artemis-ai-suggestions-head{display:flex;justify-content:space-between;gap:12px}.artemis-ai-suggestions-head h3{margin:4px 0}.artemis-ai-suggestion-list{display:grid;gap:8px}.artemis-ai-suggestion-list label{display:grid;grid-template-columns:22px 1fr;gap:10px;padding:11px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper)}.artemis-ai-suggestion-list small{display:block;margin-top:4px;line-height:1.45}.artemis-variant-editor{display:grid;gap:14px}.artemis-variant-list{display:grid;gap:10px}.artemis-variant-row{display:grid;grid-template-columns:minmax(150px,1fr) 160px auto auto auto 42px;gap:10px;align-items:end}.artemis-variant-row label{display:grid;gap:6px}.artemis-variant-row label>span{font-size:12px;color:var(--op-muted)}.artemis-variant-row input{width:100%}.artemis-check{display:flex!important;align-items:center;gap:7px;padding-bottom:9px}.artemis-check input{width:auto}.disabled{pointer-events:none;opacity:.6}@media(max-width:760px){.artemis-variant-row{grid-template-columns:1fr 1fr}.artemis-variant-row .op-icon{grid-column:2;justify-self:end}}
    `}</style>
  </div>;
}

export function ArtemisMenuManager({ w }: { w: Workspace }) {
  const operation = useOperationPreferences('artemis');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const products = w.data.products.map(productWithImage);
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(item => item.category).filter(Boolean)))], [products]);
  const visible = products.filter(item => (category === 'Todos' || item.category === category) && `${item.name} ${item.category} ${item.description} ${item.allergens}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));

  return <>
    <Title eyebrow="Catálogo do restaurante" title="O que a casa serve" action={<><Link className="op-button secondary" href="/artemis/cardapio-digital">Ver cardápio</Link><Button onClick={() => setEditing('new')}><Plus size={18} />Novo produto</Button></>} />
    <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar produto ou ingrediente" /><div className="op-tabs">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
    <div className="artemis-menu">{visible.map(item => { const soldOut = productSoldOutToday(item); return <article key={item.id} className={`artemis-menu-item ${!item.available || soldOut ? 'unavailable' : ''}`}>
      <div className="artemis-catalog-image"><ImagePreview objectKey={item.imageObjectKey || ''} preview="" name={item.name} /></div>
      <span className="op-kicker">{item.category}</span><h2>{item.name}</h2>{operation.fieldVisible('productDescription') && <p>{item.description || 'Sem descrição cadastrada.'}</p>}{operation.fieldVisible('ingredients') && item.allergens && <small>Ingredientes / alergênicos: {item.allergens}</small>}
      <div><strong>{money(item.price)}</strong><span className="op-muted">{operation.fieldVisible('prepTime') && item.preparation > 0 ? `${item.preparation} min` : ''}</span></div>
      {item.dailyLimit ? <small className="op-muted">Hoje: {Math.max(0, item.stock)} de {item.dailyLimit} disponível(is)</small> : null}
      <footer><Button variant="secondary" onClick={() => setEditing(item)}>Editar</Button><Button variant="text" onClick={() => w.mutate(data => { const current = data.products.find(product => product.id === item.id)!; current.soldOutUntil = soldOut ? '' : localDay(); }, soldOut ? 'Produto liberado novamente.' : 'Produto marcado como esgotado por hoje.')}>{soldOut ? 'Liberar hoje' : 'Esgotado por hoje'}</Button><button className="op-toggle" aria-pressed={item.available} onClick={() => w.mutate(data => { const product = data.products.find(current => current.id === item.id)!; product.available = !product.available; })}><i />{item.available ? 'Disponível' : 'Indisponível'}</button></footer>
    </article>; })}</div>
    {!visible.length && <Empty>{products.length ? 'Nenhum produto encontrado nesta seleção.' : 'Cadastre o primeiro produto do cardápio.'}</Empty>}
    {editing && <Modal title={editing === 'new' ? 'Novo produto' : 'Editar produto'} wide onClose={() => setEditing(null)}><ProductEditor w={w} product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /></Modal>}
    <style jsx>{`.artemis-catalog-image{width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:var(--op-soft);margin-bottom:10px}.artemis-catalog-image :global(img){width:100%;height:100%;object-fit:cover}.artemis-product-image-empty{height:100%;display:grid;place-items:center;align-content:center;gap:7px;color:var(--op-muted)}`}</style>
  </>;
}
