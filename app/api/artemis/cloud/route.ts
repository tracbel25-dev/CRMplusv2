import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { artemisRest, artemisSlug } from '@/lib/artemis/cloudServer';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transitions: Record<string, string[]> = {
  Novo: ['Novo', 'Aceito', 'Cancelado'],
  Aceito: ['Aceito', 'Em preparo', 'Cancelado'],
  'Em preparo': ['Em preparo', 'Pronto', 'Cancelado'],
  Pronto: ['Pronto', 'Concluído', 'Cancelado'],
  Concluído: ['Concluído'],
  Cancelado: ['Cancelado'],
};

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function text(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function boolMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, boolean>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, current]) => typeof current === 'boolean')) as Record<string, boolean>;
}

function labelMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, current]) => typeof current === 'string').map(([key, current]) => [key, String(current).slice(0, 120)]));
}

export async function GET(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Entre na CRM PLUS Store para sincronizar o Artemis.' }, { status: 401 });

  try {
    const settings = await artemisRest(`tenant_settings?${query({ select: 'public_slug', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ public_slug?: string }>;
    const orders = await artemisRest(`orders?${query({
      select: 'id,number,customer_name,phone,address,channel,table_id,table_session_started_at,notes,status,delivery_status,fee_cents,discount_cents,created_at,stock_consumed,reserved,requested_payment_method,order_lines(id,product_id,position,description,quantity,price_cents,done,note,prep_minutes),order_events(id,at,text)',
      tenant_key: `eq.${access.accountId}`,
      status: 'in.(Novo,Aceito,Em preparo,Pronto)',
      order: 'created_at.asc',
    })}`) as unknown[];
    return NextResponse.json({ slug: settings?.[0]?.public_slug || '', orders: orders || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao sincronizar Artemis.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Entre na CRM PLUS Store para publicar o cardápio.' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

  const settings = (body.settings && typeof body.settings === 'object' ? body.settings : {}) as Record<string, unknown>;
  const preferences = (body.preferences && typeof body.preferences === 'object' ? body.preferences : {}) as Record<string, unknown>;
  const actions = boolMap(preferences.actionVisibility);
  const fields = boolMap(preferences.fieldVisibility);
  const labels = labelMap(preferences.fieldLabels);
  const business = text(settings.business, 160);
  if (!business) return NextResponse.json({ error: 'Informe o nome do restaurante antes de publicar.' }, { status: 400 });

  try {
    const current = await artemisRest(`tenant_settings?${query({ select: 'public_slug', tenant_key: `eq.${access.accountId}`, limit: '1' })}`) as Array<{ public_slug?: string }>;
    const slug = current?.[0]?.public_slug || artemisSlug(business, access.accountId);

    await artemisRest('tenants?on_conflict=tenant_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ tenant_key: access.accountId }),
    });

    await artemisRest('tenant_settings?on_conflict=tenant_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        tenant_key: access.accountId,
        business,
        phone: text(settings.phone, 80),
        email: text(settings.email, 160),
        address: text(settings.address, 300),
        operator_name: text(settings.operator, 120),
        online_paused: Boolean(settings.onlinePaused),
        delivery_fee_cents: Math.max(0, Math.round(Number(settings.deliveryFee) || 0)),
        minimum_order_cents: Math.max(0, Math.round(Number(settings.minimumOrder) || 0)),
        delivery_areas: text(settings.deliveryAreas, 2000),
        hours: text(settings.hours, 2000),
        field_labels: labels,
        field_visibility: fields,
        action_visibility: actions,
        public_slug: slug,
        physical_enabled: actions.dineIn !== false || actions.counter !== false,
        delivery_enabled: actions.delivery !== false,
        pickup_enabled: actions.pickup !== false,
        loyalty_enabled: actions.loyalty !== false,
        new_order_sound_enabled: actions.newOrderSound !== false,
        updated_at: new Date().toISOString(),
      }),
    });

    const productsInput = Array.isArray(body.products) ? body.products.slice(0, 500) : [];
    await artemisRest(`products?${query({ tenant_key: `eq.${access.accountId}` })}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ available: false, updated_at: new Date().toISOString() }),
    });
    const products = productsInput.flatMap(currentProduct => {
      if (!currentProduct || typeof currentProduct !== 'object') return [];
      const product = currentProduct as Record<string, unknown>;
      const id = text(product.id, 64);
      const name = text(product.name, 160);
      const category = text(product.category, 120);
      if (!uuidPattern.test(id) || !name || !category) return [];
      return [{
        id,
        tenant_key: access.accountId,
        name,
        description: text(product.description, 2000),
        category,
        price_cents: Math.max(0, Math.round(Number(product.price) || 0)),
        available: product.available !== false,
        stock_controlled: Boolean(product.stockControlled),
        stock: Math.max(0, Number(product.stock) || 0),
        minimum_stock: Math.max(0, Number(product.minimum) || 0),
        allergens: text(product.allergens, 2000),
        preparation_minutes: Math.max(0, Math.round(Number(product.preparation) || 0)),
        updated_at: new Date().toISOString(),
      }];
    });
    if (products.length) await artemisRest('products?on_conflict=tenant_key,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(products),
    });

    const tablesInput = Array.isArray(body.tables) ? body.tables.slice(0, 200) : [];
    const tables = tablesInput.flatMap(currentTable => {
      if (!currentTable || typeof currentTable !== 'object') return [];
      const table = currentTable as Record<string, unknown>;
      const id = text(table.id, 64);
      const name = text(table.name, 120);
      if (!uuidPattern.test(id) || !name) return [];
      return [{
        id,
        tenant_key: access.accountId,
        name,
        seats: Math.max(1, Math.min(100, Math.round(Number(table.seats) || 1))),
        opened_at: text(table.openedAt, 64) || null,
        closed_at: text(table.closedAt, 64) || null,
        updated_at: new Date().toISOString(),
      }];
    });
    if (tables.length) await artemisRest('restaurant_tables?on_conflict=tenant_key,id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(tables),
    });

    return NextResponse.json({ ok: true, slug });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível publicar o cardápio.' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = text(body?.id, 64);
  if (!uuidPattern.test(id)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  try {
    const found = await artemisRest(`orders?${query({ select: 'id,status,delivery_status', tenant_key: `eq.${access.accountId}`, id: `eq.${id}`, limit: '1' })}`) as Array<{ id: string; status: string; delivery_status: string }>;
    const remote = found?.[0];
    if (!remote) return NextResponse.json({ error: 'Pedido não pertence a esta conta.' }, { status: 404 });
    const nextStatus = text(body?.status, 40) || remote.status;
    if (!(transitions[remote.status] || []).includes(nextStatus)) return NextResponse.json({ error: `Transição inválida: ${remote.status} → ${nextStatus}.` }, { status: 409 });
    const delivery = text(body?.delivery, 60) || remote.delivery_status;

    await artemisRest(`orders?${query({ tenant_key: `eq.${access.accountId}`, id: `eq.${id}` })}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: nextStatus, delivery_status: delivery, updated_at: new Date().toISOString() }),
    });

    const lines = Array.isArray(body?.lines) ? body.lines : [];
    for (const lineInput of lines.slice(0, 100)) {
      if (!lineInput || typeof lineInput !== 'object') continue;
      const line = lineInput as Record<string, unknown>;
      const lineId = text(line.id, 64);
      if (!uuidPattern.test(lineId)) continue;
      await artemisRest(`order_lines?${query({ tenant_key: `eq.${access.accountId}`, order_id: `eq.${id}`, id: `eq.${lineId}` })}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ done: Boolean(line.done) }),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao atualizar pedido.' }, { status: 503 });
  }
}
