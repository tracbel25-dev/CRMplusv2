import { admin, applicationId, applySnapshot, check, checkoutUrl, configured, hasSevenDayTrial, HttpError, mp, siteUrl, syncSubscription } from '../_shared/mercadopago.ts';

function validTrialPlan(remote: Record<string, any>, plan: Record<string, any>, frequency: number) {
  const recurring = remote?.auto_recurring;
  const trial = recurring?.free_trial;
  return String(remote?.application_id) === applicationId && remote?.status === 'active' && !!remote?.id &&
    Number(recurring?.frequency) === frequency && recurring?.frequency_type === 'months' &&
    Math.round(Number(recurring?.transaction_amount) * 100) === Number(plan.amount_cents) &&
    recurring?.currency_id === 'BRL' && Number(trial?.frequency) === 7 && trial?.frequency_type === 'days';
}

async function ensureTrialPlan(db: ReturnType<typeof admin>, plan: Record<string, any>, appName: string, frequency: number) {
  const { data: mapping, error: mappingError } = await db.from('mp_plan_mappings')
    .select('preapproval_plan_id').eq('plan_id', plan.id).maybeSingle();
  check(mappingError);
  if (mapping?.preapproval_plan_id) {
    try {
      const existing = await mp(`/preapproval_plan/${encodeURIComponent(mapping.preapproval_plan_id)}`);
      if (validTrialPlan(existing, plan, frequency)) return String(existing.id);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
    }
  }

  const created = await mp('/preapproval_plan', 'POST', {
    reason: `CRM PLUS Store — ${appName}`,
    auto_recurring: {
      frequency,
      frequency_type: 'months',
      transaction_amount: plan.amount_cents / 100,
      currency_id: 'BRL',
      free_trial: { frequency: 7, frequency_type: 'days' },
    },
    back_url: `${siteUrl()}/assinaturas?retorno=1`,
  });
  if (!validTrialPlan(created, plan, frequency)) throw new HttpError(502, 'O Mercado Pago não confirmou os 7 dias grátis.');
  const { error: saveError } = await db.from('mp_plan_mappings').upsert({
    plan_id: plan.id,
    preapproval_plan_id: String(created.id),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'plan_id' });
  check(saveError);
  return String(created.id);
}

function trialIdentityError(result: string) {
  if (result === 'phone_required') return new HttpError(422, 'Confirme seu celular para receber os 7 dias grátis.');
  if (result === 'document_invalid') return new HttpError(422, 'Informe um CPF ou CNPJ válido para validar o teste grátis.');
  if (result === 'identity_used') return new HttpError(409, 'Este CPF/CNPJ ou celular já utilizou o teste grátis deste aplicativo. Você pode assinar normalmente sem os 7 dias.');
  return new HttpError(409, 'O teste grátis não está disponível para este aplicativo nesta conta.');
}

