'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, ChefHat, FileDown, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import {
  Line, Order, Product, advanceDelivery, advanceOrder, balance, cancelOrder, cashExpected,
  cents, closeTable, customValues, date, event, localDay, money, nextNumber, now,
  orderTotal, paid, receivePayment, receiveTablePayment, reserved, setCustomValues,
  tableBalance, tableOrders, uid
} from '@/lib/operations/model';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace, csv } from '@/lib/operations/storage';
import { Badge, Button, Confirm, CustomerManager, Empty, Modal, RecordForm, SearchBox, Section, Timeline, Title } from './ui';
import { CompactTabs, CompactPanel } from './CompactTabs';
import { WorkflowControl } from './WorkflowControl';
import { useRecordRoute } from './useRecordRoute';

const paymentMethods = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];

function elapsedLabel(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

function customDefs(operation: ReturnType<typeof useOperationPreferences>, groups: string[], values: Record<string, string> = {}) {
  return operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => ({ name: `custom__${field.id}`, label: field.label, wide: true, value: values[field.id] || '' }));
}
function customFromForm(operation: ReturnType<typeof useOperationPreferences>, groups: string[], form: Record<string, string>) {
  return Object.fromEntries(operation.preferences.customFields.filter(field => field.visible && groups.includes(field.group)).map(field => [field.id, form[`custom__${field.id}`] || '']));
}

