'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, Minus, Plus, Search, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { money } from '@/lib/operations/model';
import { useWorkspace } from '@/lib/operations/storage';
import './artemis-digital-preview.css';

export function ArtemisDigitalPreview() {
  const access = useStoreAccess();
  const scope = access.ready ? (access.account?.id || 'guest') : undefined;
  const workspace = useWorkspace('artemis', scope);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState<Record<string, number>>({});

  const products = workspace.data.products.filter(product => product.available);
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map(product => product.category).filter(Boolean)))], [products]);
  const visible = useMemo(() => products.filter(product => {
    const categoryOk = category === 'Todos' || product.category === category;
    const search = `${product.name} ${product.description} ${product.category} ${product.allergens}`.toLocaleLowerCase('pt-BR');
    return categoryOk && search.includes(query.toLocaleLowerCase('pt-BR'));
  }), [products, category, query]);

  const itemCount = products.reduce((sum, product) => sum + (cart[product.id] || 0), 0);
  const total = products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0);
  const change = (id: string, delta: number) => setCart(current => ({
    ...current,
    [id]: Math.max(0, Math.min(99, (current[id] || 0) + delta)),
  }));

  if (!access.ready || !workspace.ready) {
    return <main className="artemis-terminal-preview"><div className="artemis-terminal-state">Abrindo cardápio…</div></main>;
  }

  return <main className="artemis-terminal-preview">
    <header className="artemis-terminal-topbar">
      <Link className="artemis-terminal-back" href="/artemis/cardapio" aria-label="Voltar ao cadastro do cardápio"><ArrowLeft size={19} /></Link>
      <div className="artemis-terminal-brand">
        <span className="artemis-terminal-brandmark">A</span>
        <div><strong>{workspace.data.settings.business || 'Artemis'}</strong><small>Cardápio digital</small></div>
      </div>
      <label className="artemis-terminal-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar" /></label>
      <span className="artemis-terminal-context"><UtensilsCrossed size={16} />Prévia do cliente</span>
      <button className="artemis-terminal-cart" type="button"><ShoppingBag size={18} /><span>Pedido</span><b>{itemCount}</b></button>
    </header>

    {!products.length ? <section className="artemis-terminal-empty">
      <span className="artemis-terminal-empty-icon"><UtensilsCrossed size={28} /></span>
      <h1>Seu cardápio ainda está vazio</h1>
      <p>Cadastre os produtos primeiro. Assim que existirem itens disponíveis, esta tela passa a ser a experiência do cliente.</p>
      <Link className="artemis-terminal-primary" href="/artemis/cardapio">Cadastrar cardápio</Link>
    </section> : <div className="artemis-terminal-layout">
      <aside className="artemis-terminal-categories" aria-label="Categorias do cardápio">
        <span className="artemis-terminal-side-label">Categorias</span>
        {categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>
          <span>{item === 'Todos' ? '☰' : item.slice(0, 1).toUpperCase()}</span><b>{item}</b>
        </button>)}
      </aside>

      <section className="artemis-terminal-content">
        <div className="artemis-terminal-mobile-categories">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="artemis-terminal-heading"><div><span>{category === 'Todos' ? 'Cardápio' : category}</span><h1>{category === 'Todos' ? 'Escolha o que deseja pedir' : `Opções de ${category}`}</h1></div><small>{visible.length} item(ns)</small></div>

        <div className="artemis-terminal-grid">
          {visible.map(product => {
            const quantity = cart[product.id] || 0;
            return <article className="artemis-terminal-product" key={product.id}>
              <div className="artemis-terminal-photo"><span>{product.name.slice(0, 1).toUpperCase()}</span><small>Imagem do produto</small></div>
              <div className="artemis-terminal-product-copy">
                <span>{product.category}</span>
                <h2>{product.name}</h2>
                <p>{product.description || 'Produto disponível no cardápio.'}</p>
                {product.preparation > 0 && <small>Preparo aproximado: {product.preparation} min</small>}
                <div className="artemis-terminal-product-bottom"><strong>{money(product.price)}</strong>{quantity === 0 ? <button className="artemis-terminal-add" onClick={() => change(product.id, 1)}>Adicionar ao pedido</button> : <div className="artemis-terminal-qty"><button aria-label={`Remover ${product.name}`} onClick={() => change(product.id, -1)}><Minus size={15} /></button><b>{quantity}</b><button aria-label={`Adicionar ${product.name}`} onClick={() => change(product.id, 1)}><Plus size={15} /></button></div>}</div>
              </div>
            </article>;
          })}
        </div>
        {!visible.length && <div className="artemis-terminal-state">Nenhum item encontrado nessa categoria.</div>}
      </section>
    </div>}

    {itemCount > 0 && <div className="artemis-terminal-orderbar"><span><ShoppingBag size={18} /><b>{itemCount}</b> item(ns) no pedido</span><strong>{money(total)}</strong><button type="button">Ver pedido</button></div>}
  </main>;
}
