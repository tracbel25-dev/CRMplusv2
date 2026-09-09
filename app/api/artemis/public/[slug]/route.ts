import { NextRequest, NextResponse } from 'next/server';
import { artemisRest, artemisRpc } from '@/lib/artemis/cloudServer';

export const runtime = 'nodejs';

const windows = new Map<string, { startedAt: number; count: number }>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

function text(value: unknown, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safeSlug = text(slug, 50).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,49}$/.test(safeSlug)) return NextResponse.json({ error: 'Cardápio não encontrado.' }, { status: 404 });

  try {
    const settings = await artemisRest(`tenant_settings?${query({
      select: 'tenant_key,business,phone,address,online_paused,delivery_fee_cents,minimum_order_cents,delivery_areas,hours,physical_enabled,delivery_enabled,pickup_enabled',
      public_slug: `eq.${safeSlug}`,
      limit: '1',
    })}`) as Array<Record<string, unknown>>;
    const restaurant = settings?.[0];
    if (!restaurant) return NextResponse.json({ error: 'Cardápio não encontrado.' }, { status: 404 });
    const tenantKey = String(restaurant.tenant_key || '');

    const products = await artemisRest(`products?${query({
      select: 'id,name,description,category,price_cents,allergens,preparation_minutes',
      tenant_key: `eq.${tenantKey}`,
      available: 'eq.true',
      order: 'category.asc,name.asc',
    })}`) as unknown[];

    let table: { id: string; name: string } | null = null;
    const tableId = request.nextUrl.searchParams.get('mesa') || '';
    if (tableId && uuidPattern.test(tableId) && restaurant.physical_enabled === true) {
      const tables = await artemisRest(`restaurant_tables?${query({
        select: 'id,name', tenant_key: `eq.${tenantKey}`, id: `eq.${tableId}`, opened_at: 'not.is.null', limit: '1',
      })}`) as Array<{ id: string; name: string }>;
      table = tables?.[0] || null;
    }

    return NextResponse.json({
      restaurant: {
        name: String(restaurant.business || ''),
        phone: String(restaurant.phone || ''),
        address: String(restaurant.address || ''),
        onlinePaused: restaurant.online_paused === true,
        deliveryFee: Number(restaurant.delivery_fee_cents || 0),
        minimumOrder: Number(restaurant.minimum_order_cents || 0),
        deliveryAreas: String(restaurant.delivery_areas || ''),
        hours: String(restaurant.hours || ''),
        physicalEnabled: restaurant.physical_enabled === true,
        deliveryEnabled: restaurant.delivery_enabled === true,
        pickupEnabled: restaurant.pickup_enabled === true,
      },
      table,
      products,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível abrir o cardápio.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safeSlug = text(slug, 50).toLowerCase();
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`${safeSlug}:${forwarded}`)) return NextResponse.json({ error: 'Muitos pedidos em pouco tempo. Tente novamente em instantes.' }, { status: 429 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const channel = text(body.channel, 20);
  const tableId = text(body.tableId, 64);
  const items = Array.isArray(body.items) ? body.items.slice(0, 50).map(item => {
    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { product_id: text(value.productId, 64), quantity: Number(value.quantity), note: text(value.note, 500) };
  }) : [];

  try {
    const result = await artemisRpc('create_public_order', {
      p_slug: safeSlug,
      p_channel: channel,
      p_table_id: uuidPattern.test(tableId) ? tableId : null,
      p_customer_name: text(body.customerName, 160),
      p_phone: text(body.phone, 80),
      p_address: text(body.address, 400),
      p_payment_method: text(body.paymentMethod, 80),
      p_notes: text(body.notes, 1000),
      p_items: items,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o pedido.' }, { status: 400 });
  }
}
