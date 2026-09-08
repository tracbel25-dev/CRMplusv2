'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, ChefHat, FileDown, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import {
  Line, Order, Product, advanceOrder, balance, cancelOrder, cashExpected, cents,
  closeTable, date, event, localDay, money, nextNumber, now, orderTotal, paid,
  receivePayment, reserved, tableOrders, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import { Badge, Button, Confirm, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section, Timeline, Title } from './ui';
import { WorkflowControl } from './WorkflowControl';

export function Artemis({ w, page }: { w: Workspace; page: string }) {
  const operation = useOperationPreferences('artemis');
  const d = w.data;
  const [newOrder, setNewOrder] = useState(false);
  const [selected, setSelected] = useState('');
  const [newTable, setNewTable] = useState(false);
  const [tableId, setTableId] = useState('');
  const [product, setProduct] = useState<Product | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [filter, setFilter] = useState('Ativos');
  const [stock, setStock] = useState<Product | null>(null);
  const [close, setClose] = useState('');
  const [from, setFrom] = useState(localDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(localDay());

  const orders = d.orders.filter(order => `${order.number} ${order.customerName} ${order.channel}`.toLowerCase().includes(query.toLowerCase()));
  const current = d.orders.find(order => order.id === selected);
  const active = orders.filter(order => !['Concluído', 'Cancelado'].includes(order.status));
  const categories = ['Todos', ...new Set(d.products.map(item => item.category))];
  const addOrder = (table = '') => { setTableId(table); setNewOrder(true); };

  const orderCard = (order: Order, kitchen = false) => <article key={order.id} className={`artemis-ticket status-${order.status.replaceAll(' ', '-')}`}>
    <div className="ticket-top"><strong>#{String(order.number).padStart(3, '0')}</strong><Badge>{order.channel === 'Mesa' ? d.tables.find(table => table.id === order.tableId)?.name : order.channel}</Badge><small>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>
    <button className="ticket-main" onClick={() => setSelected(order.id)}>
      <strong>{order.customerName || 'Atendimento de balcão'}</strong>
      {order.lines.map(line => <span key={line.id}><b>{line.quantity}×</b> {line.description}{line.done && ' · Pronto'}</span>)}
      {order.notes && <p className="ticket-note">Observação: {order.notes}</p>}
    </button>
    <div className="ticket-bottom"><Badge tone={order.status === 'Novo' ? 'warning' : ''}>{order.status}</Badge><span>{money(orderTotal(order))}</span></div>
    {kitchen && order.status === 'Em preparo' && <div className="ticket-checks">{order.lines.map(line => <label key={line.id}><input type="checkbox" checked={!!line.done} onChange={change => w.mutate(data => {
      const currentOrder = data.orders.find(item => item.id === order.id)!;
      if (currentOrder.status !== 'Em preparo') throw new Error('Pedido fora de preparo.');
      currentOrder.lines.find(item => item.id === line.id)!.done = change.target.checked;
    })} />{line.description}</label>)}</div>}
    <Button variant="secondary" onClick={() => setSelected(order.id)}>Abrir pedido <ArrowRight size={16} /></Button>
  </article>;

  const reportOrders = d.orders.filter(order => order.createdAt.slice(0, 10) >= from && order.createdAt.slice(0, 10) <= to && order.status !== 'Cancelado');
  const reportPayments = d.payments.filter(payment => payment.at.slice(0, 10) >= from && payment.at.slice(0, 10) <= to);

  return <>
    {current
      ? <OrderDetail w={w} order={current} onBack={() => setSelected('')} />
      : <>
        {(page === 'inicio' || page === 'pedidos') && <>
          <Title eyebrow={page === 'inicio' ? 'Serviço de hoje' : 'Central de pedidos'} title={page === 'inicio' ? 'O restaurante em movimento' : 'Todos os pedidos'} action={<>
            {operation.actionVisible('module:mesas') && <Link className="op-button secondary" href="/artemis/mesas">Mesas e comandas</Link>}
            <Button onClick={() => addOrder()}><Plus size={18} />Novo pedido</Button>
          </>} />
          {page === 'inicio' && <div className="artemis-service-strip"><div><ChefHat size={22} /><span>{d.settings.business || 'Seu restaurante'}<small>{d.shifts.some(shift => !shift.closedAt) ? 'Caixa aberto' : 'Caixa fechado'}</small></span></div>{operation.actionVisible('module:cardapio') && <Link href="/artemis/cardapio" className="op-text-link">Organizar cardápio <ArrowRight size={16} /></Link>}</div>}
          <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar pedido, cliente ou canal" />{page === 'pedidos' && <select aria-label="Status dos pedidos" value={filter} onChange={change => setFilter(change.target.value)}>{['Ativos', 'Todos', 'Novo', 'Aceito', 'Em preparo', 'Pronto', 'Concluído', 'Cancelado'].map(value => <option key={value}>{value}</option>)}</select>}</div>
          {page === 'inicio'
            ? <div className="artemis-board">{['Novo', 'Aceito', 'Em preparo', 'Pronto'].map(status => <section key={status}><div className="artemis-lane-title"><h2>{status === 'Novo' ? 'Chegando' : status === 'Aceito' ? 'Na fila' : status === 'Pronto' ? 'Pode sair' : 'No fogo'}</h2><span>{active.filter(order => order.status === status).length}</span></div>{active.filter(order => order.status === status).map(order => orderCard(order))}{!active.some(order => order.status === status) && <div className="artemis-lane-empty">{status === 'Novo' ? 'Novos pedidos entram aqui.' : status === 'Aceito' ? 'Aguardando o próximo preparo.' : status === 'Em preparo' ? 'Cozinha sem pedidos em preparo.' : 'Os pedidos prontos aparecem aqui.'}</div>}</section>)}</div>
            : <div className="artemis-tickets">{orders.filter(order => filter === 'Todos' || (filter === 'Ativos' ? !['Concluído', 'Cancelado'].includes(order.status) : order.status === filter)).map(order => orderCard(order))}</div>}
          {!d.orders.length && page === 'pedidos' && <Empty icon={<ShoppingBag size={30} />}>Crie o primeiro pedido a partir dos produtos do cardápio.</Empty>}
        </>}

        {page === 'cozinha' && <><Title eyebrow="Passe da cozinha" title="Cada pedido no seu tempo" action={<Badge>Preparo por item</Badge>} /><div className="artemis-kitchen">{['Aceito', 'Em preparo', 'Pronto'].map(status => <section key={status}><div className="artemis-lane-title"><h2>{status === 'Aceito' ? 'A preparar' : status}</h2><span>{active.filter(order => order.status === status).length}</span></div>{active.filter(order => order.status === status).map(order => orderCard(order, true))}{!active.some(order => order.status === status) && <Empty>Sem pedidos nesta etapa.</Empty>}</section>)}</div></>}

        {page === 'mesas' && <><Title eyebrow="Salão" title="Mesas e comandas" action={<Button onClick={() => setNewTable(true)}><Plus size={18} />Cadastrar mesa</Button>} /><div className="op-inline-legend"><span>Livre</span><Badge>Comanda aberta</Badge></div><div className="artemis-tables">{d.tables.map(table => {
          const list = tableOrders(d, table);
          const amount = list.filter(order => order.status !== 'Cancelado').reduce((sum, order) => sum + balance(d, order), 0);
          return <article className={`artemis-table ${table.openedAt ? 'occupied' : ''}`} key={table.id}>
            <div className="table-label"><UtensilsCrossed size={20} /><strong>{table.name}</strong><small>{table.seats} lugares</small></div>
            <div className="table-status"><Badge>{table.openedAt ? 'Comanda aberta' : 'Livre'}</Badge>{table.openedAt && <><strong>{money(amount)}</strong><small>Saldo a receber</small></>}</div>
            {table.openedAt
              ? <><div className="table-orders">{list.map(order => <button key={order.id} className="op-text-link" onClick={() => setSelected(order.id)}>Pedido #{order.number} · {order.status}<ArrowRight size={14} /></button>)}</div><Button onClick={() => addOrder(table.id)}><Plus size={16} />Lançar pedido</Button><Button variant="secondary" onClick={() => setClose(table.id)}>Fechar comanda</Button></>
              : <Button variant="secondary" onClick={() => w.mutate(data => { const currentTable = data.tables.find(item => item.id === table.id)!; if (currentTable.openedAt) throw new Error('Esta mesa já está aberta.'); currentTable.openedAt = now(); currentTable.closedAt = ''; }, 'Comanda aberta.')}>Abrir comanda</Button>}
          </article>;
        })}</div>{!d.tables.length && <Empty icon={<UtensilsCrossed size={30} />}>Cadastre as mesas reais do seu salão para abrir comandas.</Empty>}</>}

        {(page === 'cardapio' || page === 'cardapio-digital') && <>
          <Title eyebrow={page === 'cardapio-digital' ? 'Prévia no atendimento' : 'Catálogo do restaurante'} title={page === 'cardapio-digital' ? (d.settings.business || 'Cardápio') : 'O que a casa serve'} action={page === 'cardapio' ? <><Link className="op-button secondary" href="/artemis/cardapio-digital">Ver cardápio</Link><Button onClick={() => setProduct('new')}><Plus size={18} />Novo produto</Button></> : <Button onClick={() => addOrder()}>Montar pedido <ShoppingBag size={17} /></Button>} />
          {page === 'cardapio-digital' && <p className="op-callout">Cardápio disponível neste navegador. O link público para outros dispositivos será conectado junto com o restaurante.</p>}
          <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar produto ou ingrediente" /><div className="op-tabs">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
          <div className="artemis-menu">{d.products.filter(item => (category === 'Todos' || item.category === category) && `${item.name} ${item.description} ${item.allergens}`.toLowerCase().includes(query.toLowerCase())).map(item => <article key={item.id} className={`artemis-menu-item ${!item.available ? 'unavailable' : ''}`}>
            <span className="op-kicker">{item.category}</span><h2>{item.name}</h2>
            {operation.fieldVisible('productDescription') && <p>{item.description || 'Sem descrição cadastrada.'}</p>}
            {operation.fieldVisible('ingredients') && item.allergens && <small>Ingredientes / alergênicos: {item.allergens}</small>}
            <div><strong>{money(item.price)}</strong><span className="op-muted">{operation.fieldVisible('prepTime') && item.preparation > 0 ? `${item.preparation} min` : ''}</span></div>
            {page === 'cardapio' ? <footer><Button variant="secondary" onClick={() => setProduct(item)}>Editar</Button><button className="op-toggle" aria-pressed={item.available} onClick={() => w.mutate(data => { const productItem = data.products.find(current => current.id === item.id)!; productItem.available = !productItem.available; })}><i />{item.available ? 'Disponível' : 'Indisponível'}</button></footer> : <Badge>{item.available ? 'Disponível' : 'Indisponível'}</Badge>}
          </article>)}</div>
          {!d.products.length && <Empty icon={<ChefHat size={30} />}>Cadastre os produtos, preços e categorias do seu cardápio.</Empty>}
        </>}

        {page === 'caixa' && <Cash w={w} onOrder={setSelected} />}

        {page === 'estoque' && <><Title eyebrow="Despensa" title="Estoque e reposição" action={<Link href="/artemis/cardapio" className="op-button secondary">Cadastrar produto</Link>} /><p className="op-callout">Os produtos controlados são reservados ao aceitar o pedido e consumidos ao iniciar o preparo.</p><div className="op-list">{d.products.map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.name}</strong><small>{item.category} · {item.stockControlled ? 'Controle ativo' : 'Sem baixa automática'}</small></div><span><strong>{item.stock}</strong> em estoque<small>{reserved(d, item.id)} reservado(s)</small></span><Badge tone={item.stockControlled && item.stock - reserved(d, item.id) <= item.minimum ? 'warning' : ''}>{item.stockControlled && item.stock - reserved(d, item.id) <= item.minimum ? 'Repor estoque' : `Mínimo: ${item.minimum}`}</Badge><Button variant="secondary" onClick={() => setStock(item)}>Movimentar</Button></div>)}</div>{!d.products.length && <Empty>Os produtos cadastrados no cardápio também aparecem aqui.</Empty>}<Section title="Últimas movimentações">{[...d.stockMovements].reverse().slice(0, 30).map(movement => <div className="op-row" key={movement.id}><div className="op-grow"><strong>{d.products.find(item => item.id === movement.productId)?.name}</strong><small>{movement.note} · {date(movement.at, true)}</small></div><strong>{movement.amount > 0 ? '+' : ''}{movement.amount}</strong></div>)}</Section></>}

        {page === 'clientes' && <CustomerManager w={w} onOpen={customer => <Section title="Pedidos do cliente">{d.orders.filter(order => order.customerId === customer.id).map(order => <div className="op-row" key={order.id}><strong>#{order.number}</strong><span>{date(order.createdAt)} · {order.channel}</span><Badge>{order.status}</Badge><b>{money(orderTotal(order))}</b></div>)}</Section>} />}

        {page === 'relatorios' && <><Title eyebrow="Fechamento da operação" title="Vendas e recebimentos" action={<Button variant="secondary" onClick={() => csv('vendas-artemis.csv', [['Pedido', 'Data', 'Canal', 'Situação', 'Vendido', 'Recebido'], ...reportOrders.map(order => [order.number, date(order.createdAt), order.channel, order.status, (orderTotal(order) / 100).toFixed(2), (paid(d, order.id) / 100).toFixed(2)])])}><FileDown size={17} />Exportar período</Button>} /><div className="op-toolbar"><label className="op-field"><span>De</span><input type="date" value={from} onChange={change => setFrom(change.target.value)} /></label><label className="op-field"><span>Até</span><input type="date" value={to} onChange={change => setTo(change.target.value)} /></label></div><div className="op-report-totals"><div><span>Vendas registradas</span><strong>{money(reportOrders.reduce((sum, order) => sum + orderTotal(order), 0))}</strong><small>Pedidos não cancelados, pagos ou em aberto.</small></div><div><span>Recebimentos líquidos</span><strong>{money(reportPayments.reduce((sum, payment) => sum + payment.amount, 0) - d.movements.filter(movement => movement.kind === 'Devolução' && movement.at.slice(0, 10) >= from && movement.at.slice(0, 10) <= to).reduce((sum, movement) => sum + movement.amount, 0))}</strong><small>Recebimentos menos devoluções no período.</small></div><div><span>Ticket médio</span><strong>{money(reportOrders.length ? Math.round(reportOrders.reduce((sum, order) => sum + orderTotal(order), 0) / reportOrders.length) : 0)}</strong><small>Vendas não canceladas ÷ pedidos não cancelados.</small></div></div><Section title="Vendas por canal">{['Mesa', 'Balcão', 'Delivery', 'Retirada'].map(channel => <div className="op-row" key={channel}><strong className="op-grow">{channel}</strong><span>{reportOrders.filter(order => order.channel === channel).length} pedidos</span><strong>{money(reportOrders.filter(order => order.channel === channel).reduce((sum, order) => sum + orderTotal(order), 0))}</strong></div>)}</Section><Section title="Recebimentos por forma">{['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'].map(method => <div className="op-row" key={method}><strong className="op-grow">{method}</strong><span>{money(reportPayments.filter(payment => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0))}</span></div>)}</Section></>}
      </>}

    {newOrder && <Modal title="Novo pedido" wide onClose={() => setNewOrder(false)}><NewOrder w={w} tableId={tableId} onClose={() => setNewOrder(false)} onCreated={setSelected} /></Modal>}
    {newTable && <Modal title="Cadastrar mesa" onClose={() => setNewTable(false)}><RecordForm fields={[
      { name: 'name', label: operation.label('tableName', 'Nome ou número da mesa'), required: true },
      ...(operation.fieldVisible('tableSeats') ? [{ name: 'seats', label: operation.label('tableSeats', 'Lugares'), type: 'number', min: 1, step: 1, required: true }] : [])
    ]} onClose={() => setNewTable(false)} onSave={values => w.mutate(data => {
      if (data.tables.some(table => table.name.toLowerCase() === values.name.trim().toLowerCase())) throw new Error('Esta mesa já existe.');
      data.tables.push({ id: uid(), name: values.name.trim(), seats: Number(values.seats || 1), openedAt: '', closedAt: '' });
    })} /></Modal>}
    {product && <Modal title={product === 'new' ? 'Novo produto' : 'Editar produto'} onClose={() => setProduct(null)}><ProductForm w={w} product={product === 'new' ? undefined : product} onClose={() => setProduct(null)} /></Modal>}
    {stock && <Modal title={`Movimentar ${stock.name}`} onClose={() => setStock(null)}><RecordForm fields={[{ name: 'kind', label: 'Operação', required: true, options: ['Entrada', 'Perda', 'Ajuste de saída'].map(value => ({ value, label: value })) }, { name: 'amount', label: 'Quantidade', type: 'number', required: true, min: 0.01, step: 0.01 }, { name: 'note', label: 'Motivo / fornecedor', required: true, wide: true }]} onClose={() => setStock(null)} onSave={values => w.mutate(data => {
      const item = data.products.find(productItem => productItem.id === stock.id)!;
      const amount = Number(values.amount) * (values.kind === 'Entrada' ? 1 : -1);
      if (item.stock + amount < reserved(data, item.id)) throw new Error('A saída compromete o estoque reservado ou deixa saldo negativo.');
      item.stock += amount;
      data.stockMovements.push({ id: uid(), productId: item.id, amount, note: `${values.kind}: ${values.note}`, at: now() });
    })} /></Modal>}
    {close && <Confirm title="Fechar comanda e liberar mesa?" onClose={() => setClose('')} onConfirm={() => w.mutate(data => closeTable(data, close), 'Mesa liberada.')}>A mesa será liberada quando os pedidos estiverem concluídos e o saldo estiver resolvido.</Confirm>}
  </>;
}

function ProductForm({ w, product, onClose }: { w: Workspace; product?: Product; onClose: () => void }) {
  const operation = useOperationPreferences('artemis');
  return <RecordForm fields={[
    { name: 'name', label: operation.label('productName', 'Nome'), required: true, value: product?.name },
    { name: 'category', label: operation.label('category', 'Categoria'), required: true, value: product?.category },
    { name: 'price', label: `${operation.label('price', 'Preço')} (R$)`, type: 'number', min: 0, step: 0.01, required: true, value: product ? product.price / 100 : undefined },
    ...(operation.fieldVisible('prepTime') ? [{ name: 'preparation', label: `${operation.label('prepTime', 'Preparo estimado')} (min)`, type: 'number', min: 0, step: 1, value: product?.preparation || 0 }] : []),
    ...(operation.fieldVisible('productDescription') ? [{ name: 'description', label: operation.label('productDescription', 'Descrição'), type: 'textarea', wide: true, value: product?.description }] : []),
    ...(operation.fieldVisible('ingredients') ? [{ name: 'allergens', label: operation.label('ingredients', 'Ingredientes e alergênicos'), wide: true, value: product?.allergens }] : []),
    { name: 'stockControlled', label: 'Controlar estoque', value: product?.stockControlled ? 'sim' : 'nao', options: [{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }] },
    { name: 'minimum', label: 'Estoque mínimo', type: 'number', min: 0, step: 0.01, value: product?.minimum || 0 }
  ]} onClose={onClose} onSave={values => w.mutate(data => {
    const value: Product = {
      id: product?.id || uid(), name: values.name.trim(), category: values.category.trim(), price: cents(values.price),
      description: values.description || '', allergens: values.allergens || '', preparation: Number(values.preparation || 0),
      stockControlled: values.stockControlled === 'sim', stock: data.products.find(item => item.id === product?.id)?.stock || 0,
      minimum: Number(values.minimum || 0), available: product?.available ?? true
    };
    const index = data.products.findIndex(item => item.id === value.id);
    if (index < 0) data.products.push(value); else data.products[index] = value;
  })} />;
}

function NewOrder({ w, tableId, onCreated, onClose }: { w: Workspace; tableId: string; onCreated: (id: string) => void; onClose: () => void }) {
  const operation = useOperationPreferences('artemis');
  const availableChannels = [operation.actionVisible('counter') && 'Balcão', operation.actionVisible('dineIn') && 'Mesa', operation.actionVisible('delivery') && 'Delivery', operation.actionVisible('pickup') && 'Retirada'].filter(Boolean) as Order['channel'][];
  const [cart, setCart] = useState<Record<string, number>>({});
  const [channel, setChannel] = useState<Order['channel']>(tableId ? 'Mesa' : (availableChannels[0] || 'Balcão'));
  const [table, setTable] = useState(tableId);
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState('');
  const items = w.data.products.filter(product => cart[product.id]);
  const sum = items.reduce((total, product) => total + product.price * cart[product.id], 0);
  const fee = channel === 'Delivery' ? w.data.settings.deliveryFee : 0;
  const increment = (id: string, value: number) => setCart({ ...cart, [id]: Math.max(0, (cart[id] || 0) + value) });

  return <>
    <div className="op-tabs">{availableChannels.map(value => <button className={channel === value ? 'active' : ''} onClick={() => setChannel(value)} key={value}>{value}</button>)}</div>
    <div className="artemis-order-builder"><div><SearchBox value={query} onChange={setQuery} placeholder="Buscar no cardápio" /><div className="artemis-product-picker">{w.data.products.filter(product => product.available && product.name.toLowerCase().includes(query.toLowerCase())).map(product => <button key={product.id} onClick={() => increment(product.id, 1)}><strong>{product.name}</strong><small>{product.category}</small><span>{money(product.price)} <Plus size={16} /></span></button>)}</div>{!w.data.products.some(product => product.available) && <Empty>Cadastre produtos disponíveis no cardápio antes de lançar um pedido.</Empty>}</div><aside className="artemis-cart"><h3>Comanda do pedido</h3>{items.map(product => <div className="cart-line" key={product.id}><strong>{product.name}</strong><div><button aria-label={`Diminuir ${product.name}`} onClick={() => increment(product.id, -1)}><Minus size={14} /></button><span>{cart[product.id]}</span><button aria-label={`Adicionar ${product.name}`} onClick={() => increment(product.id, 1)}><Plus size={14} /></button><b>{money(cart[product.id] * product.price)}</b></div></div>)}{!items.length && <p className="op-muted">Toque nos produtos para adicionar.</p>}{fee > 0 && <p>Entrega: {money(fee)}</p>}<div className="op-document-total"><span>Total</span><strong>{money(sum + fee)}</strong></div></aside></div>
    {channel === 'Mesa' && <label className="op-field"><span>Comanda aberta *</span><select value={table} onChange={change => setTable(change.target.value)}><option value="">Selecionar mesa</option>{w.data.tables.filter(item => item.openedAt).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    <label className="op-field"><span>Cliente cadastrado</span><select value={customer} onChange={change => setCustomer(change.target.value)}><option value="">Novo cliente / atendimento avulso</option>{w.data.customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <RecordForm key={customer + channel} fields={[
      ...(!customer ? [...(operation.fieldVisible('customerName') ? [{ name: 'name', label: operation.label('customerName', 'Nome do cliente'), required: ['Delivery', 'Retirada'].includes(channel) }] : []), ...(operation.fieldVisible('customerPhone') ? [{ name: 'phone', label: operation.label('customerPhone', 'Telefone'), type: 'tel', required: ['Delivery', 'Retirada'].includes(channel) }] : [])] : []),
      ...(channel === 'Delivery' && operation.fieldVisible('deliveryAddress') ? [{ name: 'address', label: operation.label('deliveryAddress', 'Endereço completo (rua, número, bairro)'), required: true, wide: true }] : []),
      ...(operation.fieldVisible('orderNotes') ? [{ name: 'notes', label: operation.label('orderNotes', 'Observações de preparo / restrições'), type: 'textarea', wide: true }] : [])
    ]} onClose={onClose} submit="Confirmar pedido" onSave={values => w.mutate(data => {
      if (!items.length) throw new Error('Adicione ao menos um produto.');
      if (channel === 'Mesa' && !data.tables.some(item => item.id === table && item.openedAt)) throw new Error('Selecione uma comanda aberta.');
      let customerId = customer;
      const existing = data.customers.find(item => item.id === customer);
      if (!customerId && values.name?.trim() && values.phone?.trim()) { const found = data.customers.find(item => item.phone.replace(/\D/g, '') === values.phone.replace(/\D/g, '')); if (found) customerId = found.id; else { customerId = uid(); data.customers.push({ id: customerId, name: values.name, phone: values.phone, email: '', notes: '' }); } }
      const lines: Line[] = items.map(product => { const current = data.products.find(item => item.id === product.id); if (!current?.available || current.price !== product.price) throw new Error('O cardápio mudou. Reabra o pedido e confira os itens.'); return { id: uid(), kind: 'Produto', description: product.name, brand: '', quantity: cart[product.id], price: current.price, productId: product.id, done: false }; });
      if (channel === 'Delivery' && sum < data.settings.minimumOrder) throw new Error(`Pedido mínimo: ${money(data.settings.minimumOrder)}.`);
      const order: Order = { id: uid(), number: nextNumber(data.orders), customerId, customerName: existing?.name || values.name || '', phone: existing?.phone || values.phone || '', address: values.address || '', channel, tableId: channel === 'Mesa' ? table : '', tableSession: channel === 'Mesa' ? data.tables.find(item => item.id === table)!.openedAt : undefined, lines, notes: values.notes || '', status: 'Novo', delivery: channel === 'Delivery' ? 'Aguardando saída' : '', fee: channel === 'Delivery' ? data.settings.deliveryFee : 0, discount: 0, createdAt: now(), events: [event('Pedido criado pelo atendimento')], stockConsumed: false, reserved: false };
      data.orders.push(order); onCreated(order.id);
    }, 'Pedido registrado.')} />
  </>;
}

function OrderDetail({ w, order, onBack }: { w: Workspace; order: Order; onBack: () => void }) {
  const operation = useOperationPreferences('artemis');
  const [cancel, setCancel] = useState(false), [payment, setPayment] = useState(false), [refund, setRefund] = useState(false), [transfer, setTransfer] = useState(false);
  const d = w.data, steps = ['Novo', 'Aceito', 'Em preparo', 'Pronto', 'Concluído'], active = !['Concluído', 'Cancelado'].includes(order.status);
  let nextLabel: string | undefined, onNext: (() => void) | undefined;
  if (active) {
    if (order.status === 'Pronto' && order.channel === 'Delivery' && order.delivery !== 'Entregue') {
      nextLabel = order.delivery === 'Aguardando saída' ? 'Registrar saída para entrega' : 'Confirmar entrega ao cliente';
      onNext = () => { void w.mutate(data => { const current = data.orders.find(item => item.id === order.id)!; current.delivery = current.delivery === 'Aguardando saída' ? 'Saiu para entrega' : 'Entregue'; current.events.push(event(current.delivery)); }, 'Entrega atualizada.'); };
    } else { nextLabel = ({ Novo: 'Aceitar pedido', Aceito: 'Iniciar preparo', 'Em preparo': 'Marcar pedido como pronto', Pronto: 'Concluir pedido' } as Record<string, string>)[order.status]; onNext = () => { void w.mutate(data => advanceOrder(data, order.id, order.status), 'Pedido atualizado.'); }; }
  }
  return <><Button variant="text" onClick={onBack}><ArrowLeft size={17} />Voltar</Button><Title eyebrow={`${order.channel}${order.channel === 'Mesa' ? ` · ${d.tables.find(table => table.id === order.tableId)?.name}` : ''}`} title={`Pedido #${String(order.number).padStart(3, '0')}`}>{order.customerName || 'Atendimento de balcão'} · {date(order.createdAt, true)}</Title><WorkflowControl label="Fluxo do pedido" steps={steps} current={steps.includes(order.status) ? order.status : 'Concluído'} status={order.status === 'Pronto' && order.channel === 'Delivery' ? order.delivery : order.status} nextLabel={nextLabel} onNext={onNext} /><div className="op-split"><Section title="Itens do pedido">{order.lines.map(line => <div className="op-row" key={line.id}>{order.status === 'Em preparo' && <input aria-label={`Pronto: ${line.description}`} type="checkbox" checked={!!line.done} onChange={change => w.mutate(data => { const current = data.orders.find(item => item.id === order.id)!; if (current.status !== 'Em preparo') throw new Error('Pedido fora de preparo.'); current.lines.find(item => item.id === line.id)!.done = change.target.checked; })} />}<span className="op-quantity">{line.quantity}×</span><div className="op-grow"><strong>{line.description}</strong><small>{money(line.price)} cada{line.done ? ' · Pronto' : ''}</small></div><strong>{money(line.price * line.quantity)}</strong></div>)}{order.notes && <p className="op-callout">Observação: {order.notes}</p>}{order.address && <p><strong>Entrega:</strong> {order.address} · {order.phone}</p>}<div className="op-record-secondary-actions">{active && operation.actionVisible('cancel') && <Button variant="danger" onClick={() => setCancel(true)}>Cancelar pedido</Button>}{order.channel === 'Mesa' && order.status !== 'Cancelado' && operation.actionVisible('transferTable') && <Button variant="secondary" onClick={() => setTransfer(true)}>Transferir mesa</Button>}</div></Section><Section title="Recebimento"><div className="op-money-stack"><div><span>Itens</span><b>{money(orderTotal(order) - order.fee + order.discount)}</b></div>{order.fee > 0 && <div><span>Taxa de entrega</span><b>{money(order.fee)}</b></div>}<div><span>Total</span><b>{money(orderTotal(order))}</b></div><div><span>Recebido</span><b>{money(paid(d, order.id))}</b></div><div className="remaining"><span>{order.status === 'Cancelado' ? 'A devolver' : 'Saldo'}</span><strong>{money(order.status === 'Cancelado' ? paid(d, order.id) : balance(d, order))}</strong></div></div>{operation.actionVisible('payments') && balance(d, order) > 0 && order.status !== 'Cancelado' && <Button onClick={() => setPayment(true)}>Registrar recebimento</Button>}{operation.actionVisible('refunds') && order.status === 'Cancelado' && paid(d, order.id) > 0 && <Button onClick={() => setRefund(true)}>Registrar devolução</Button>}{d.payments.filter(item => item.orderId === order.id).map(item => <div className="op-row" key={item.id}><span>{item.method}<small>{date(item.at, true)}{item.refunded > 0 ? ` · Devolvido: ${money(item.refunded)}` : ''}</small></span><strong>{money(item.amount)}</strong></div>)}<p className="op-muted">Registros manuais. Pix e cartão só contam como recebidos após sua confirmação.</p></Section></div><Section title="Linha do tempo"><Timeline events={order.events} /></Section>{cancel && <Modal title="Cancelar pedido" onClose={() => setCancel(false)}><RecordForm fields={[{ name: 'reason', label: 'Motivo', required: true, type: 'textarea', wide: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={values => w.mutate(data => cancelOrder(data, order.id, values.reason))} /></Modal>}{payment && <Modal title="Confirmar recebimento" onClose={() => setPayment(false)}><p>Saldo: <strong>{money(balance(d, order))}</strong>. Para dividir, registre cada parcela separadamente.</p><RecordForm fields={[{ name: 'amount', label: 'Valor efetivamente recebido (R$)', type: 'number', min: 0.01, step: 0.01, required: true, value: balance(d, order) / 100 }, { name: 'method', label: 'Forma de pagamento', required: true, options: ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'].map(value => ({ value, label: value })) }]} submit="Confirmar recebimento" onClose={() => setPayment(false)} onSave={values => w.mutate(data => receivePayment(data, order.id, cents(values.amount), values.method), 'Recebimento registrado.')} /></Modal>}{refund && <Confirm title="Confirmar devolução realizada?" onClose={() => setRefund(false)} onConfirm={() => w.mutate(data => { const shift = data.shifts.find(item => !item.closedAt); if (!shift) throw new Error('Abra o caixa para registrar a devolução.'); for (const item of data.payments.filter(item => item.orderId === order.id && item.amount > item.refunded)) { const amount = item.amount - item.refunded; data.movements.push({ id: uid(), shiftId: shift.id, kind: 'Devolução', amount, note: `Devolução do pedido ${order.number}`, at: now(), method: item.method }); item.refunded = item.amount; } data.orders.find(item => item.id === order.id)!.events.push(event('Devolução integral confirmada manualmente')); })}>Confirme apenas depois de devolver o valor ao cliente.</Confirm>}{transfer && <Modal title="Transferir pedido para outra mesa" onClose={() => setTransfer(false)}><RecordForm fields={[{ name: 'tableId', label: 'Comanda de destino', required: true, options: d.tables.filter(table => table.openedAt && table.id !== order.tableId).map(table => ({ value: table.id, label: table.name })) }]} onClose={() => setTransfer(false)} onSave={values => w.mutate(data => { if (!data.tables.some(table => table.id === values.tableId && table.openedAt)) throw new Error('A comanda de destino não está aberta.'); const current = data.orders.find(item => item.id === order.id)!; current.tableId = values.tableId; current.tableSession = data.tables.find(table => table.id === values.tableId)!.openedAt; current.events.push(event(`Transferido para ${data.tables.find(table => table.id === values.tableId)!.name}`)); })} /></Modal>}</>;
}

function Cash({ w, onOrder }: { w: Workspace; onOrder: (id: string) => void }) {
  const operation = useOperationPreferences('artemis');
  const [mode, setMode] = useState('');
  const d = w.data, shift = d.shifts.find(item => !item.closedAt), payments = shift ? d.payments.filter(item => item.shiftId === shift.id) : [];
  return <><Title eyebrow="Caixa do restaurante" title={shift ? 'Turno em andamento' : 'Abra o próximo turno'} action={shift ? <><Button variant="secondary" onClick={() => setMode('movement')}>Movimentar caixa</Button><Button onClick={() => setMode('close')}>Conferir e fechar</Button></> : <Button onClick={() => setMode('open')}><Plus size={18} />Abrir caixa</Button>} />{shift ? <><div className="artemis-cash"><div><span>Dinheiro esperado na gaveta</span><strong>{money(cashExpected(d, shift))}</strong><small>Troco inicial + entradas − saídas em dinheiro</small></div><div><span>Aberto por {shift.operator}</span><strong className="cash-date">{date(shift.openedAt, true)}</strong><small>Troco inicial: {money(shift.initial)}</small></div></div><Section title="Recebimentos do turno">{payments.length ? payments.map(payment => <button className="op-row" key={payment.id} onClick={() => onOrder(payment.orderId)}><strong className="op-grow">Pedido #{d.orders.find(order => order.id === payment.orderId)?.number}</strong><span>{payment.method}</span><strong>{money(payment.amount)}</strong><ArrowRight size={16} /></button>) : <Empty>Nenhum recebimento neste turno.</Empty>}</Section><Section title="Movimentações">{d.movements.filter(movement => movement.shiftId === shift.id).map(movement => <div className="op-row" key={movement.id}><div className="op-grow"><strong>{movement.kind}</strong><small>{movement.note} · {movement.method || 'Dinheiro'}</small></div><strong>{money(movement.amount)}</strong></div>)}</Section></> : <Empty icon={<ShoppingBag size={28} />}>Informe o operador e o valor inicial de troco. Pedidos podem ser criados antes da abertura.</Empty>}<Section title="Pedidos com saldo a receber">{d.orders.filter(order => order.status !== 'Cancelado' && balance(d, order) > 0).map(order => <button className="op-row" key={order.id} onClick={() => onOrder(order.id)}><strong>Pedido #{order.number}</strong><span className="op-grow">{order.customerName || order.channel}</span><b>{money(balance(d, order))}</b><ArrowRight size={16} /></button>)}</Section><Section title="Turnos encerrados">{[...d.shifts].filter(item => item.closedAt).reverse().map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{date(item.closedAt, true)}</strong><small>{item.operator} · {item.note || 'Sem observação'}</small></div><span>Contado: {money(item.counted)}<small>Diferença: {money(item.counted - cashExpected(d, item))}</small></span></div>)}</Section>{mode && <Modal title={mode === 'open' ? 'Abrir caixa' : mode === 'close' ? 'Conferência de caixa' : 'Movimentação em dinheiro'} onClose={() => setMode('')}>{mode === 'close' && shift && <p>Dinheiro esperado: <strong>{money(cashExpected(d, shift))}</strong>. Pix e cartões não compõem o dinheiro físico.</p>}<RecordForm fields={mode === 'open' ? [{ name: 'operator', label: operation.label('cashOperator', 'Operador'), required: true, value: d.settings.operator }, { name: 'amount', label: 'Troco inicial (R$)', type: 'number', min: 0, step: 0.01, required: true }] : mode === 'close' ? [{ name: 'amount', label: 'Dinheiro contado (R$)', type: 'number', min: 0, step: 0.01, required: true }, { name: 'note', label: 'Justificativa de diferença / observações', type: 'textarea', wide: true }] : [{ name: 'kind', label: 'Tipo', required: true, options: ['Suprimento', 'Sangria', 'Despesa'].map(value => ({ value, label: value })) }, { name: 'amount', label: 'Valor (R$)', type: 'number', min: 0.01, step: 0.01, required: true }, { name: 'note', label: 'Motivo', required: true, wide: true }]} onClose={() => setMode('')} submit={mode === 'close' ? 'Confirmar fechamento' : 'Registrar'} onSave={values => w.mutate(data => { const current = data.shifts.find(item => !item.closedAt), amount = cents(values.amount); if (mode === 'open') { if (current) throw new Error('Já existe um turno aberto.'); data.shifts.push({ id: uid(), openedAt: now(), closedAt: '', initial: amount, counted: 0, note: '', operator: values.operator }); } else { if (!current) throw new Error('Não há turno aberto.'); if (mode === 'close') { if (amount !== cashExpected(data, current) && !values.note.trim()) throw new Error('Justifique a diferença entre o esperado e o contado.'); current.counted = amount; current.closedAt = now(); current.note = values.note; } else { if (values.kind !== 'Suprimento' && amount > cashExpected(data, current)) throw new Error('Saída superior ao dinheiro disponível.'); data.movements.push({ id: uid(), shiftId: current.id, kind: values.kind as 'Suprimento' | 'Sangria' | 'Despesa', amount, note: values.note, at: now() }); } } })} /></Modal>}</>;
}
