'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import {
  Order, advanceDelivery, advanceOrder, balance, cancelOrder, cents, customValues,
  date, event, money, now, orderTotal, paid, receivePayment, reserved, uid
} from '@/lib/operations/model';
import { learnProductSuggestions } from '@/lib/operations/learning';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Workspace } from '@/lib/operations/storage';
import { Badge, Button, Confirm, Empty, Modal, RecordForm, Section, Timeline, Title } from './ui';
import { WorkflowControl } from './WorkflowControl';

const paymentMethods = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];

export function LeanArtemisOrderDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  const router = useRouter();
  const operation = useOperationPreferences('artemis');
  const [cancel, setCancel] = useState(false);
  const [payment, setPayment] = useState(false);
  const [refund, setRefund] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const d = w.data;
  const order = d.orders.find(item => item.id === recordId);

  if (!order) return <>
    <Button variant="text" onClick={() => router.push('/artemis/pedidos')}><ArrowLeft size={17} />Voltar aos pedidos</Button>
    <Empty>Este pedido não foi encontrado.</Empty>
  </>;

  const steps = ['Novo', 'Aceito', 'Em preparo', 'Pronto', 'Concluído'];
  const active = !['Concluído', 'Cancelado'].includes(order.status);
  const custom = operation.preferences.customFields.filter(field => field.visible && ['Pedido', 'Delivery', 'Mesa / comanda'].includes(field.group));
  const values = customValues(d, order.id);
  const pendingItems = order.lines.filter(line => !line.done);
  const received = paid(d, order.id);
  const remaining = order.status === 'Cancelado' ? received : balance(d, order);

  let nextLabel: string | undefined;
  let onNext: (() => void) | undefined;
  if (active) {
    if (order.status === 'Pronto' && order.channel === 'Delivery') {
      nextLabel = order.delivery === 'Aguardando saída' ? 'Registrar saída para entrega' : order.delivery === 'Saiu para entrega' ? 'Confirmar entrega e concluir' : 'Concluir pedido';
      onNext = () => { void w.mutate(data => advanceDelivery(data, order.id), order.delivery === 'Saiu para entrega' ? 'Entrega confirmada e pedido concluído.' : 'Entrega atualizada.'); };
    } else if (order.status === 'Em preparo' && pendingItems.length) {
      nextLabel = `Concluir ${pendingItems.length} item(ns) abaixo`;
      onNext = () => document.getElementById('artemis-current-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      nextLabel = ({ Novo: 'Aceitar pedido', Aceito: 'Iniciar preparo', 'Em preparo': 'Marcar pedido como pronto', Pronto: 'Concluir pedido' } as Record<string, string>)[order.status];
      onNext = nextLabel ? () => { void w.mutate(data => advanceOrder(data, order.id, order.status), 'Pedido atualizado.'); } : undefined;
    }
  }

  return <>
    <Button variant="text" onClick={() => router.push('/artemis/pedidos')}><ArrowLeft size={17} />Voltar aos pedidos</Button>
    <Title eyebrow={`${order.channel}${order.channel === 'Mesa' ? ` · ${d.tables.find(table => table.id === order.tableId)?.name}` : ''}`} title={`Pedido #${String(order.number).padStart(3, '0')}`}>
      {order.customerName || 'Atendimento de balcão'} · {date(order.createdAt, true)}
    </Title>

    <WorkflowControl label="Fluxo do pedido" steps={steps} current={steps.includes(order.status) ? order.status : 'Concluído'} status={order.status === 'Pronto' && order.channel === 'Delivery' ? order.delivery : order.status} nextLabel={nextLabel} onNext={onNext} />

    <div className="op-split" id="artemis-current-work">
      <Section title={order.status === 'Em preparo' ? 'Cozinha agora' : 'Itens do pedido'} action={active && ['Aceito', 'Em preparo'].includes(order.status) ? <Button variant="secondary" onClick={() => setAdjust(true)}><Plus size={16} />Adicionar item</Button> : undefined}>
        {order.lines.map(line => <div className="op-row" key={line.id}>
          {order.status === 'Em preparo' && <input aria-label={`Pronto: ${line.description}`} type="checkbox" checked={!!line.done} onChange={change => w.mutate(data => {
            const current = data.orders.find(item => item.id === order.id)!;
            if (current.status !== 'Em preparo') throw new Error('Pedido fora de preparo.');
            const currentLine = current.lines.find(item => item.id === line.id)!;
            currentLine.done = change.target.checked;
            current.events.push(event(`${currentLine.done ? 'Item pronto' : 'Item reaberto'}: ${currentLine.description}`));
          })} />}
          <span className="op-quantity">{line.quantity}×</span>
          <div className="op-grow"><strong>{line.description}</strong><small>{money(line.price)} cada{line.done ? ' · Pronto' : ''}{line.prepMinutes ? ` · referência ${line.prepMinutes} min` : ''}</small>{line.note && <small><strong>Observação:</strong> {line.note}</small>}</div>
          <strong>{money(line.price * line.quantity)}</strong>
        </div>)}
        {!order.lines.length && <Empty>Pedido sem itens.</Empty>}
        {order.notes && <p className="op-callout">{order.notes}</p>}
        {order.address && <p><strong>Entrega:</strong> {order.address} · {order.phone}</p>}
        {custom.length > 0 && <details><summary>Dados adicionais do pedido</summary><div className="op-detail-pairs">{custom.map(field => <div key={field.id}><span>{field.label}</span><strong>{values[field.id] || 'Não informado'}</strong></div>)}</div></details>}
      </Section>

      <Section title="Conta do pedido">
        <div className="op-money-stack">
          <div><span>Total</span><b>{money(orderTotal(order))}</b></div>
          <div><span>Recebido</span><b>{money(received)}</b></div>
          <div className="remaining"><span>{order.status === 'Cancelado' ? 'A devolver' : 'Saldo'}</span><strong>{money(remaining)}</strong></div>
        </div>
        {order.channel === 'Mesa' && d.tables.find(table => table.id === order.tableId)?.openedAt
          ? <p className="op-muted">O recebimento desta mesa é consolidado na comanda.</p>
          : operation.actionVisible('payments') && balance(d, order) > 0 && order.status !== 'Cancelado' ? <Button onClick={() => setPayment(true)}>Registrar recebimento</Button> : null}
        {operation.actionVisible('refunds') && order.status === 'Cancelado' && received > 0 && <Button onClick={() => setRefund(true)}>Registrar devolução</Button>}
        {d.payments.filter(item => item.orderId === order.id).map(item => <div className="op-row" key={item.id}><span>{item.method}<small>{date(item.at, true)}{item.refunded > 0 ? ` · Devolvido: ${money(item.refunded)}` : ''}</small></span><strong>{money(item.amount)}</strong></div>)}
      </Section>
    </div>

    <div className="zeus-support">
      <details><summary>Histórico do pedido</summary><div><Timeline events={order.events} /></div></details>
      {order.channel === 'Mesa' && order.status !== 'Cancelado' && operation.actionVisible('transferTable') && <details><summary>Trocar mesa / comanda</summary><div><Button variant="secondary" onClick={() => setTransfer(true)}>Transferir pedido</Button></div></details>}
    </div>

    {active && operation.actionVisible('cancel') && <div className="op-record-secondary-actions"><Button variant="danger" onClick={() => setCancel(true)}>Cancelar pedido</Button></div>}

    {cancel && <Modal title="Cancelar pedido" onClose={() => setCancel(false)}><RecordForm draftKey={`artemis-cancel:${order.id}`} fields={[{ name: 'reason', label: 'Motivo', required: true, type: 'textarea', wide: true }]} onClose={() => setCancel(false)} submit="Confirmar cancelamento" onSave={valuesForm => w.mutate(data => cancelOrder(data, order.id, valuesForm.reason))} /></Modal>}
    {payment && <Modal title="Confirmar recebimento" onClose={() => setPayment(false)}><p>Saldo: <strong>{money(balance(d, order))}</strong>.</p><RecordForm draftKey={`artemis-payment:${order.id}`} fields={[{ name: 'amount', label: 'Valor efetivamente recebido (R$)', type: 'number', min: 0.01, step: 0.01, required: true, value: balance(d, order) / 100 }, { name: 'method', label: 'Forma de pagamento', required: true, options: paymentMethods.map(value => ({ value, label: value })) }]} submit="Confirmar recebimento" onClose={() => setPayment(false)} onSave={valuesForm => w.mutate(data => receivePayment(data, order.id, cents(valuesForm.amount), valuesForm.method), 'Recebimento registrado.')} /></Modal>}
    {refund && <Confirm title="Confirmar devolução realizada?" onClose={() => setRefund(false)} onConfirm={() => w.mutate(data => {
      const shift = data.shifts.find(item => !item.closedAt); if (!shift) throw new Error('Abra o caixa para registrar a devolução.');
      for (const item of data.payments.filter(item => item.orderId === order.id && item.amount > item.refunded)) {
        const amount = item.amount - item.refunded;
        data.movements.push({ id: uid(), shiftId: shift.id, kind: 'Devolução', amount, note: `Devolução do pedido ${order.number}`, at: now(), method: item.method });
        item.refunded = item.amount;
      }
      data.orders.find(item => item.id === order.id)!.events.push(event('Devolução integral confirmada manualmente'));
    })}>Confirme apenas depois de devolver o valor ao cliente.</Confirm>}
    {transfer && <Modal title="Transferir pedido para outra mesa" onClose={() => setTransfer(false)}><RecordForm fields={[{ name: 'tableId', label: 'Comanda de destino', required: true, options: d.tables.filter(table => table.openedAt && table.id !== order.tableId).map(table => ({ value: table.id, label: table.name })) }]} onClose={() => setTransfer(false)} onSave={valuesForm => w.mutate(data => {
      if (!data.tables.some(table => table.id === valuesForm.tableId && table.openedAt)) throw new Error('A comanda de destino não está aberta.');
      const current = data.orders.find(item => item.id === order.id)!;
      current.tableId = valuesForm.tableId;
      current.tableSession = data.tables.find(table => table.id === valuesForm.tableId)!.openedAt;
      current.events.push(event(`Transferido para ${data.tables.find(table => table.id === valuesForm.tableId)!.name}`));
    })} /></Modal>}
    {adjust && <Modal title="Adicionar item ao pedido" onClose={() => setAdjust(false)}><LeanOrderAdjustment w={w} order={order} onClose={() => setAdjust(false)} /></Modal>}
  </>;
}

function LeanOrderAdjustment({ w, order, onClose }: { w: Workspace; order: Order; onClose: () => void }) {
  const learned = learnProductSuggestions(w.data, order.customerId, 8);
  const orderedProducts = [
    ...learned.map(item => item.product).filter(Boolean),
    ...w.data.products.filter(product => product.available && !learned.some(item => item.productId === product.id))
  ];
  return <RecordForm draftKey={`artemis-adjust:${order.id}`} fields={[
    { name: 'productId', label: learned.length ? 'Produto — recorrentes primeiro' : 'Produto', required: true, options: orderedProducts.map(product => ({ value: product!.id, label: `${product!.name} · ${money(product!.price)}` })) },
    { name: 'quantity', label: 'Quantidade', type: 'number', min: 1, step: 1, required: true, value: 1 },
    { name: 'note', label: 'Observação deste item / alteração', type: 'textarea', wide: true }
  ]} onClose={onClose} submit="Adicionar e avisar cozinha" onSave={values => w.mutate(data => {
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
