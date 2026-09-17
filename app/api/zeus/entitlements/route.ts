import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { readZeusEntitlements } from '@/lib/server/zeusPlanAccess';
import { zeusPlan } from '@/lib/operations/zeusPlans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus');
  if (!access) return NextResponse.json({ error:'Sessão inválida ou Zeus não liberado para esta conta.' }, { status:403 });
  try {
    const entitlements = await readZeusEntitlements(access.accountId);
    const definition = zeusPlan(entitlements.plan);
    return NextResponse.json({
      ...entitlements,
      features: Array.from(definition.features),
      recommended: !!definition.recommended,
    });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível carregar o plano do Zeus.' }, { status:503 });
  }
}