async function prepareTrialIdentity(
  db: ReturnType<typeof admin>,
  accountId: string,
  appId: string,
  userId: string,
  verifiedPhone: string,
  document: string,
  localId: string | null,
) {
  const { data, error } = await db.rpc('mp_prepare_trial_identity', {
    target_account: accountId,
    target_app: appId,
    target_user: userId,
    verified_phone: verifiedPhone,
    document,
    local_id: localId,
  });
  check(error);
  const result = String(data || 'not_eligible');
  if (result !== 'eligible') throw trialIdentityError(result);
}

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
      const [{ data: subscriptions, error: subscriptionsError }, { data: activeApps, error: appsError }] = await Promise.all([
        db.from('mp_subscriptions')
          .select('id,app_id,status,amount_cents,frequency,current_period_end,trial_requested,trial_ends_at,created_at')
          .eq('account_id', body.accountId).order('created_at', { ascending: false }),
        db.from('apps').select('id').eq('status', 'active'),
      ]);
      check(subscriptionsError); check(appsError);
      const eligibility = await Promise.all((activeApps || []).map(async app => {
        const { data, error } = await db.rpc('mp_trial_eligible', {
          target_account: body.accountId,
          target_app: app.id,
          target_user: auth.user.id,
        });
        check(error);
        return data === true ? String(app.id) : null;
      }));
      return reply({ subscriptions: subscriptions || [], ready: configured(), trialEligibleApps: eligibility.filter(Boolean) });
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

      const { data: eligible, error: eligibilityError } = await db.rpc('mp_trial_eligible', {
        target_account: body.accountId,
        target_app: plan.app_id,
        target_user: auth.user.id,
      });
      check(eligibilityError);
      const basicTrialEligible = eligible === true;
      const wantsTrial = basicTrialEligible && body.skipTrial !== true;
      const trialDocument = typeof body.trialDocument === 'string' ? body.trialDocument : '';
      const verifiedPhone = auth.user.phone_confirmed_at && auth.user.phone ? auth.user.phone : '';

      if (wantsTrial) {
        await prepareTrialIdentity(db, body.accountId, plan.app_id, auth.user.id, verifiedPhone, trialDocument, null);
      }

      const { data: open, error: openError } = await db.from('mp_subscriptions').select('*')
        .eq('account_id', body.accountId).eq('app_id', plan.app_id)
        .in('status', ['creating', 'pending', 'authorized', 'paused']).maybeSingle();
      check(openError);
      if (open) {
        if (open.plan_id !== plan.id) throw new HttpError(409, 'Cancele a assinatura pendente antes de escolher outro ciclo.');
        if (open.status === 'creating') throw new HttpError(409, 'A criação anterior ainda está sendo conferida. Não será gerada outra cobrança. Atualize o status abaixo.');
        if (open.status !== 'pending') throw new HttpError(409, 'Já existe uma assinatura para este aplicativo. Atualize o status abaixo.');

        if (open.preapproval_id) {
          const remoteOpen = await mp(`/preapproval/${encodeURIComponent(open.preapproval_id)}`);
          const sameMode = open.trial_requested === wantsTrial;
          if (sameMode && wantsTrial && hasSevenDayTrial(remoteOpen)) {
            await prepareTrialIdentity(db, body.accountId, plan.app_id, auth.user.id, verifiedPhone, trialDocument, open.id);
            await applySnapshot(open, remoteOpen);
            return reply({ url: checkoutUrl(remoteOpen.init_point || open.init_point), trialApplied: true });
          }
          if (sameMode && !wantsTrial && open.trial_requested !== true) {
            await applySnapshot(open, remoteOpen);
            return reply({ url: checkoutUrl(remoteOpen.init_point || open.init_point), trialApplied: false });
          }
          if (remoteOpen.status !== 'pending') {
            await applySnapshot(open, remoteOpen);
            throw new HttpError(409, 'A assinatura anterior mudou de status. Atualize a página antes de tentar novamente.');
          }
          const cancelled = await mp(`/preapproval/${encodeURIComponent(open.preapproval_id)}`, 'PUT', { status: 'cancelled' });
          await applySnapshot(open, cancelled);
        } else {
          throw new HttpError(409, 'A criação anterior ainda precisa de conferência. Atualize o status abaixo.');
        }
      }

      const preapprovalPlanId = wantsTrial ? await ensureTrialPlan(db, plan, app.name, frequency) : null;
      const { data: local, error: insertError } = await db.from('mp_subscriptions').insert({
        account_id: body.accountId,
        app_id: plan.app_id,
        plan_id: plan.id,
        amount_cents: plan.amount_cents,
        currency: 'BRL',
        frequency,
        trial_requested: wantsTrial,
        created_by_user_id: auth.user.id,
        preapproval_plan_id: preapprovalPlanId,
      }).select('*').single();
      check(insertError);
      if (!local) throw new HttpError(500, 'Não foi possível iniciar a assinatura.');

      if (wantsTrial) {
        try {
          await prepareTrialIdentity(db, body.accountId, plan.app_id, auth.user.id, verifiedPhone, trialDocument, local.id);
        } catch (error) {
          const failed = await db.from('mp_subscriptions').update({ status: 'failed' }).eq('id', local.id).eq('status', 'creating');
          check(failed.error);
          throw error;
        }
      }

      let remote;
      try {
        remote = wantsTrial
          ? await mp('/preapproval', 'POST', {
              preapproval_plan_id: preapprovalPlanId,
              reason: `CRM PLUS Store — ${app.name}`,
              external_reference: local.id,
              payer_email: auth.user.email,
              status: 'pending',
              back_url: `${siteUrl()}/assinaturas?retorno=1`,
            })
          : await mp('/preapproval', 'POST', {
              reason: `CRM PLUS Store — ${app.name}`,
              external_reference: local.id,
              payer_email: auth.user.email,
              status: 'pending',
              auto_recurring: { frequency, frequency_type: 'months', transaction_amount: plan.amount_cents / 100, currency_id: 'BRL' },
              back_url: `${siteUrl()}/assinaturas?retorno=1`,
            });
      } catch (error) {
        if (error instanceof HttpError && [400,401,403,404,422].includes(error.status)) {
          const failed = await db.from('mp_subscriptions').update({ status: 'failed' }).eq('id', local.id).eq('status', 'creating');
          check(failed.error);
        }
        throw error;
      }
      await applySnapshot(local, remote);
      return reply({ url: checkoutUrl(remote.init_point), trialApplied: wantsTrial });
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
