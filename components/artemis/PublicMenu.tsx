'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, CheckCircle2, Minus, Plus, Search, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { OperationalR2Image } from '@/components/operations/OperationalR2Image';
import './public-menu.css';

type ProductVariant = { id: string; name: string; price: number; available: boolean };
export type PublicMenuProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  allergens: string;
  preparation_minutes: number;
  image_url?: string;
  imageObjectKey?: string;
  variants?: ProductVariant[];
};

export type PublicMenuPayload = {
  restaurant: {
    name: string;
    phone: string;
    address: string;
    onlinePaused: boolean;
    deliveryFee: number;
    minimumOrder: number;
    deliveryAreas: string;
    hours: string;
    physicalEnabled: boolean;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
  };
  table: { id: string; name: string } | null;
  products: PublicMenuProduct[];
};

type CartLine = { id: string; productId: string; quantity: number; note: string; variantId: string };
type Props = { slug: string; mode: 'menu' | 'delivery'; previewPayload?: PublicMenuPayload; preview?: boolean };

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const variantsOf = (product: PublicMenuProduct) => (Array.isArray(product.variants) ? product.variants : []).filter(item => item && item.available !== false && item.id && item.name && Number.isFinite(Number(item.price)));

function ProductMedia({ product }: { product: PublicMenuProduct }) {
  if (product.image_url) return <div className="public-product-media"><img src={product.image_url} alt={product.name} /></div>;
  if (product.imageObjectKey) return <div className="public-product-media"><OperationalR2Image app="artemis" storedData={`r2:${product.imageObjectKey}`} alt={product.name} /></div>;
  const initials = product.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <div className="public-product-media is-placeholder" aria-hidden="true"><span>{initials || 'AR'}</span></div>;
}

