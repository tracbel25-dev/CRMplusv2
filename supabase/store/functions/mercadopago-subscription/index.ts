import { admin, applySnapshot, check, checkoutUrl, configured, HttpError, mp, siteUrl, syncSubscription } from '../_shared/mercadopago.ts';

export async function handler(request: Request) {
  const origin = request.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': siteUrl(), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && origin !== siteUrl()) return reply({ error: 'Origem não autorizada.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Método inválido.' }, 405);
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Entre na sua conta para continuar.');
    const db = admin();
    // Custom authentication validates the real Supabase user, including asymmetric JWTs.
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
    const body = await request.json().catch(() => null);
    if (!body || !/^[0-9a-f-]{36}$/i.test(body.accountId || '')) throw new HttpError(400, 'Conta inválida.');
    const { data: member, error: memberError } = await db.from('account_members').select('role,status')
      .eq('account_id', body.accountId).eq('user_id', auth.user.id).maybeSingle();
    check(memberError);
    const { data: account, error: accountError } = await db.from('accounts').select('status').eq('id', body.accountId).maybeSingle();
    check(accountError);
    if (!member || member.status !== 'active' || account?.status !== 'active') throw new HttpError(403, 'Conta sem permissão para cobrança.');
    if (member.role !== 'owner') {
      const { data: permission, error } = await db.from('member_permissions').select('permission')
        .eq('account_id', body.accountId).eq('user_id', auth.user.id).eq('permission', 'manage_billing').maybeSingle();
      check(error);
      if (!permission) throw new HttpError(403, 'Somente o titular ou responsável financeiro pode gerenciar assinaturas.');
    }
    if (body.action === 'list') {
      const { data, error } = await db.from('mp_subscriptions').select('id,app_id,status,amount_cents,frequency,current_period_end,created_at')
        .eq('account_id', body.accountId).order('created_at', { ascending: false });
      check(error); return reply({ subscriptions: data, ready: configured() });
    }
    if (!configured()) throw new HttpError(503, 'As assinaturas estão em configuração. Tente novamente em breve.');
    if (body.action === 'checkout') {
      if (!/^[0-9a-f-]{36}$/i.test(body.planId || '')) throw new HttpError(400, 'Plano inválido.');
      const { data: plan, error: planError } = await db.from('plans').select('*').eq('id', body.planId).eq('active', true).maybeSingle();
      check(planError);
      if (!plan || plan.amount_cents <= 0 || plan.currency.toUpperCase() !== 'BRL') throw new HttpError(400, 'Plano indisponível.');
      const { data: app, error: appError } = await db.from('apps').select('name,status').eq('id', plan.app_id).maybeSingle();
      check(appError);
      if (app?.status !== 'active') throw new HttpError(400, 'Aplicativo indisponível.');
      const { data: entitlement, error: entitlementError } = await db.from('account_apps').select('status,current_period_end')
        .eq('account_id', body.accountId).eq('app_id', plan.app_id).maybeSingle();
      check(entitlementError);
      if (entitlement?.status === 'suspended') throw new HttpError(403, 'Aplicativo suspenso. Contate o suporte.');
      if (entitlement?.status === 'active' && (!entitlement.current_period_end || Date.parse(entitlement.current_period_end) > Date.now()))
        throw new HttpError(409, 'Este aplicativo já possui um período ativo. Gerencie a assinatura abaixo.');
      const frequencies: Record<string, number> = { monthly: 1, semiannual: 6, annual: 12 };
      const frequency = frequencies[plan.billing_interval];
      if (!frequency) throw new HttpError(400, 'Ciclo inválido.');
      const { data: inserted, error: insertError } = await db.from('mp_subscriptions').insert({
        account_id: body.accountId, app_id: plan.app_id, plan_id: plan.id,
        amount_cents: plan.amount_cents, currency: 'BRL', frequency,
      }).select('*').single();
      let local = inserted;
      if (insertError?.code === '23505') {
        const existing = await db.from('mp_subscriptions').select('*').eq('account_id', body.accountId).eq('app_id', plan.app_id)
          .in('status', ['creating', 'pending', 'authorized', 'paused']).single();
        check(existing.error); local = existing.data;
        if (local?.plan_id !== plan.id) throw new HttpError(409, 'Cancele a assinatura pendente antes de escolher outro ciclo.');
        if (local?.status === 'creating') throw new HttpError(409, 'A criação anterior ainda está sendo conferida. Não será gerada outra cobrança. Atualize o status abaixo.');
        if (local?.status !== 'pending') throw new HttpError(409, 'Já existe uma assinatura para este aplicativo. Atualize o status abaixo.');
        return reply({ url: checkoutUrl(local.init_point) });
      }
      check(insertError);
      if (!local) throw new HttpError(500, 'Não foi possível iniciar a assinatura.');
      let remote;
      try {
        remote = await mp('/preapproval', 'POST', {
          reason: `CRM PLUS Store — ${app.name}`, external_reference: local.id,
          payer_email: auth.user.email, status: 'pending',
          auto_recurring: { frequency, frequency_type: 'months', transaction_amount: plan.amount_cents / 100, currency_id: 'BRL' },
          back_url: `${siteUrl()}/assinaturas?retorno=1`,
        });
      } catch (error) {
        // Only definitive validation failures can release the unique creation lock.
        // A timeout/5xx is ambiguous: retain it and reconcile; never blindly POST twice.
        if (error instanceof HttpError && [400,401,403,404,422].includes(error.status)) {
          const failed = await db.from('mp_subscriptions').update({ status: 'failed' }).eq('id', local.id).eq('status', 'creating');
          check(failed.error);
        }
        throw error;
      }
      await applySnapshot(local, remote);
      return reply({ url: checkoutUrl(remote.init_point) });
    }
    if (!['sync', 'cancel'].includes(body.action) || !/^[0-9a-f-]{36}$/i.test(body.subscriptionId || '')) throw new HttpError(400, 'Solicitação inválida.');
    const { data: local, error } = await db.from('mp_subscriptions').select('*').eq('id', body.subscriptionId).eq('account_id', body.accountId).maybeSingle();
    check(error);
    if (!local) throw new HttpError(404, 'Assinatura não encontrada.');
    if (!local.preapproval_id) {
      const found = await mp(`/preapproval/search?q=${encodeURIComponent(local.id)}`);
      const matches = (found.results || []).filter((item: { external_reference: string }) => item.external_reference === local.id);
      if (matches.length !== 1) throw new HttpError(409, 'A criação ainda precisa de conferência pelo suporte. Nenhuma cobrança adicional foi criada.');
      const remote = await mp(`/preapproval/${encodeURIComponent(matches[0].id)}`);
      await applySnapshot(local, remote); local.preapproval_id = remote.id;
    }
    if (body.action === 'cancel') {
      const remote = await mp(`/preapproval/${encodeURIComponent(local.preapproval_id)}`, 'PUT', { status: 'cancelled' });
      await applySnapshot(local, remote);
    } else await syncSubscription(local);
    return reply({ ok: true });
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('Billing request failed:', error instanceof Error ? error.name : 'Unknown');
    return reply({ error: error instanceof HttpError ? error.message : 'Não foi possível concluir. Atualize o status antes de tentar novamente.' }, error instanceof HttpError ? error.status : 500);
  }
}
Deno.serve(handler);