export function Artemis({ w, page, recordId = '' }: { w: Workspace; page: string; recordId?: string }) {
  const operation = useOperationPreferences('artemis');
  const d = w.data;
  const [newOrder, setNewOrder] = useState(false);
  const [selected, setSelected] = useRecordRoute(recordId, '/artemis/pedidos');
  const [newTable, setNewTable] = useState(false);
  const [tableId, setTableId] = useState('');
  const [checkout, setCheckout] = useState('');
  const [product, setProduct] = useState<Product | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [stock, setStock] = useState<Product | null>(null);
  const [from, setFrom] = useState(localDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(localDay());

  const orders = d.orders.filter(order => `${order.number} ${order.customerName} ${order.channel}`.toLowerCase().includes(query.toLowerCase()));
  const current = d.orders.find(order => order.id === selected);
  const active = orders.filter(order => !['Concluído', 'Cancelado'].includes(order.status));
  const categories = ['Todos', ...new Set(d.products.map(item => item.category))];
  const addOrder = (table = '') => { setTableId(table); setNewOrder(true); };

  const kitchenAction = (order: Order) => {
    if (order.status === 'Aceito') return <Button onClick={() => { void w.mutate(data => advanceOrder(data, order.id, 'Aceito'), 'Preparo iniciado.'); }}>Iniciar preparo</Button>;
    if (order.status === 'Em preparo') return <Button disabled={order.lines.some(line => !line.done)} onClick={() => { void w.mutate(data => advanceOrder(data, order.id, 'Em preparo'), 'Pedido pronto.'); }}>Finalizar preparo</Button>;
    return <Button variant="secondary" onClick={() => setSelected(order.id)}>Abrir pedido <ArrowRight size={16} /></Button>;
  };

  const orderCard = (order: Order, kitchen = false) => {
    const estimated = Math.max(0, ...order.lines.map(line => line.prepMinutes || 0));
    return <article key={order.id} className={`artemis-ticket status-${order.status.replaceAll(' ', '-')}`}>
      <div className="ticket-top"><strong>#{String(order.number).padStart(3, '0')}</strong><Badge>{order.channel === 'Mesa' ? d.tables.find(table => table.id === order.tableId)?.name : order.channel}</Badge><small>{new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>
      <button className="ticket-main" onClick={() => setSelected(order.id)}>
        <strong>{order.customerName || 'Atendimento de balcão'}</strong>
        {order.lines.map(line => <span key={line.id}><b>{line.quantity}×</b> {line.description}{line.note ? ` · ${line.note}` : ''}{line.done && ' · Pronto'}</span>)}
        {order.notes && <p className="ticket-note">Pedido: {order.notes}</p>}
      </button>
      {kitchen && <div className="ticket-note"><strong>Tempo: {elapsedLabel(order.createdAt)}</strong>{estimated > 0 && <span> · referência cadastrada: até {estimated} min</span>}</div>}
      <div className="ticket-bottom"><Badge tone={order.status === 'Novo' ? 'warning' : ''}>{order.status}</Badge><span>{money(orderTotal(order))}</span></div>
      {kitchen && order.status === 'Em preparo' && <div className="ticket-checks">{order.lines.map(line => <label key={line.id}><input type="checkbox" checked={!!line.done} onChange={change => w.mutate(data => { const currentOrder = data.orders.find(item => item.id === order.id)!; if (currentOrder.status !== 'Em preparo') throw new Error('Pedido fora de preparo.'); const currentLine = currentOrder.lines.find(item => item.id === line.id)!; currentLine.done = change.target.checked; currentOrder.events.push(event(`${currentLine.done ? 'Item pronto' : 'Item reaberto'}: ${currentLine.description}`)); })} /><span><strong>{line.description}</strong>{line.note && <small>{line.note}</small>}</span></label>)}</div>}
      {kitchen ? kitchenAction(order) : <Button variant="secondary" onClick={() => setSelected(order.id)}>Abrir pedido <ArrowRight size={16} /></Button>}
    </article>;
  };

  const reportOrders = d.orders.filter(order => order.createdAt.slice(0, 10) >= from && order.createdAt.slice(0, 10) <= to && order.status !== 'Cancelado');
  const reportPayments = d.payments.filter(payment => payment.at.slice(0, 10) >= from && payment.at.slice(0, 10) <= to);

  return <>
    {current ? <OrderDetail w={w} order={current} onBack={() => setSelected('')} /> : <>
      {(page === 'inicio' || page === 'pedidos') && <>
        <Title eyebrow={page === 'inicio' ? 'Serviço de hoje' : 'Central de pedidos'} title={page === 'inicio' ? 'O restaurante em movimento' : 'Todos os pedidos'} action={<>{operation.actionVisible('module:mesas') && <Link className="op-button secondary" href="/artemis/mesas">Mesas e comandas</Link>}<Button onClick={() => addOrder()}><Plus size={18} />Novo pedido</Button></>} />
        {page === 'inicio' && <div className="artemis-service-strip"><div><ChefHat size={22} /><span>{d.settings.business || 'Seu restaurante'}<small>{d.shifts.some(shift => !shift.closedAt) ? 'Caixa aberto' : 'Caixa fechado'}</small></span></div>{operation.actionVisible('module:cardapio') && <Link href="/artemis/cardapio" className="op-text-link">Organizar cardápio <ArrowRight size={16} /></Link>}</div>}
        <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar pedido, cliente ou canal" /></div>
        {page === 'inicio' ? <div className="artemis-board">{['Novo', 'Aceito', 'Em preparo', 'Pronto'].map(status => <section key={status}><div className="artemis-lane-title"><h2>{status === 'Novo' ? 'Chegando' : status === 'Aceito' ? 'Na fila' : status === 'Pronto' ? 'Pode sair' : 'No fogo'}</h2><span>{active.filter(order => order.status === status).length}</span></div>{active.filter(order => order.status === status).map(order => orderCard(order))}{!active.some(order => order.status === status) && <div className="artemis-lane-empty">{status === 'Novo' ? 'Novos pedidos entram aqui.' : status === 'Aceito' ? 'Aguardando o próximo preparo.' : status === 'Em preparo' ? 'Cozinha sem pedidos em preparo.' : 'Os pedidos prontos aparecem aqui.'}</div>}</section>)}</div> : <CompactTabs label="Situação dos pedidos" tabs={[{id:'abertos',label:'Em aberto',count:active.length},{id:'historico',label:'Histórico',count:orders.length-active.length}]}>{['abertos','historico'].map(scope => {
          const scoped = orders.filter(order => (scope === 'historico') === ['Concluído','Cancelado'].includes(order.status));
          return <CompactPanel key={scope} value={scope}><OrderScope orders={scoped} render={orderCard} /></CompactPanel>;
        })}</CompactTabs>}
        {!d.orders.length && page === 'pedidos' && <Empty icon={<ShoppingBag size={30} />}>Crie o primeiro pedido a partir dos produtos do cardápio.</Empty>}
      </>}

      {page === 'cozinha' && <><Title eyebrow="Passe da cozinha" title="Cada pedido no seu tempo" action={<Badge>Preparo por item</Badge>} /><div className="artemis-kitchen">{['Aceito', 'Em preparo', 'Pronto'].map(status => <section key={status}><div className="artemis-lane-title"><h2>{status === 'Aceito' ? 'A preparar' : status}</h2><span>{active.filter(order => order.status === status).length}</span></div>{active.filter(order => order.status === status).map(order => orderCard(order, true))}{!active.some(order => order.status === status) && <Empty>Sem pedidos nesta etapa.</Empty>}</section>)}</div></>}

      {page === 'mesas' && <><Title eyebrow="Salão" title="Mesas e comandas" action={<Button onClick={() => setNewTable(true)}><Plus size={18} />Cadastrar mesa</Button>} /><div className="op-inline-legend"><span>Livre</span><Badge>Comanda aberta</Badge></div><div className="artemis-tables">{d.tables.map(table => {
        const list = tableOrders(d, table);
        const amount = tableBalance(d, table);
        return <article className={`artemis-table ${table.openedAt ? 'occupied' : ''}`} key={table.id}>
          <div className="table-label"><UtensilsCrossed size={20} /><strong>{table.name}</strong><small>{table.seats} lugares</small></div>
          <div className="table-status"><Badge>{table.openedAt ? 'Comanda aberta' : 'Livre'}</Badge>{table.openedAt && <><strong>{money(amount)}</strong><small>Saldo da comanda</small></>}</div>
          {table.openedAt ? <><div className="table-orders">{list.map(order => <button key={order.id} className="op-text-link" onClick={() => setSelected(order.id)}>Pedido #{order.number} · {order.status}<ArrowRight size={14} /></button>)}</div><Button onClick={() => addOrder(table.id)}><Plus size={16} />Lançar pedido</Button><Button variant="secondary" onClick={() => setCheckout(table.id)}>Fechar / receber comanda</Button></> : <Button variant="secondary" onClick={() => w.mutate(data => { const currentTable = data.tables.find(item => item.id === table.id)!; if (currentTable.openedAt) throw new Error('Esta mesa já está aberta.'); currentTable.openedAt = now(); currentTable.closedAt = ''; }, 'Comanda aberta.')}>Abrir comanda</Button>}
        </article>;
      })}</div>{!d.tables.length && <Empty icon={<UtensilsCrossed size={30} />}>Cadastre as mesas reais do seu salão para abrir comandas.</Empty>}</>}

      {(page === 'cardapio' || page === 'cardapio-digital') && <>
        <Title eyebrow={page === 'cardapio-digital' ? 'Prévia no atendimento' : 'Catálogo do restaurante'} title={page === 'cardapio-digital' ? (d.settings.business || 'Cardápio') : 'O que a casa serve'} action={page === 'cardapio' ? <><Link className="op-button secondary" href="/artemis/cardapio-digital">Ver cardápio</Link><Button onClick={() => setProduct('new')}><Plus size={18} />Novo produto</Button></> : <Button onClick={() => addOrder()}>Montar pedido <ShoppingBag size={17} /></Button>} />
        {page === 'cardapio-digital' && <p className="op-callout">Cardápio disponível neste navegador. O link público para outros dispositivos será conectado junto com o restaurante.</p>}
        <div className="op-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Buscar produto ou ingrediente" /><div className="op-tabs">{categories.map(item => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        <div className="artemis-menu">{d.products.filter(item => (category === 'Todos' || item.category === category) && `${item.name} ${item.description} ${item.allergens}`.toLowerCase().includes(query.toLowerCase())).map(item => <article key={item.id} className={`artemis-menu-item ${!item.available ? 'unavailable' : ''}`}><span className="op-kicker">{item.category}</span><h2>{item.name}</h2>{operation.fieldVisible('productDescription') && <p>{item.description || 'Sem descrição cadastrada.'}</p>}{operation.fieldVisible('ingredients') && item.allergens && <small>Ingredientes / alergênicos: {item.allergens}</small>}<div><strong>{money(item.price)}</strong><span className="op-muted">{operation.fieldVisible('prepTime') && item.preparation > 0 ? `${item.preparation} min` : ''}</span></div>{page === 'cardapio' ? <footer><Button variant="secondary" onClick={() => setProduct(item)}>Editar</Button><button className="op-toggle" aria-pressed={item.available} onClick={() => w.mutate(data => { const productItem = data.products.find(currentItem => currentItem.id === item.id)!; productItem.available = !productItem.available; })}><i />{item.available ? 'Disponível' : 'Indisponível'}</button></footer> : <Badge>{item.available ? 'Disponível' : 'Indisponível'}</Badge>}</article>)}</div>
        {!d.products.length && <Empty icon={<ChefHat size={30} />}>Cadastre os produtos, preços e categorias do seu cardápio.</Empty>}
      </>}

      {page === 'caixa' && <Cash w={w} onOrder={setSelected} />}

      {page === 'estoque' && <><Title eyebrow="Despensa" title="Estoque e reposição" action={<Link href="/artemis/cardapio" className="op-button secondary">Cadastrar produto</Link>} /><p className="op-callout">Os produtos controlados são reservados ao aceitar o pedido e consumidos ao iniciar o preparo.</p><div className="op-list">{d.products.map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{item.name}</strong><small>{item.category} · {item.stockControlled ? 'Controle ativo' : 'Sem baixa automática'}</small></div><span><strong>{item.stock}</strong> em estoque<small>{reserved(d, item.id)} reservado(s)</small></span><Badge tone={item.stockControlled && item.stock - reserved(d, item.id) <= item.minimum ? 'warning' : ''}>{item.stockControlled && item.stock - reserved(d, item.id) <= item.minimum ? 'Repor estoque' : `Mínimo: ${item.minimum}`}</Badge><Button variant="secondary" onClick={() => setStock(item)}>Movimentar</Button></div>)}</div>{!d.products.length && <Empty>Os produtos cadastrados no cardápio também aparecem aqui.</Empty>}<Section title="Últimas movimentações">{[...d.stockMovements].reverse().slice(0, 30).map(movement => <div className="op-row" key={movement.id}><div className="op-grow"><strong>{d.products.find(item => item.id === movement.productId)?.name}</strong><small>{movement.note} · {date(movement.at, true)}</small></div><strong>{movement.amount > 0 ? '+' : ''}{movement.amount}</strong></div>)}</Section></>}

      {page === 'clientes' && <CustomerManager w={w} onOpen={customer => <Section title="Pedidos do cliente">{d.orders.filter(order => order.customerId === customer.id).map(order => <div className="op-row" key={order.id}><strong>#{order.number}</strong><span>{date(order.createdAt)} · {order.channel}</span><Badge>{order.status}</Badge><b>{money(orderTotal(order))}</b></div>)}</Section>} />}

      {page === 'relatorios' && <><Title eyebrow="Fechamento da operação" title="Vendas e recebimentos" action={<Button variant="secondary" onClick={() => csv('vendas-artemis.csv', [['Pedido', 'Data', 'Canal', 'Situação', 'Vendido', 'Recebido'], ...reportOrders.map(order => [order.number, date(order.createdAt), order.channel, order.status, (orderTotal(order) / 100).toFixed(2), (paid(d, order.id) / 100).toFixed(2)])])}><FileDown size={17} />Exportar período</Button>} /><div className="op-toolbar"><label className="op-field"><span>De</span><input type="date" value={from} onChange={change => setFrom(change.target.value)} /></label><label className="op-field"><span>Até</span><input type="date" value={to} onChange={change => setTo(change.target.value)} /></label></div><div className="op-report-totals"><div><span>Vendas registradas</span><strong>{money(reportOrders.reduce((sum, order) => sum + orderTotal(order), 0))}</strong><small>Pedidos não cancelados, pagos ou em aberto.</small></div><div><span>Recebimentos líquidos</span><strong>{money(reportPayments.reduce((sum, payment) => sum + payment.amount, 0) - d.movements.filter(movement => movement.kind === 'Devolução' && movement.at.slice(0, 10) >= from && movement.at.slice(0, 10) <= to).reduce((sum, movement) => sum + movement.amount, 0))}</strong><small>Recebimentos menos devoluções no período.</small></div><div><span>Ticket médio</span><strong>{money(reportOrders.length ? Math.round(reportOrders.reduce((sum, order) => sum + orderTotal(order), 0) / reportOrders.length) : 0)}</strong><small>Vendas não canceladas ÷ pedidos não cancelados.</small></div></div><Section title="Vendas por canal">{['Mesa', 'Balcão', 'Delivery', 'Retirada'].map(channel => <div className="op-row" key={channel}><strong className="op-grow">{channel}</strong><span>{reportOrders.filter(order => order.channel === channel).length} pedidos</span><strong>{money(reportOrders.filter(order => order.channel === channel).reduce((sum, order) => sum + orderTotal(order), 0))}</strong></div>)}</Section><Section title="Recebimentos por forma">{paymentMethods.map(method => <div className="op-row" key={method}><strong className="op-grow">{method}</strong><span>{money(reportPayments.filter(payment => payment.method === method).reduce((sum, payment) => sum + payment.amount, 0))}</span></div>)}</Section></>}
    </>}

    {newOrder && <Modal title="Novo pedido" wide onClose={() => setNewOrder(false)}><NewOrder w={w} tableId={tableId} onClose={() => setNewOrder(false)} onCreated={id => setSelected(id)} /></Modal>}
    {newTable && <Modal title="Cadastrar mesa" onClose={() => setNewTable(false)}><TableForm w={w} onClose={() => setNewTable(false)} /></Modal>}
    {checkout && <Modal title={`Fechar ${d.tables.find(table => table.id === checkout)?.name || 'comanda'}`} wide onClose={() => setCheckout('')}><TableCheckout w={w} tableId={checkout} onClose={() => setCheckout('')} onOrder={setSelected} /></Modal>}
    {product && <Modal title={product === 'new' ? 'Novo produto' : 'Editar produto'} onClose={() => setProduct(null)}><ProductForm w={w} product={product === 'new' ? undefined : product} onClose={() => setProduct(null)} /></Modal>}
    {stock && <Modal title={`Movimentar ${stock.name}`} onClose={() => setStock(null)}><RecordForm draftKey={`artemis-stock:${stock.id}`} fields={[{ name: 'kind', label: 'Operação', required: true, options: ['Entrada', 'Perda', 'Ajuste de saída'].map(value => ({ value, label: value })) }, { name: 'amount', label: 'Quantidade', type: 'number', required: true, min: 0.01, step: 0.01 }, { name: 'note', label: 'Motivo / fornecedor', required: true, wide: true }]} onClose={() => setStock(null)} onSave={values => w.mutate(data => { const item = data.products.find(productItem => productItem.id === stock.id)!; const amount = Number(values.amount) * (values.kind === 'Entrada' ? 1 : -1); if (item.stock + amount < reserved(data, item.id)) throw new Error('A saída compromete o estoque reservado ou deixa saldo negativo.'); item.stock += amount; data.stockMovements.push({ id: uid(), productId: item.id, amount, note: `${values.kind}: ${values.note}`, at: now() }); })} /></Modal>}
  </>;
}

function TableForm({ w, onClose }: { w: Workspace; onClose: () => void }) {
  const operation = useOperationPreferences('artemis');
  const custom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Mesa / comanda');
  return <RecordForm draftKey="artemis-table:new" fields={[{ name: 'name', label: operation.label('tableName', 'Nome ou número da mesa'), required: true }, ...(operation.fieldVisible('tableSeats') ? [{ name: 'seats', label: operation.label('tableSeats', 'Lugares'), type: 'number', min: 1, step: 1, required: true }] : []), ...custom.map(field => ({ name: `custom__${field.id}`, label: field.label }))]} onClose={onClose} onSave={values => w.mutate(data => { if (data.tables.some(table => table.name.toLowerCase() === values.name.trim().toLowerCase())) throw new Error('Esta mesa já existe.'); const id = uid(); data.tables.push({ id, name: values.name.trim(), seats: Number(values.seats || 1), openedAt: '', closedAt: '' }); setCustomValues(data, id, Object.fromEntries(custom.map(field => [field.id, values[`custom__${field.id}`] || '']))); })} />;
}

function ProductForm({ w, product, onClose }: { w: Workspace; product?: Product; onClose: () => void }) {
  const operation = useOperationPreferences('artemis');
  const custom = operation.preferences.customFields.filter(field => field.visible && field.group === 'Produto');
  return <RecordForm draftKey={`artemis-product:${product?.id || 'new'}`} fields={[
    { name: 'name', label: operation.label('productName', 'Nome'), required: true, value: product?.name },
    { name: 'category', label: operation.label('category', 'Categoria'), required: true, value: product?.category },
    { name: 'price', label: `${operation.label('price', 'Preço')} (R$)`, type: 'number', min: 0, step: 0.01, required: true, value: product ? product.price / 100 : undefined },
    ...(operation.fieldVisible('prepTime') ? [{ name: 'preparation', label: `${operation.label('prepTime', 'Preparo estimado')} (min)`, type: 'number', min: 0, step: 1, value: product?.preparation || 0 }] : []),
    ...(operation.fieldVisible('productDescription') ? [{ name: 'description', label: operation.label('productDescription', 'Descrição'), type: 'textarea', wide: true, value: product?.description }] : []),
    ...(operation.fieldVisible('ingredients') ? [{ name: 'allergens', label: operation.label('ingredients', 'Ingredientes e alergênicos'), wide: true, value: product?.allergens }] : []),
    { name: 'stockControlled', label: 'Controlar estoque', value: product?.stockControlled ? 'sim' : 'nao', options: [{ value: 'nao', label: 'Não' }, { value: 'sim', label: 'Sim' }] },
    { name: 'minimum', label: 'Estoque mínimo', type: 'number', min: 0, step: 0.01, value: product?.minimum || 0 },
    ...custom.map(field => ({ name: `custom__${field.id}`, label: field.label, value: product ? customValues(w.data, product.id)[field.id] || '' : '' }))
  ]} onClose={onClose} onSave={values => w.mutate(data => {
    const previous = product ? data.products.find(item => item.id === product.id) : undefined;
    const value: Product = {
      id: product?.id || uid(),
      name: values.name.trim(), category: values.category.trim(), price: cents(values.price),
      description: values.description !== undefined ? values.description : previous?.description || '',
      allergens: values.allergens !== undefined ? values.allergens : previous?.allergens || '',
      preparation: values.preparation !== undefined ? Number(values.preparation || 0) : previous?.preparation || 0,
      stockControlled: values.stockControlled === 'sim', stock: previous?.stock || 0,
      minimum: Number(values.minimum || 0), available: previous?.available ?? true
    };
    const index = data.products.findIndex(item => item.id === value.id);
    if (index < 0) data.products.push(value); else data.products[index] = value;
    setCustomValues(data, value.id, Object.fromEntries(custom.map(field => [field.id, values[`custom__${field.id}`] || customValues(data, value.id)[field.id] || ''])));
  })} />;
}

function NewOrder({ w, tableId, onCreated, onClose }: { w: Workspace; tableId: string; onCreated: (id: string) => void; onClose: () => void }) {
  const operation = useOperationPreferences('artemis');
  const availableChannels = [operation.actionVisible('counter') && 'Balcão', operation.actionVisible('dineIn') && 'Mesa', operation.actionVisible('delivery') && 'Delivery', operation.actionVisible('pickup') && 'Retirada'].filter(Boolean) as Order['channel'][];
  const [cart, setCart] = useState<Record<string, number>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState<Order['channel']>(tableId ? 'Mesa' : (availableChannels[0] || 'Balcão'));
  const [table, setTable] = useState(tableId);
  const [query, setQuery] = useState('');
  const [customer, setCustomer] = useState('');
  const items = w.data.products.filter(product => cart[product.id]);
  const sum = items.reduce((totalValue, productItem) => totalValue + productItem.price * cart[productItem.id], 0);
  const fee = channel === 'Delivery' ? w.data.settings.deliveryFee : 0;
  const increment = (id: string, value: number) => setCart(current => ({ ...current, [id]: Math.max(0, (current[id] || 0) + value) }));
  const customGroups = ['Cliente', 'Pedido', ...(channel === 'Delivery' ? ['Delivery'] : []), ...(channel === 'Mesa' ? ['Mesa / comanda'] : [])];

  return <>
    <div className="op-tabs">{availableChannels.map(value => <button className={channel === value ? 'active' : ''} onClick={() => setChannel(value)} key={value}>{value}</button>)}</div>
    <div className="artemis-order-builder"><div><SearchBox value={query} onChange={setQuery} placeholder="Buscar no cardápio" /><div className="artemis-product-picker">{w.data.products.filter(productItem => productItem.available && productItem.name.toLowerCase().includes(query.toLowerCase())).map(productItem => <button key={productItem.id} onClick={() => increment(productItem.id, 1)}><strong>{productItem.name}</strong><small>{productItem.category}</small><span>{money(productItem.price)} <Plus size={16} /></span></button>)}</div>{!w.data.products.some(productItem => productItem.available) && <Empty>Cadastre produtos disponíveis no cardápio antes de lançar um pedido.</Empty>}</div><aside className="artemis-cart"><h3>Comanda do pedido</h3>{items.map(productItem => <div className="cart-line" key={productItem.id}><strong>{productItem.name}</strong><div><button type="button" aria-label={`Diminuir ${productItem.name}`} onClick={() => increment(productItem.id, -1)}><Minus size={14} /></button><span>{cart[productItem.id]}</span><button type="button" aria-label={`Adicionar ${productItem.name}`} onClick={() => increment(productItem.id, 1)}><Plus size={14} /></button><b>{money(cart[productItem.id] * productItem.price)}</b></div><label className="op-field"><span>Observação deste item</span><input value={lineNotes[productItem.id] || ''} onChange={change => setLineNotes({ ...lineNotes, [productItem.id]: change.target.value })} placeholder="Ex.: sem cebola, molho à parte" /></label></div>)}{!items.length && <p className="op-muted">Toque nos produtos para adicionar.</p>}{fee > 0 && <p>Entrega: {money(fee)}</p>}<div className="op-document-total"><span>Total</span><strong>{money(sum + fee)}</strong></div></aside></div>
    {channel === 'Mesa' && <label className="op-field"><span>Comanda aberta *</span><select value={table} onChange={change => setTable(change.target.value)}><option value="">Selecionar mesa</option>{w.data.tables.filter(item => item.openedAt).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
    <label className="op-field"><span>Cliente cadastrado</span><select value={customer} onChange={change => setCustomer(change.target.value)}><option value="">Novo cliente / atendimento avulso</option>{w.data.customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <RecordForm draftKey={`artemis-order:${tableId || 'avulso'}:${channel}`} key={customer + channel} fields={[
      ...(!customer ? [...(operation.fieldVisible('customerName') ? [{ name: 'name', label: operation.label('customerName', 'Nome do cliente'), required: ['Delivery', 'Retirada'].includes(channel) }] : []), ...(operation.fieldVisible('customerPhone') ? [{ name: 'phone', label: operation.label('customerPhone', 'Telefone'), type: 'tel', required: ['Delivery', 'Retirada'].includes(channel) }] : [])] : []),
      ...(channel === 'Delivery' && operation.fieldVisible('deliveryAddress') ? [{ name: 'address', label: operation.label('deliveryAddress', 'Endereço completo (rua, número, bairro)'), required: true, wide: true }] : []),
      ...(operation.fieldVisible('orderNotes') ? [{ name: 'notes', label: operation.label('orderNotes', 'Observações gerais do pedido'), type: 'textarea', wide: true }] : []),
      ...customDefs(operation, customGroups)
    ]} onClose={onClose} submit="Confirmar pedido" onSave={values => w.mutate(data => {
      if (!items.length) throw new Error('Adicione ao menos um produto.');
      if (channel === 'Mesa' && !data.tables.some(item => item.id === table && item.openedAt)) throw new Error('Selecione uma comanda aberta.');
      let customerId = customer;
      let existing = data.customers.find(item => item.id === customer);
      if (!customerId && values.name?.trim()) {
        const phone = values.phone?.replace(/\D/g, '') || '';
        const found = phone ? data.customers.find(item => item.phone.replace(/\D/g, '') === phone) : undefined;
        if (found) { customerId = found.id; existing = found; }
        else { customerId = uid(); existing = { id: customerId, name: values.name, phone: values.phone || '', email: '', notes: '' }; data.customers.push(existing); }
      }
      const lines: Line[] = items.map(productItem => {
        const currentProduct = data.products.find(item => item.id === productItem.id);
        if (!currentProduct?.available || currentProduct.price !== productItem.price) throw new Error('O cardápio mudou. Reabra o pedido e confira os itens.');
        return { id: uid(), kind: 'Produto', description: productItem.name, brand: '', quantity: cart[productItem.id], price: currentProduct.price, productId: productItem.id, done: false, note: lineNotes[productItem.id]?.trim() || '', prepMinutes: currentProduct.preparation || 0 };
      });
      if (channel === 'Delivery' && sum < data.settings.minimumOrder) throw new Error(`Pedido mínimo: ${money(data.settings.minimumOrder)}.`);
      const order: Order = { id: uid(), number: nextNumber(data.orders), customerId, customerName: existing?.name || values.name || '', phone: existing?.phone || values.phone || '', address: values.address || '', channel, tableId: channel === 'Mesa' ? table : '', tableSession: channel === 'Mesa' ? data.tables.find(item => item.id === table)!.openedAt : undefined, lines, notes: values.notes || '', status: 'Novo', delivery: channel === 'Delivery' ? 'Aguardando saída' : '', fee: channel === 'Delivery' ? data.settings.deliveryFee : 0, discount: 0, createdAt: now(), events: [event('Pedido criado pelo atendimento')], stockConsumed: false, reserved: false };
      data.orders.push(order);
      const custom = customFromForm(operation, customGroups, values);
      setCustomValues(data, order.id, custom);
      if (customerId) setCustomValues(data, customerId, Object.fromEntries(operation.preferences.customFields.filter(field => field.group === 'Cliente').map(field => [field.id, custom[field.id] || customValues(data, customerId)[field.id] || ''])));
      onCreated(order.id);
    }, 'Pedido registrado.')} />
  </>;
}

function OrderDetail({ w, order, onBack }: { w: Workspace; order: Order; onBack: () => void }) {
  const operation = useOperationPreferences('artemis');
  const [cancel, setCancel] = useState(false);
  const [payment, setPayment] = useState(false);
  const [refund, setRefund] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const d = w.data;
  const steps = ['Novo', 'Aceito', 'Em preparo', 'Pronto', 'Concluído'];
  const active = !['Concluído', 'Cancelado'].includes(order.status);
  const custom = operation.preferences.customFields.filter(field => field.visible && ['Pedido', 'Delivery', 'Mesa / comanda'].includes(field.group));
  const values = customValues(d, order.id);
  let nextLabel: string | undefined;
  let onNext: (() => void) | undefined;
  if (active) {
    if (order.status === 'Pronto' && order.channel === 'Delivery') {
      nextLabel = order.delivery === 'Aguardando saída' ? 'Registrar saída para entrega' : order.delivery === 'Saiu para entrega' ? 'Confirmar entrega e concluir' : 'Concluir pedido';
      onNext = () => { void w.mutate(data => advanceDelivery(data, order.id), order.delivery === 'Saiu para entrega' ? 'Entrega confirmada e pedido concluído.' : 'Entrega atualizada.'); };
    } else {
      nextLabel = ({ Novo: 'Aceitar pedido', Aceito: 'Iniciar preparo', 'Em preparo': order.lines.some(line => !line.done) ? 'Concluir itens pendentes' : 'Marcar pedido como pronto', Pronto: 'Concluir pedido' } as Record<string, string>)[order.status];
      onNext = order.status === 'Em preparo' && order.lines.some(line => !line.done) ? () => {} : () => { void w.mutate(data => advanceOrder(data, order.id, order.status), 'Pedido atualizado.'); };
    }
  }

  return <>
    <Button variant="text" onClick={onBack}><ArrowLeft size={17} />Voltar</Button>
    <Title eyebrow={`${order.channel}${order.channel === 'Mesa' ? ` · ${d.tables.find(table => table.id === order.tableId)?.name}` : ''}`} title={`Pedido #${String(order.number).padStart(3, '0')}`}>{order.customerName || 'Atendimento de balcão'} · {date(order.createdAt, true)}</Title>
    <WorkflowControl label="Fluxo do pedido" steps={steps} current={steps.includes(order.status) ? order.status : 'Concluído'} status={order.status === 'Pronto' && order.channel === 'Delivery' ? order.delivery : order.status} nextLabel={nextLabel} onNext={onNext} disabled={order.status === 'Em preparo' && order.lines.some(line => !line.done)} />
    {order.status === 'Em preparo' && order.lines.some(line => !line.done) && <p className="op-callout">Ainda existem {order.lines.filter(line => !line.done).length} item(ns) pendente(s). Marque-os como prontos antes de finalizar o preparo.</p>}
    <div className="op-split">
      <Section title="Itens do pedido" action={active && ['Aceito', 'Em preparo'].includes(order.status) ? <Button variant="secondary" onClick={() => setAdjust(true)}><Plus size={16} />Adicionar item / alteração</Button> : undefined}>
        {order.lines.map(line => <div className="op-row" key={line.id}>{order.status === 'Em preparo' && <input aria-label={`Pronto: ${line.description}`} type="checkbox" checked={!!line.done} onChange={change => w.mutate(data => { const current = data.orders.find(item => item.id === order.id)!; if (current.status !== 'Em preparo') throw new Error('Pedido fora de preparo.'); const currentLine = current.lines.find(item => item.id === line.id)!; currentLine.done = change.target.checked; current.events.push(event(`${currentLine.done ? 'Item pronto' : 'Item reaberto'}: ${currentLine.description}`)); })} />}<span className="op-quantity">{line.quantity}×</span><div className="op-grow"><strong>{line.description}</strong><small>{money(line.price)} cada{line.done ? ' · Pronto' : ''}{line.prepMinutes ? ` · referência ${line.prepMinutes} min` : ''}</small>{line.note && <small><strong>Observação do item:</strong> {line.note}</small>}</div><strong>{money(line.price * line.quantity)}</strong></div>)}
        {order.notes && <p className="op-callout">Observação geral: {order.notes}</p>}
        {order.address && <p><strong>Entrega:</strong> {order.address} · {order.phone}</p>}
        {custom.length > 0 && <div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div>}
        <div className="op-record-secondary-actions">{active && operation.actionVisible('cancel') && <Button variant="danger" onClick={() => setCancel(true)}>Cancelar pedido</Button>}{order.channel === 'Mesa' && order.status !== 'Cancelado' && operation.actionVisible('transferTable') && <Button variant="secondary" onClick={() => setTransfer(true)}>Transferir mesa</Button>}</div>
      </Section>
      <Section title="Recebimento"><div className="op-money-stack"><div><span>Itens</span><b>{money(orderTotal(order) - order.fee + order.discount)}</b></div>{order.fee > 0 && <div><span>Taxa de entrega</span><b>{money(order.fee)}</b></div>}<div><span>Total</span><b>{money(orderTotal(order))}</b></div><div><span>Recebido</span><b>{money(paid(d, order.id))}</b></div><div className="remaining"><span>{order.status === 'Cancelado' ? 'A devolver' : 'Saldo'}</span><strong>{money(order.status === 'Cancelado' ? paid(d, order.id) : balance(d, order))}</strong></div></div>{order.channel === 'Mesa' && d.tables.find(table => table.id === order.tableId)?.openedAt ? <p className="op-muted">Para uma mesa, prefira “Fechar / receber comanda” na tela de Mesas: todos os pedidos entram na mesma conta.</p> : operation.actionVisible('payments') && balance(d, order) > 0 && order.status !== 'Cancelado' && <Button onClick={() => setPayment(true)}>Registrar recebimento</Button>}{operation.actionVisible('refunds') && order.status === 'Cancelado' && paid(d, order.id) > 0 && <Button onClick={() => setRefund(true)}>Registrar devolução</Button>}{d.payments.filter(item => item.orderId === order.id).map(item => <div className="op-row" key={item.id}><span>{item.method}<small>{date(item.at, true)}{item.refunded > 0 ? ` · Devolvido: ${money(item.refunded)}` : ''}</small></span><strong>{money(item.amount)}</strong></div>)}<p className="op-muted">Pix e cartão só contam como recebidos após confirmação manual.</p></Section>
    </div>
    <Section title="Linha do tempo"><Timeline events={order.events} /></Section>
    {cancel && <Modal title="Cancelar pedido" onClose={() => setCancel(false)}><RecordForm draftKey={`artemis-cancel:${order.id}`} fields={[{ name: 'reason', label: 'Motivo', required: true, type: 'textarea', wide: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={valuesForm => w.mutate(data => cancelOrder(data, order.id, valuesForm.reason))} /></Modal>}
    {payment && <Modal title="Confirmar recebimento" onClose={() => setPayment(false)}><p>Saldo: <strong>{money(balance(d, order))}</strong>.</p><RecordForm draftKey={`artemis-payment:${order.id}`} fields={[{ name: 'amount', label: 'Valor efetivamente recebido (R$)', type: 'number', min: 0.01, step: 0.01, required: true, value: balance(d, order) / 100 }, { name: 'method', label: 'Forma de pagamento', required: true, options: paymentMethods.map(value => ({ value, label: value })) }]} submit="Confirmar recebimento" onClose={() => setPayment(false)} onSave={valuesForm => w.mutate(data => receivePayment(data, order.id, cents(valuesForm.amount), valuesForm.method), 'Recebimento registrado.')} /></Modal>}
    {refund && <Confirm title="Confirmar devolução realizada?" onClose={() => setRefund(false)} onConfirm={() => w.mutate(data => { const shift = data.shifts.find(item => !item.closedAt); if (!shift) throw new Error('Abra o caixa para registrar a devolução.'); for (const item of data.payments.filter(item => item.orderId === order.id && item.amount > item.refunded)) { const amount = item.amount - item.refunded; data.movements.push({ id: uid(), shiftId: shift.id, kind: 'Devolução', amount, note: `Devolução do pedido ${order.number}`, at: now(), method: item.method }); item.refunded = item.amount; } data.orders.find(item => item.id === order.id)!.events.push(event('Devolução integral confirmada manualmente')); })}>Confirme apenas depois de devolver o valor ao cliente.</Confirm>}
    {transfer && <Modal title="Transferir pedido para outra mesa" onClose={() => setTransfer(false)}><RecordForm fields={[{ name: 'tableId', label: 'Comanda de destino', required: true, options: d.tables.filter(table => table.openedAt && table.id !== order.tableId).map(table => ({ value: table.id, label: table.name })) }]} onClose={() => setTransfer(false)} onSave={valuesForm => w.mutate(data => { if (!data.tables.some(table => table.id === valuesForm.tableId && table.openedAt)) throw new Error('A comanda de destino não está aberta.'); const current = data.orders.find(item => item.id === order.id)!; current.tableId = valuesForm.tableId; current.tableSession = data.tables.find(table => table.id === valuesForm.tableId)!.openedAt; current.events.push(event(`Transferido para ${data.tables.find(table => table.id === valuesForm.tableId)!.name}`)); })} /></Modal>}
    {adjust && <Modal title="Adicionar item ao pedido" onClose={() => setAdjust(false)}><OrderAdjustment w={w} order={order} onClose={() => setAdjust(false)} /></Modal>}
  </>;
}

function OrderAdjustment({ w, order, onClose }: { w: Workspace; order: Order; onClose: () => void }) {
  return <RecordForm draftKey={`artemis-adjust:${order.id}`} fields={[{ name: 'productId', label: 'Produto', required: true, options: w.data.products.filter(product => product.available).map(product => ({ value: product.id, label: `${product.name} · ${money(product.price)}` })) }, { name: 'quantity', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true, value: 1 }, { name: 'note', label: 'Observação deste item / alteração', type: 'textarea', wide: true }]} onClose={onClose} submit="Adicionar e avisar cozinha" onSave={values => w.mutate(data => {
    const current = data.orders.find(item => item.id === order.id)!;
    if (!['Aceito', 'Em preparo'].includes(current.status)) throw new Error('Acréscimos são permitidos apenas antes de o pedido ficar pronto.');
    const product = data.products.find(item => item.id === values.productId && item.available);
    if (!product) throw new Error('Produto indisponível.');
    const quantity = Number(values.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Informe uma quantidade válida.');
    if (product.stockControlled) {
      const available = product.stock - reserved(data, product.id, current.id);
      if (available < quantity) throw new Error(`Estoque insuficiente: ${product.name}.`);
      if (current.status === 'Em preparo') {
        product.stock -= quantity;
        data.stockMovements.push({ id: uid(), productId: product.id, amount: -quantity, note: `Acréscimo no pedido ${current.number}`, at: now() });
      }
    }
    current.lines.push({ id: uid(), kind: 'Produto', description: product.name, brand: '', quantity, price: product.price, productId: product.id, done: false, note: values.note?.trim() || '', prepMinutes: product.preparation || 0 });
    current.events.push(event(`${current.status === 'Em preparo' ? 'Acréscimo durante o preparo' : 'Acréscimo antes do preparo'}: ${quantity}× ${product.name}${values.note ? ` · ${values.note}` : ''}`));
  }, 'Item adicionado e sinalizado para a cozinha.')} />;
}

function TableCheckout({ w, tableId, onClose, onOrder }: { w: Workspace; tableId: string; onClose: () => void; onOrder: (id: string) => void }) {
  const table = w.data.tables.find(item => item.id === tableId)!;
  const orders = tableOrders(w.data, table);
  const validOrders = orders.filter(order => order.status !== 'Cancelado');
  const totalValue = validOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const received = validOrders.reduce((sum, order) => sum + paid(w.data, order.id), 0);
  const currentBalance = tableBalance(w.data, table);
  const [people, setPeople] = useState(1);
  const [amount, setAmount] = useState(currentBalance / 100);
  const [method, setMethod] = useState('Dinheiro');
  const [busy, setBusy] = useState(false);

  const submitPayment = async () => {
    setBusy(true);
    await w.mutate(data => receiveTablePayment(data, tableId, cents(amount), method), 'Recebimento da comanda registrado.');
    setBusy(false);
  };

  return <>
    <div className="op-report-totals"><div><span>Consumo</span><strong>{money(totalValue)}</strong><small>{validOrders.length} pedido(s) nesta comanda</small></div><div><span>Recebido</span><strong>{money(received)}</strong><small>Somando todas as formas de pagamento</small></div><div><span>Saldo</span><strong>{money(currentBalance)}</strong><small>Valor que ainda precisa ser resolvido</small></div></div>
    <Section title="Pedidos da comanda">{orders.map(order => <button className="op-row" key={order.id} onClick={() => onOrder(order.id)}><strong>#{order.number}</strong><span className="op-grow">{order.status}</span><span>{money(orderTotal(order))}<small>Saldo {money(balance(w.data, order))}</small></span><ArrowRight size={16} /></button>)}</Section>
    {currentBalance > 0 && <Section title="Dividir e receber"><div className="op-fields"><label className="op-field"><span>Dividir por pessoas</span><input type="number" min="1" step="1" value={people} onChange={change => { const count = Math.max(1, Number(change.target.value)); setPeople(count); setAmount(Math.ceil(currentBalance / count) / 100); }} /><small>Sugestão por pessoa: {money(Math.ceil(currentBalance / people))}. O último pagamento ajusta o centavo restante.</small></label><label className="op-field"><span>Valor recebido agora (R$)</span><input type="number" min="0.01" step="0.01" max={currentBalance / 100} value={amount} onChange={change => setAmount(Number(change.target.value))} /></label><label className="op-field"><span>Forma</span><select value={method} onChange={change => setMethod(change.target.value)}>{paymentMethods.map(value => <option key={value}>{value}</option>)}</select></label></div><Button disabled={busy || !amount || amount * 100 > currentBalance} onClick={() => { void submitPayment(); }}>{busy ? 'Registrando…' : 'Registrar esta parcela'}</Button></Section>}
    {currentBalance === 0 && <p className="op-callout">Saldo resolvido. A mesa só será liberada quando todos os pedidos ativos também estiverem concluídos.</p>}
    <div className="op-form-footer"><Button variant="secondary" onClick={onClose}>Voltar</Button><Button disabled={currentBalance > 0 || validOrders.some(order => order.status !== 'Concluído')} onClick={async () => { if (await w.mutate(data => closeTable(data, tableId), 'Mesa liberada.')) onClose(); }}>Liberar mesa</Button></div>
  </>;
}

function Cash({ w, onOrder }: { w: Workspace; onOrder: (id: string) => void }) {
  const operation = useOperationPreferences('artemis');
  const [mode, setMode] = useState('');
  const d = w.data;
  const shift = d.shifts.find(item => !item.closedAt);
  const payments = shift ? d.payments.filter(item => item.shiftId === shift.id) : [];
  return <>
    <Title eyebrow="Caixa do restaurante" title={shift ? 'Turno em andamento' : 'Abra o próximo turno'} action={shift ? <><Button variant="secondary" onClick={() => setMode('movement')}>Movimentar caixa</Button><Button onClick={() => setMode('close')}>Conferir e fechar</Button></> : <Button onClick={() => setMode('open')}><Plus size={18} />Abrir caixa</Button>} />
    {shift ? <><div className="artemis-cash"><div><span>Dinheiro esperado na gaveta</span><strong>{money(cashExpected(d, shift))}</strong><small>Troco inicial + entradas − saídas em dinheiro</small></div><div><span>Aberto por {shift.operator}</span><strong className="cash-date">{date(shift.openedAt, true)}</strong><small>Troco inicial: {money(shift.initial)}</small></div></div><Section title="Recebimentos do turno">{payments.length ? payments.map(payment => <button className="op-row" key={payment.id} onClick={() => onOrder(payment.orderId)}><strong className="op-grow">Pedido #{d.orders.find(order => order.id === payment.orderId)?.number}</strong><span>{payment.method}</span><strong>{money(payment.amount)}</strong><ArrowRight size={16} /></button>) : <Empty>Nenhum recebimento neste turno.</Empty>}</Section><Section title="Movimentações">{d.movements.filter(movement => movement.shiftId === shift.id).map(movement => <div className="op-row" key={movement.id}><div className="op-grow"><strong>{movement.kind}</strong><small>{movement.note} · {movement.method || 'Dinheiro'}</small></div><strong>{money(movement.amount)}</strong></div>)}</Section></> : <Empty icon={<ShoppingBag size={28} />}>Informe o operador e o valor inicial de troco. Pedidos podem ser criados antes da abertura.</Empty>}
    <Section title="Pedidos com saldo a receber">{d.orders.filter(order => order.status !== 'Cancelado' && balance(d, order) > 0).map(order => <button className="op-row" key={order.id} onClick={() => onOrder(order.id)}><strong>Pedido #{order.number}</strong><span className="op-grow">{order.customerName || order.channel}</span><b>{money(balance(d, order))}</b><ArrowRight size={16} /></button>)}</Section>
    <Section title="Turnos encerrados">{[...d.shifts].filter(item => item.closedAt).reverse().map(item => <div className="op-row" key={item.id}><div className="op-grow"><strong>{date(item.closedAt, true)}</strong><small>{item.operator} · {item.note || 'Sem observação'}</small></div><span>Contado: {money(item.counted)}<small>Diferença: {money(item.counted - cashExpected(d, item))}</small></span></div>)}</Section>
    {mode && <Modal title={mode === 'open' ? 'Abrir caixa' : mode === 'close' ? 'Conferência de caixa' : 'Movimentação em dinheiro'} onClose={() => setMode('')}>{mode === 'close' && shift && <p>Dinheiro esperado: <strong>{money(cashExpected(d, shift))}</strong>. Pix e cartões não compõem o dinheiro físico.</p>}<RecordForm draftKey={`artemis-cash:${mode}`} fields={mode === 'open' ? [{ name: 'operator', label: operation.label('cashOperator', 'Operador'), required: true, value: d.settings.operator }, { name: 'amount', label: 'Troco inicial (R$)', type: 'number', min: 0, step: 0.01, required: true }] : mode === 'close' ? [{ name: 'amount', label: 'Dinheiro contado (R$)', type: 'number', min: 0, step: 0.01, required: true }, { name: 'note', label: 'Justificativa de diferença / observações', type: 'textarea', wide: true }] : [{ name: 'kind', label: 'Tipo', required: true, options: ['Suprimento', 'Sangria', 'Despesa'].map(value => ({ value, label: value })) }, { name: 'amount', label: 'Valor (R$)', type: 'number', min: 0.01, step: 0.01, required: true }, { name: 'note', label: 'Motivo', required: true, wide: true }]} onClose={() => setMode('')} submit={mode === 'close' ? 'Confirmar fechamento' : 'Registrar'} onSave={values => w.mutate(data => { const current = data.shifts.find(item => !item.closedAt); const amountValue = cents(values.amount); if (mode === 'open') { if (current) throw new Error('Já existe um turno aberto.'); data.shifts.push({ id: uid(), openedAt: now(), closedAt: '', initial: amountValue, counted: 0, note: '', operator: values.operator }); } else { if (!current) throw new Error('Não há turno aberto.'); if (mode === 'close') { if (amountValue !== cashExpected(data, current) && !values.note.trim()) throw new Error('Justifique a diferença entre o esperado e o contado.'); current.counted = amountValue; current.closedAt = now(); current.note = values.note; } else { if (values.kind !== 'Suprimento' && amountValue > cashExpected(data, current)) throw new Error('Saída superior ao dinheiro disponível.'); data.movements.push({ id: uid(), shiftId: current.id, kind: values.kind as 'Suprimento' | 'Sangria' | 'Despesa', amount: amountValue, note: values.note, at: now() }); } } })} /></Modal>}
  </>;
}


function OrderScope({ orders, render }: { orders: Order[]; render: (order: Order) => React.ReactNode }) {
  const [status,setStatus] = useState('Todos');
  const statuses = [...new Set(orders.map(order => order.status))];
  const visible = orders.filter(order => status === 'Todos' || order.status === status);
  return <><div className="op-toolbar"><select aria-label="Filtrar situação do pedido" value={status} onChange={event => setStatus(event.target.value)}><option>Todos</option>{[...new Set([...statuses,...(status === 'Todos' ? [] : [status])])].map(item => <option key={item}>{item}</option>)}</select></div><div className="artemis-tickets">{visible.map(order => render(order))}</div>{!visible.length && <Empty>Nenhum pedido nesta seleção.</Empty>}</>;
}