export function PublicMenu({ slug, mode, previewPayload, preview = false }: Props) {
  const searchParams = useSearchParams();
  const tableId = searchParams.get('mesa') || '';
  const [payload, setPayload] = useState<PublicMenuPayload | null>(previewPayload || null);
  const [loading, setLoading] = useState(!previewPayload);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [requestKey, setRequestKey] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [channel, setChannel] = useState<'Mesa' | 'Delivery' | 'Retirada'>(mode === 'delivery' ? 'Delivery' : 'Mesa');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{ number: number; total_cents: number } | null>(null);

  useEffect(() => {
    if (previewPayload) {
      setPayload(previewPayload);
      setLoading(false);
      setError('');
      return;
    }
    let active = true;
    setLoading(true);
    const qs = tableId ? `?mesa=${encodeURIComponent(tableId)}` : '';
    fetch(`/api/artemis/public/${encodeURIComponent(slug)}${qs}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || 'Cardápio indisponível.');
        return body as PublicMenuPayload;
      })
      .then(body => {
        if (!active) return;
        setPayload(body);
        setError('');
        if (mode === 'menu' && body.table) setChannel('Mesa');
        else if (mode === 'delivery' && !body.restaurant.deliveryEnabled && body.restaurant.pickupEnabled) setChannel('Retirada');
      })
      .catch(reason => active && setError(reason instanceof Error ? reason.message : 'Cardápio indisponível.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug, tableId, mode, previewPayload]);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set((payload?.products || []).map(product => product.category)))], [payload]);
  const visible = useMemo(() => (payload?.products || []).filter(product => {
    const matchesCategory = category === 'Todos' || product.category === category;
    const haystack = `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase('pt-BR');
    return matchesCategory && haystack.includes(query.toLocaleLowerCase('pt-BR'));
  }), [payload, category, query]);
  const selected = useMemo(() => cart.flatMap(line => {
    const product = (payload?.products || []).find(item => item.id === line.productId);
    if (!product || line.quantity <= 0) return [];
    const variant = line.variantId ? variantsOf(product).find(item => item.id === line.variantId) : undefined;
    return [{ line, product, variant, price: variant?.price ?? product.price_cents }];
  }), [payload, cart]);
  const itemCount = selected.reduce((sum, item) => sum + item.line.quantity, 0);
  const subtotal = selected.reduce((sum, item) => sum + item.price * item.line.quantity, 0);
  const fee = channel === 'Delivery' ? payload?.restaurant.deliveryFee || 0 : 0;
  const total = subtotal + fee;
  const canOrderAtTable = mode === 'menu' && !!payload?.table;
  const canOrderOnline = mode === 'delivery' && !!payload && !payload.restaurant.onlinePaused && (payload.restaurant.deliveryEnabled || payload.restaurant.pickupEnabled);
  const canOrder = preview || canOrderAtTable || canOrderOnline;

  const addLine = (product: PublicMenuProduct) => {
    const variants = variantsOf(product);
    const variantId = variants.length ? (selectedVariants[product.id] || variants[0].id) : '';
    if ((product.variants || []).length > 0 && !variantId) {
      setError('Este item não possui uma opção disponível.');
      return;
    }
    setCart(current => [...current, {
      id: crypto.randomUUID(),
      productId: product.id,
      quantity: 1,
      note: '',
      variantId,
    }]);
  };

  const changeQuantity = (lineId: string, delta: number) => setCart(current => current
    .map(line => line.id === lineId ? { ...line, quantity: Math.max(0, Math.min(99, line.quantity + delta)) } : line)
    .filter(line => line.quantity > 0));

  const setLineNote = (lineId: string, note: string) => setCart(current => current.map(line => line.id === lineId ? { ...line, note } : line));

  const submit = async (form: FormData) => {
    if (!selected.length) { setError('Adicione pelo menos um item.'); return; }
    setSending(true);
    setError('');
    const currentRequestKey = requestKey || crypto.randomUUID();
    if (!requestKey) setRequestKey(currentRequestKey);
    try {
      if (preview) {
        setSuccess({ number: 0, total_cents: total });
        setCart([]);
        setRequestKey('');
        setCheckout(false);
        return;
      }
      const response = await fetch(`/api/artemis/public/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          tableId: channel === 'Mesa' ? payload?.table?.id || '' : '',
          customerName: String(form.get('name') || ''),
          phone: String(form.get('phone') || ''),
          address: String(form.get('address') || ''),
          paymentMethod: String(form.get('payment') || ''),
          notes: String(form.get('notes') || ''),
          requestKey: currentRequestKey,
          items: selected.map(item => ({
            productId: item.product.id,
            variantId: item.line.variantId || '',
            quantity: item.line.quantity,
            note: item.line.note,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Não foi possível enviar o pedido.');
      setSuccess({ number: Number(body.number), total_cents: Number(body.total_cents) });
      setCart([]);
      setRequestKey('');
      setCheckout(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="artemis-public"><div className="public-state">Abrindo cardápio…</div></main>;
  if (error && !payload) return <main className="artemis-public"><div className="public-state error">{error}</div></main>;
  if (!payload) return null;

  return <main className="artemis-public">
    <header className="public-terminal-head">
      <div className="public-brand-block"><span className="public-app-mark">ARTEMIS</span><div><h1>{payload.restaurant.name}</h1><p>{payload.restaurant.address || 'Cardápio digital'}</p></div></div>
      <div className="public-head-actions">
        <label className="public-head-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar" /></label>
        {payload.table && <span className="public-table"><UtensilsCrossed size={16} />{payload.table.name}</span>}
        {canOrder && <button className="public-order-shortcut" onClick={() => selected.length && setCheckout(true)}><ShoppingBag size={18} /><span>Pedido</span>{itemCount > 0 && <b>{itemCount}</b>}</button>}
      </div>
    </header>

    {success && <div className="public-success"><CheckCircle2 size={24} /><div><strong>{preview ? 'Simulação concluída' : `Pedido #${String(success.number).padStart(3, '0')} recebido`}</strong><span>{preview ? `Total simulado: ${money(success.total_cents)}. Nenhum pedido, venda ou baixa de estoque foi gravado.` : `Total: ${money(success.total_cents)}. O restaurante agora confirma e prepara seu pedido.`}</span></div></div>}

    {mode === 'delivery' && <section className="public-delivery-intro">
      <div><Bike size={21} /><strong>Pedido online</strong><span>{payload.restaurant.hours || 'Confira o horário de atendimento com o restaurante.'}</span></div>
      {payload.restaurant.onlinePaused && <p>O restaurante pausou temporariamente os pedidos online.</p>}
    </section>}

    <div className="public-terminal-layout">
      <aside className="public-category-rail" aria-label="Categorias do cardápio">
        <span className="public-category-title">Categorias</span>
        {categories.map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}><i />{value}</button>)}
      </aside>

      <section className="public-catalog-area">
        <div className="public-mobile-categories">{categories.map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>
        <div className="public-catalog-title"><div><span>{category === 'Todos' ? 'Cardápio' : category}</span><h2>{category === 'Todos' ? 'Escolha o que deseja pedir' : `Opções de ${category}`}</h2></div><small>{visible.length} item(ns)</small></div>
        <div className="public-menu-grid">
          {visible.map(product => {
            const variants = variantsOf(product);
            const selectedVariantId = variants.length ? (selectedVariants[product.id] || variants[0].id) : '';
            const selectedVariant = variants.find(variant => variant.id === selectedVariantId);
            const productQuantity = cart.filter(line => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0);
            const displayedPrice = selectedVariant?.price ?? product.price_cents;
            return <article className="public-product" key={product.id}>
              <ProductMedia product={product} />
              <div className="public-product-copy"><span>{product.category}</span><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}{product.allergens && <small>{product.allergens}</small>}
                {variants.length > 0 && <label className="public-variant"><span>Escolha uma opção</span><select value={selectedVariantId} onChange={event => setSelectedVariants(current => ({ ...current, [product.id]: event.target.value }))}>{variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name} · {money(variant.price)}</option>)}</select></label>}
                {(product.variants || []).length > 0 && variants.length === 0 && <small>Nenhuma opção disponível no momento.</small>}
                <div className="public-product-bottom"><strong>{money(displayedPrice)}</strong>{product.preparation_minutes > 0 && <small>{product.preparation_minutes} min</small>}</div>
              </div>
              {canOrder && <div className="public-product-actions">
                <button className="public-add" disabled={(product.variants || []).length > 0 && variants.length === 0} onClick={() => addLine(product)}>Adicionar ao pedido</button>
                {productQuantity > 0 && <small>{productQuantity} no pedido</small>}
              </div>}
            </article>;
          })}
          {!visible.length && <div className="public-state">Nenhum item encontrado.</div>}
        </div>
      </section>
    </div>

    {mode === 'menu' && !payload.table && <div className="public-info"><Store size={18} /><span>Este é o cardápio público para consulta. Para pedir na mesa, use o QR Code disponibilizado pelo restaurante.</span></div>}

    {canOrder && selected.length > 0 && <button className="public-cart-bar" onClick={() => setCheckout(true)}><ShoppingBag size={19} /><span>{itemCount} item(ns)</span><strong>{money(total)}</strong></button>}

    {checkout && <div className="public-checkout-backdrop" onClick={event => { if (event.target === event.currentTarget) setCheckout(false); }}><section className="public-checkout">
      <header><div><span>Seu pedido</span><h2>{channel === 'Mesa' ? payload.table?.name : channel}</h2></div><button onClick={() => setCheckout(false)}>Fechar</button></header>
      {mode === 'delivery' && <div className="public-channel-tabs">
        {payload.restaurant.deliveryEnabled && <button className={channel === 'Delivery' ? 'active' : ''} onClick={() => setChannel('Delivery')}>Delivery</button>}
        {payload.restaurant.pickupEnabled && <button className={channel === 'Retirada' ? 'active' : ''} onClick={() => setChannel('Retirada')}>Retirada</button>}
      </div>}
      <div className="public-order-lines">{selected.map(item => <div className="public-order-line" key={item.line.id}>
        <div className="public-order-line-main"><span>{item.product.name}{item.variant ? ` · ${item.variant.name}` : ''}</span><strong>{money(item.price * item.line.quantity)}</strong></div>
        <div className="public-order-line-controls"><button type="button" aria-label={`Diminuir ${item.product.name}`} onClick={() => changeQuantity(item.line.id, -1)}><Minus size={15} /></button><b>{item.line.quantity}</b><button type="button" aria-label={`Adicionar ${item.product.name}`} onClick={() => changeQuantity(item.line.id, 1)}><Plus size={15} /></button></div>
        <label><span>Observação desta linha</span><input value={item.line.note} onChange={event => setLineNote(item.line.id, event.target.value)} placeholder="Ex.: sem cebola, molho à parte" /></label>
      </div>)}</div>
      {fee > 0 && <div className="public-total-row"><span>Taxa de entrega</span><strong>{money(fee)}</strong></div>}
      <div className="public-total-row total"><span>Total</span><strong>{money(total)}</strong></div>
      <form action={submit}>
        {channel !== 'Mesa' && <><label><span>Nome *</span><input name="name" required /></label><label><span>Telefone *</span><input name="phone" type="tel" required /></label></>}
        {channel === 'Delivery' && <label><span>Endereço completo *</span><textarea name="address" required rows={3} placeholder="Rua, número, bairro e complemento" /></label>}
        {channel !== 'Mesa' && <label><span>Como pretende pagar? *</span><select name="payment" required defaultValue=""><option value="" disabled>Selecionar</option><option>Pix</option><option>Dinheiro</option><option>Cartão na entrega/retirada</option></select><small>A escolha não confirma pagamento. O restaurante registra o recebimento separadamente.</small></label>}
        <label><span>Observação geral</span><textarea name="notes" rows={2} /></label>
        {channel === 'Delivery' && payload.restaurant.minimumOrder > 0 && <p className="public-minimum">Pedido mínimo: {money(payload.restaurant.minimumOrder)}</p>}
        {error && <p className="public-state error">{error}</p>}
        <button className="public-submit" disabled={sending}>{sending ? 'Enviando…' : 'Enviar pedido'}</button>
      </form>
    </section></div>}

    <footer className="public-footer">{preview ? 'Prévia operacional — nenhum pedido é gravado · ' : 'Cardápio por '}<strong>CRM PLUS · Artemis</strong></footer>
    <style jsx global>{`.public-variant{display:grid;gap:6px;margin-top:12px}.public-variant>span{font-size:12px;color:var(--public-muted,#94a3b8)}.public-variant select{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:#111827;color:inherit}.public-product-actions>small{display:block;margin-top:8px;color:var(--public-muted,#94a3b8);font-size:12px}.public-order-line{display:grid!important;gap:10px;padding:14px 0}.public-order-line-main{display:flex;justify-content:space-between;gap:14px}.public-order-line-controls{display:flex;align-items:center;gap:10px}.public-order-line-controls button{width:30px;height:30px;display:grid;place-items:center;border:1px solid rgba(148,163,184,.25);border-radius:8px;background:transparent;color:inherit}.public-order-line label{display:grid;gap:6px}.public-order-line label span{font-size:12px;color:var(--public-muted,#94a3b8)}.public-order-line input{width:100%}`}</style>
  </main>;
}
