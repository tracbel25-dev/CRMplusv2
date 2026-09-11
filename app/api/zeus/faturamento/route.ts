import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { operationalRest } from '@/lib/server/operationalWorkspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function query(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

export async function GET(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Zeus.' }, { status: 401 });
  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  const status = request.nextUrl.searchParams.get('status') || '';
  try {
    const params: Record<string, string> = {
      select: 'id,job_id,job_number,customer_id,amount_cents,status,payment_method,payment_provider,provider_reference,paid_at,closed_at,notes,created_at,updated_at',
      tenant_key: `eq.${access.accountId}`,
      order: 'created_at.desc',
    };
    if (jobId) params.job_id = `eq.${jobId}`;
    if (status) params.status = `eq.${status}`;
    const rows = await operationalRest('zeus', `billing_records?${query(params)}`);
    return NextResponse.json({ records: rows || [] });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível carregar o faturamento.' }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Zeus.' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: 'OS inválida.' }, { status: 400 });
  if (!['Pendente','Pago','Baixado','Cancelado'].includes(status)) return NextResponse.json({ error: 'Situação de faturamento inválida.' }, { status: 400 });

  try {
    const current = await operationalRest('zeus', `billing_records?${query({ select: 'id,status', tenant_key: `eq.${access.accountId}`, job_id: `eq.${jobId}`, limit: '1' })}`) as Array<{ id: string; status: string }>;
    if (!current?.length) return NextResponse.json({ error: 'Esta OS ainda não possui registro de faturamento.' }, { status: 404 });
    const update: Record<string, unknown> = {
      status,
      payment_method: typeof body?.paymentMethod === 'string' ? body.paymentMethod.trim().slice(0,120) : '',
      notes: typeof body?.notes === 'string' ? body.notes.trim().slice(0,2000) : '',
      updated_at: new Date().toISOString(),
    };
    if (typeof body?.paymentProvider === 'string') update.payment_provider = body.paymentProvider.trim().slice(0,80);
    if (typeof body?.providerReference === 'string') update.provider_reference = body.providerReference.trim().slice(0,200);
    if (status === 'Pago') update.paid_at = new Date().toISOString();
    if (status === 'Baixado' || status === 'Cancelado') update.closed_at = new Date().toISOString();

    const rows = await operationalRest('zeus', `billing_records?${query({ tenant_key: `eq.${access.accountId}`, job_id: `eq.${jobId}` })}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(update),
    });
    return NextResponse.json({ ok: true, record: Array.isArray(rows) ? rows[0] : rows });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível atualizar o faturamento.' }, { status: 503 });
  }
}
