'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, CheckCircle2, Minus, Plus, Search, ShoppingBag, Store, UtensilsCrossed } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import './public-menu.css';

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  allergens: string;
  preparation_minutes: number;
};

type MenuPayload = {
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
  products: Product[];
};

type CartLine = { quantity: number; note: string };

type Props = { slug: string; mode: 'menu' | 'delivery' };

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

export function PublicMenu({ slug, mode }: Props) {
  const searchParams = useSearchParams();
  const tableId = searchParams.get('mesa') || '';
  const [payload, setPayload] = useState<MenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkout, setCheckout] = useState(false);
  const [channel, setChannel] = useState<'Mesa' | 'Delivery' | 'Retirada'>(mode === 'delivery' ? 'Delivery' : 'Mesa');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{ number: number; total_cents: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = tableId ? `?mesa=${encodeURIComponent(tableId)}` : '';
    fetch(`/api/artemis/public/${encodeURIComponent(slug)}${qs}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || 'Cardápio indisponível.');
        return body as MenuPayload;
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
  }, [slug, tableId, mode]);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set((payload?.products || []).map(product => product.category)))], [payload]);
  const visible = useMemo(() => (payload?.products || []).filter(product => {
    const matchesCategory = category === 'Todos' || product.category === category;
    const haystack = `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase('pt-BR');
    return matchesCategory && haystack.includes(query.toLocaleLowerCase('pt-BR'));
  }), [payload, category, query]);
  const selected = useMemo(() => (payload?.products || []).filter(product => (cart[product.id]?.quantity || 0) > 0), [payload, cart]);
  const subtotal = selected.reduce((sum, product) => sum + product.price_cents * cart[product.id].quantity, 0);
  const fee = channel === 'Delivery' ? payload?.restaurant.deliveryFee || 0 : 0;
  const total = subtotal + fee;
  const canOrderAtTable = mode === 'menu' && !!payload?.table;
  const canOrderOnline = mode === 'delivery' && !!payload && !payload.restaurant.onlinePaused && (payload.restaurant.deliveryEnabled || payload.restaurant.pickupEnabled);
  const canOrder = canOrderAtTable || canOrderOnline;

  const changeQuantity = (id: string, delta: number) => setCart(current => {
    const previous = current[id] || { quantity: 0, note: '' };
    const quantity = Math.max(0, Math.min(99, previous.quantity + delta));
    return { ...current, [id]: { ...previous, quantity } };
  });

  const submit = async (form: FormData) => {
    if (!selected.length) { setError('Adicione pelo menos um item.'); return; }
    setSending(true);
    setError('');
    try {
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
          items: selected.map(product => ({ productId: product.id, quantity: cart[product.id].quantity, note: cart[product.id].note })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Não foi possível enviar o pedido.');
      setSuccess({ number: Number(body.number), total_cents: Number(body.total_cents) });
      setCart({});
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
    <header className="public-restaurant-head">
      <span className="public-app-mark">Artemis</span>
      <div><h1>{payload.restaurant.name}</h1><p>{payload.restaurant.address || 'Cardápio digital'}</p></div>
      {payload.table && <span className="public-table"><UtensilsCrossed size={16} />{payload.table.name}</span>}
    </header>

    {success && <div className="public-success"><CheckCircle2 size={24} /><div><strong>Pedido #{String(success.number).padStart(3, '0')} recebido</strong><span>Total: {money(success.total_cents)}. O restaurante agora confirma e prepara seu pedido.</span></div></div>}

    {mode === 'delivery' && <section className="public-delivery-intro">
      <div><Bike size={21} /><strong>Pedido online</strong><span>{payload.restaurant.hours || 'Confira o horário de atendimento com o restaurante.'}</span></div>
      {payload.restaurant.onlinePaused && <p>O restaurante pausou temporariamente os pedidos online.</p>}
    </section>}

    <div className="public-search"><Search size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar no cardápio" /></div>
    <div className="public-categories">{categories.map(value => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>

    <section className="public-menu-list">
      {visible.map(product => <article className="public-product" key={product.id}>
        <div className="public-product-copy"><span>{product.category}</span><h2>{product.name}</h2>{product.description && <p>{product.description}</p>}{product.allergens && <small>{product.allergens}</small>}<strong>{money(product.price_cents)}</strong></div>
        {canOrder && <div className="public-quantity"><button aria-label={`Remover ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Minus size={16} /></button><span>{cart[product.id]?.quantity || 0}</span><button aria-label={`Adicionar ${product.name}`} onClick={() => changeQuantity(product.id, 1)}><Plus size={16} /></button></div>}
        {(cart[product.id]?.quantity || 0) > 0 && <label className="public-note"><span>Observação</span><input value={cart[product.id]?.note || ''} onChange={event => setCart(current => ({ ...current, [product.id]: { ...(current[product.id] || { quantity: 1 }), note: event.target.value } }))} placeholder="Ex.: sem cebola" /></label>}
      </article>)}
      {!visible.length && <div className="public-state">Nenhum item encontrado.</div>}
    </section>

    {mode === 'menu' && !payload.table && <div className="public-info"><Store size={18} /><span>Este é o cardápio público para consulta. Para pedir na mesa, use o QR Code disponibilizado pelo restaurante.</span></div>}

    {canOrder && selected.length > 0 && <button className="public-cart-bar" onClick={() => setCheckout(true)}><ShoppingBag size={19} /><span>{selected.reduce((sum, product) => sum + cart[product.id].quantity, 0)} item(ns)</span><strong>{money(total)}</strong></button>}

    {checkout && <div className="public-checkout-backdrop" onClick={event => { if (event.target === event.currentTarget) setCheckout(false); }}><section className="public-checkout">
      <header><div><span>Seu pedido</span><h2>{channel === 'Mesa' ? payload.table?.name : channel}</h2></div><button onClick={() => setCheckout(false)}>Fechar</button></header>
      {mode === 'delivery' && <div className="public-channel-tabs">
        {payload.restaurant.deliveryEnabled && <button className={channel === 'Delivery' ? 'active' : ''} onClick={() => setChannel('Delivery')}>Delivery</button>}
        {payload.restaurant.pickupEnabled && <button className={channel === 'Retirada' ? 'active' : ''} onClick={() => setChannel('Retirada')}>Retirada</button>}
      </div>}
      <div className="public-order-lines">{selected.map(product => <div key={product.id}><span>{cart[product.id].quantity}× {product.name}</span><strong>{money(product.price_cents * cart[product.id].quantity)}</strong></div>)}</div>
      {fee > 0 && <div className="public-total-row"><span>Taxa de entrega</span><strong>{money(fee)}</strong></div>}
      <div className="public-total-row total"><span>Total</span><strong>{money(total)}</strong></div>
      <form action={submit}>
        {channel !== 'Mesa' && <><label><span>Nome *</span><input name="name" required /></label><label><span>Telefone *</span><input name="phone" type="tel" required /></label></>}
        {channel === 'Delivery' && <label><span>Endereço completo *</span><textarea name="address" required rows={3} placeholder="Rua, número, bairro e complemento" /></label>}
        {channel !== 'Mesa' && <label><span>Como pretende pagar? *</span><select name="payment" required defaultValue=""><option value="" disabled>Selecionar</option><option>Pix</option><option>Dinheiro</option><option>Cartão na entrega/retirada</option></select><small>A escolha não confirma pagamento. O restaurante registra o recebimento separadamente.</small></label>}
        <label><span>Observação geral</span><textarea name="notes" rows={2} /></label>
        {channel === 'Delivery' && payload.restaurant.minimumOrder > 0 && <p className="public-minimum">Pedido mínimo: {money(payload.restaurant.minimumOrder)}</p>}
        <button className="public-submit" disabled={sending}>{sending ? 'Enviando…' : 'Enviar pedido'}</button>
      </form>
    </section></div>}

    <footer className="public-footer">Cardápio por <strong>CRM PLUS · Artemis</strong></footer>
  </main>;
}
