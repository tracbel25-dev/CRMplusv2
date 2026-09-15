'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, Store, Truck } from 'lucide-react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { ExternalPublic } from './ExternalPublic';
import './artemis-external-menu.css';

type LinkData = { appId: string; kind: string; recordId?: string; title: string; payload: Record<string, any>; status: string };

async function invoke(token: string, action: 'read' | 'respond', response?: Record<string, unknown>) {
  const { data, error } = await createStoreClient().functions.invoke('external-link', { body: { token, action, response } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((value || 0) / 100);

export function ExternalRouter({ token }: { token: string }) {
  const [link, setLink] = useState<LinkData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void invoke(token, 'read')
      .then(result => { if (active) setLink(result.link); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Link indisponível.'); });
    return () => { active = false; };
  }, [token]);

  if (error) return <main className="artemis-external-terminal"><div className="aet-state"><h1>Este link não está disponível</h1><p>{error}</p></div></main>;
  if (!link) return <main className="artemis-external-terminal"><div className="aet-state">Abrindo cardápio…</div></main>;
  if (link.kind !== 'artemis-menu') return <ExternalPublic token={token} />;
  return <ArtemisExternalMenu token={token} link={link} />;
}

function ArtemisExternalMenu({ token, link }: { token: string; link: LinkData }) {
  const products = Array.isArray(link.payload.products) ? link.payload.products : [];
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<'Delivery' | 'Retirada'>('Delivery');
  const [checkout, setCheckout] = useState(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map((product: any) => String(product.category || '')).filter(Boolean)))], [products]);
  const visible = useMemo(() => products.filter((product: any) => {
    const categoryOk = category === 'Todos' || product.category === category;
    const haystack = `${product.name || ''} ${product.description || ''} ${product.category || ''} ${product.allergens || ''}`.toLocaleLowerCase('pt-BR');
    return categoryOk && haystack.includes(query.toLocaleLowerCase('pt-BR'));
  }), [products, category, query]);
  const items = products.filter((product: any) => (cart[product.id] || 0) > 0);
  const subtotal = items.reduce((sum: number, product: any) => sum + Number(product.price || 0) * (cart[product.id] || 0), 0);
  const deliveryFee = channel === 'Delivery' ? Number(link.payload.deliveryFee || 0) : 0;
  const total = subtotal + deliveryFee;
  const itemCount = items.reduce((sum: number, product: any) => sum + (cart[product.id] || 0), 0);

  const change = (id: string, delta: number) => setCart(current => ({ ...current, [id]: Math.max(0, Math.min(99, (current[id] || 0) + delta)) }));

  const submit = async () => {
    if (!items.length) { setError('Adicione ao menos um item.'); return; }
    if (!customer.trim() || !phone.trim()) { setError('Informe nome e telefone.'); return; }
    if (channel === 'Delivery' && !address.trim()) { setError('Informe o endereço de entrega.'); return; }
    if (channel === 'Delivery' && subtotal < Number(link.payload.minimumOrder || 0)) { setError(`Pedido mínimo: ${money(Number(link.payload.minimumOrder || 0))}.`); return; }
    setBusy(true); setError('');
    try {
      await invoke(token, 'respond', {
        customer, phone, address, notes: general, channel,
        items: items.map((product: any) => ({ productId: product.id, quantity: cart[product.id], note: notes[product.id] || '' })),
      });
      setSent(true);
      setCheckout(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o pedido.');
    } finally { setBusy(false); }
  };

  if (sent) return <main className="artemis-external-terminal"><div className="aet-success"><CheckCircle2 size={42} /><h1>Pedido enviado</h1><p>O restaurante recebeu seu pedido e fará a confirmação.</p></div></main>;

  return <main className="artemis-external-terminal">
    <header className="aet-topbar">
      <div className="aet-brand"><span>A</span><div><strong>{link.payload.business || 'Artemis'}</strong><small>{link.payload.hours || 'Cardápio digital'}</small></div></div>
      <label className="aet-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar no cardápio" /></label>
      <div className="aet-channel-mini"><button className={channel === 'Delivery' ? 'active' : ''} onClick={() => setChannel('Delivery')}><Truck size={15} />Delivery</button><button className={channel === 'Retirada' ? 'active' : ''} onClick={() => setChannel('Retirada')}><Store size={15} />Retirada</button></div>
      <button className="aet-cart" onClick={() => setCheckout(true)}><ShoppingBag size={18} /><span>Pedido</span><b>{itemCount}</b></button>
    </header>

    <div className="aet-layout">
      <aside className="aet-categories"><span>Categorias</span>{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}><i>{item === 'Todos' ? '☰' : item.slice(0,1).toUpperCase()}</i><b>{item}</b></button>)}</aside>
      <section className="aet-content">
        <div className="aet-mobile-categories">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="aet-heading"><div><span>{category === 'Todos' ? 'Cardápio' : category}</span><h1>{link.payload.business || link.title || 'Escolha seu pedido'}</h1></div><small>{visible.length} item(ns)</small></div>
        <div className="aet-products">{visible.map((product: any) => {
          const quantity = cart[product.id] || 0;
          return <article key={product.id}>
            <div className="aet-photo"><span>{String(product.name || '?').slice(0,1).toUpperCase()}</span><small>Imagem do produto</small></div>
            <div className="aet-product-copy"><span>{product.category}</span><h2>{product.name}</h2><p>{product.description || 'Produto disponível no cardápio.'}</p>{product.allergens && <small>{product.allergens}</small>}<div className="aet-product-bottom"><strong>{money(Number(product.price || 0))}</strong>{quantity === 0 ? <button className="aet-add" onClick={() => change(product.id, 1)}>Adicionar ao pedido</button> : <div className="aet-qty"><button onClick={() => change(product.id, -1)} aria-label={`Remover ${product.name}`}><Minus size={15} /></button><b>{quantity}</b><button onClick={() => change(product.id, 1)} aria-label={`Adicionar ${product.name}`}><Plus size={15} /></button></div>}</div>{quantity > 0 && <input className="aet-note" value={notes[product.id] || ''} onChange={event => setNotes(current => ({ ...current, [product.id]: event.target.value }))} placeholder="Observação deste item" />}</div>
          </article>;
        })}</div>
        {!visible.length && <div className="aet-state">Nenhum item encontrado.</div>}
      </section>
    </div>

    {itemCount > 0 && <button className="aet-orderbar" onClick={() => setCheckout(true)}><span><ShoppingBag size={18} />{itemCount} item(ns)</span><strong>{money(total)}</strong><b>Ver pedido</b></button>}

    {checkout && <div className="aet-checkout-backdrop" onClick={event => { if (event.target === event.currentTarget) setCheckout(false); }}><section className="aet-checkout">
      <header><div><span>Seu pedido</span><h2>{channel}</h2></div><button onClick={() => setCheckout(false)}>Fechar</button></header>
      <div className="aet-checkout-lines">{items.map((product: any) => <div key={product.id}><span>{cart[product.id]}× {product.name}</span><strong>{money(cart[product.id] * Number(product.price || 0))}</strong></div>)}</div>
      {deliveryFee > 0 && <div className="aet-total-row"><span>Entrega</span><strong>{money(deliveryFee)}</strong></div>}
      <div className="aet-total-row total"><span>Total</span><strong>{money(total)}</strong></div>
      {error && <p className="aet-error">{error}</p>}
      <label><span>Nome *</span><input value={customer} onChange={event => setCustomer(event.target.value)} /></label>
      <label><span>Telefone *</span><input value={phone} onChange={event => setPhone(event.target.value)} /></label>
      {channel === 'Delivery' && <label><span>Endereço *</span><textarea rows={3} value={address} onChange={event => setAddress(event.target.value)} /></label>}
      <label><span>Observações gerais</span><textarea rows={2} value={general} onChange={event => setGeneral(event.target.value)} /></label>
      <button className="aet-submit" disabled={busy} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
    </section></div>}
  </main>;
}
