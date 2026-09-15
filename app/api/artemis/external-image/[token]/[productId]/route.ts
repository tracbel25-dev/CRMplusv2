import { NextRequest, NextResponse } from 'next/server';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
import { artemisRest } from '@/lib/artemis/cloudServer';
import { presignR2, readR2Config } from '@/lib/r2/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

async function readExternalLink(token: string) {
  const response = await fetch(`${STORE_SUPABASE.url}/functions/v1/external-link`, {
    method: 'POST',
    headers: {
      apikey: STORE_SUPABASE.publishableKey,
      authorization: `Bearer ${STORE_SUPABASE.publishableKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token, action: 'read' }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { link?: { kind?: string; payload?: Record<string, unknown> } } | null;
  return body?.link || null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  if (token.length < 32 || token.length > 200 || !uuidPattern.test(productId)) return new NextResponse(null, { status: 404 });

  try {
    const link = await readExternalLink(token);
    if (!link || link.kind !== 'artemis-menu') return new NextResponse(null, { status: 404 });
    const products = Array.isArray(link.payload?.products) ? link.payload.products : [];
    const shared = products.some(item => item && typeof item === 'object' && String((item as Record<string, unknown>).id || '') === productId);
    if (!shared) return new NextResponse(null, { status: 404 });

    const rows = await artemisRest(`products?${query({
      select: 'tenant_key,image_object_key',
      id: `eq.${productId}`,
      limit: '1',
    })}`) as Array<{ tenant_key?: string; image_object_key?: string | null }>;
    const product = rows?.[0];
    const tenantKey = String(product?.tenant_key || '');
    const key = String(product?.image_object_key || '');
    const prefix = `accounts/${tenantKey}/cardapio/${productId}/`;
    if (!tenantKey || !key || !key.startsWith(prefix) || key.includes('..')) return new NextResponse(null, { status: 404 });

    readR2Config('artemis');
    const signed = presignR2('artemis', 'GET', key, 600);
    const response = NextResponse.redirect(signed, 307);
    response.headers.set('cache-control', 'private, no-store, max-age=0');
    return response;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
