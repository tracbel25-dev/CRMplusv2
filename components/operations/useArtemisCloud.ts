'use client';

import { useEffect, useMemo, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';
import type { Event, Line, Order } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { useArtemisBootstrap } from './useArtemisBootstrap';

type RemoteLine = {
  id: string;
  product_id: string | null;
  position: number;
  description: string;
  quantity: number | string;
  price_cents: number | string;
  done: boolean;
  note: string;
  prep_minutes: number;
};

type RemoteEvent = { id: string; at: string; text: string };
type RemoteOrder = {
  id: string;
  number: number | string;
  customer_name: string;
  phone: string;
  address: string;
  channel: Order['channel'];
  table_id: string | null;
  table_session_started_at: string | null;
  notes: string;
  status: string;
  delivery_status: string;
  fee_cents: number | string;
  discount_cents: number | string;
  created_at: string;
  stock_consumed: boolean;
  reserved: boolean;
  requested_payment_method?: string;
  order_lines?: RemoteLine[];
  order_events?: RemoteEvent[];
};

type CloudResult = { slug: string; orders: RemoteOrder[] };

async function sessionToken() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

function mapRemoteOrder(remote: RemoteOrder): Order {
  const lines: Line[] = [...(remote.order_lines || [])]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(line => ({
      id: line.id,
      kind: 'Produto',
      description: line.description,
      brand: '',
      quantity: Number(line.quantity),
      price: Number(line.price_cents),
      done: !!line.done,
      productId: line.product_id || undefined,
      note: line.note || '',
      prepMinutes: Number(line.prep_minutes || 0),
    }));
  const events: Event[] = [...(remote.order_events || [])].map(item => ({ id: item.id, at: item.at, text: item.text }));
  if (remote.requested_payment_method) events.push({
    id: `payment-intent-${remote.id}`,
    at: remote.created_at,
    text: `Forma de pagamento informada pelo cliente: ${remote.requested_payment_method}. Recebimento ainda não confirmado.`,
  });
  return {
    id: remote.id,
    number: Number(remote.number),
    customerId: '',
    customerName: remote.customer_name || '',
    phone: remote.phone || '',
    address: remote.address || '',
    channel: remote.channel,
    tableId: remote.table_id || '',
    tableSession: remote.table_session_started_at || undefined,
    lines,
    notes: remote.notes || '',
    status: remote.status,
    delivery: remote.delivery_status || '',
    fee: Number(remote.fee_cents || 0),
    discount: Number(remote.discount_cents || 0),
    createdAt: remote.created_at,
    events,
    stockConsumed: !!remote.stock_consumed,
    reserved: !!remote.reserved,
  };
}

export function useArtemisCloud(w: Workspace) {
  useArtemisBootstrap('artemis');
  const operation = useOperationPreferences('artemis');
  const [slug, setSlug] = useState('');
  const [connected, setConnected] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const publishSignature = useMemo(() => JSON.stringify({
    settings: {
      business: w.data.settings.business,
      phone: w.data.settings.phone,
      email: w.data.settings.email,
      address: w.data.settings.address,
      operator: w.data.settings.operator,
      onlinePaused: w.data.settings.onlinePaused,
      onlinePausedUntil: w.data.settings.onlinePausedUntil || '',
      deliveryFee: w.data.settings.deliveryFee,
      minimumOrder: w.data.settings.minimumOrder,
      deliveryAreas: w.data.settings.deliveryAreas,
      hours: w.data.settings.hours,
    },
    products: w.data.products,
    tables: w.data.tables,
    preferences: operation.preferences,
  }), [w.data.settings, w.data.products, w.data.tables, operation.preferences]);

  useEffect(() => {
    if (!w.ready || !w.accountId || w.accountId === 'guest') return;
    const timer = window.setTimeout(async () => {
      const token = await sessionToken();
      if (!token) { setConnected(false); return; }
      try {
        const snapshot = JSON.parse(publishSignature) as Record<string, unknown>;
        const response = await fetch('/api/artemis/cloud', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || 'Não foi possível publicar o cardápio.');
        setSlug(body.slug || '');
        setConnected(true);
        setCloudError('');
      } catch (error) {
        setConnected(false);
        setCloudError(error instanceof Error ? error.message : 'Falha na sincronização do Artemis.');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [w.ready, w.accountId, publishSignature]);

  useEffect(() => {
    if (!w.ready || !w.accountId || w.accountId === 'guest') return;
    let active = true;
    const pull = async () => {
      const token = await sessionToken();
      if (!token || !active) return;
      try {
        const response = await fetch('/api/artemis/cloud', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = await response.json() as CloudResult & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Falha ao buscar pedidos públicos.');
        if (!active) return;
        setSlug(body.slug || '');
        setConnected(true);
        setCloudError('');
        const incoming = (body.orders || []).map(mapRemoteOrder);
        const signature = (order: Order) => JSON.stringify({
          status: order.status,
          delivery: order.delivery,
          reserved: order.reserved,
          stockConsumed: order.stockConsumed,
          lines: order.lines.map(line => [line.id, line.quantity, line.price, !!line.done, line.note, line.description]),
          events: order.events.map(item => [item.id, item.at, item.text]),
        });
        const changed = incoming.filter(remote => {
          const local = w.data.orders.find(item => item.id === remote.id);
          return !local || signature(local) !== signature(remote);
        });
        if (changed.length) {
          const newCount = changed.filter(remote => !w.data.orders.some(local => local.id === remote.id)).length;
          await w.mutate(data => {
            for (const remote of changed) {
              const index = data.orders.findIndex(local => local.id === remote.id);
              if (index < 0) {
                data.orders.push(remote);
                continue;
              }
              const local = data.orders[index];
              data.orders[index] = {
                ...local,
                ...remote,
                customerId: local.customerId,
                priorityAt: local.priorityAt,
                priorityReason: local.priorityReason,
                testMode: local.testMode,
              };
            }
          }, newCount === 1 ? 'Novo pedido recebido.' : newCount > 1 ? `${newCount} novos pedidos recebidos.` : '');
        }
      } catch (error) {
        if (active) setCloudError(error instanceof Error ? error.message : 'Falha ao buscar pedidos públicos.');
      }
    };
    void pull();
    const interval = window.setInterval(() => void pull(), 4000);
    return () => { active = false; window.clearInterval(interval); };
  }, [w.ready, w.accountId, w.data.orders.length]);

  // Alterações de pedidos usam somente w.mutate -> save_workspace_state.
  // O banco projeta status/itens prontos para os pedidos públicos no mesmo caminho revisionado.

  return { slug, connected, cloudError };
}
