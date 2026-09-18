import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const siteUrl = () => (Deno.env.get('STORE_SITE_URL') || 'https://crmplusv2.vercel.app').replace(/\/$/, '');
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const clientIp = (request: Request) => {
  const direct = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : '';
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': siteUrl(),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && origin !== siteUrl()) return reply({ error: 'Origem não autorizada.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Método inválido.' }, 405);

  let db: ReturnType<typeof admin> | null = null;
  let requestId = '';

  const setRequestStatus = async (status: 'requested'|'validating'|'validation_pending'|'activated'|'blocked', activatedAt?: string) => {
    if (!db || !requestId) return;
    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (activatedAt) payload.activated_at = activatedAt;
    const { error } = await db.from('trial_requests').update(payload).eq('id', requestId);
    if (error) console.error('Could not update trial request:', error.message);
  };

  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Entre na sua conta para continuar.' }, 401);
    db = admin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: 'Sua sessão expirou. Entre novamente.' }, 401);

    const body = await request.json().catch(() => null);
    const accountId = String(body?.accountId || '');
    const appId = String(body?.appId || '');
    const planId = String(body?.planId || '');
    if (!/^[0-9a-f-]{36}$/i.test(accountId) || !/^[a-z0-9_-]{2,40}$/i.test(appId)) return reply({ error: 'Solicitação inválida.' }, 400);
    if (planId && !/^[0-9a-f-]{36}$/i.test(planId)) return reply({ error: 'Plano inválido.' }, 400);

    const { data: member, error: memberError } = await db.from('account_members').select('role,status').eq('account_id', accountId).eq('user_id', auth.user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== 'active' || member.role !== 'owner') return reply({ error: 'Somente o titular pode iniciar o teste grátis.' }, 403);

    if (planId) {
      const { data: plan, error: planError } = await db.from('plans').select('id,app_id,active').eq('id', planId).maybeSingle();
      if (planError) throw planError;
      if (!plan || plan.active !== true || plan.app_id !== appId) return reply({ error: 'Plano inválido.' }, 400);
    }

    const { data: activeTrial, error: activeTrialError } = await db.from('account_apps').select('status,current_period_end')
      .eq('account_id', accountId).eq('app_id', appId).maybeSingle();
    if (activeTrialError) throw activeTrialError;
    if (activeTrial?.status === 'trialing' && activeTrial.current_period_end && Date.parse(activeTrial.current_period_end) > Date.now()) {
      return reply({ ok: true, eligible: true, activated: true, trialEndsAt: activeTrial.current_period_end, requestStatus: 'activated' });
    }

    if (planId) {
      const { data: existingRequest, error: requestLookupError } = await db.from('trial_requests')
        .select('id').eq('account_id', accountId).eq('app_id', appId).eq('user_id', auth.user.id)
        .in('status', ['requested','validating','validation_pending']).order('requested_at', { ascending: false }).limit(1).maybeSingle();
      if (requestLookupError) throw requestLookupError;
      if (existingRequest?.id) requestId = String(existingRequest.id);
      else {
        const { data: createdRequest, error: createRequestError } = await db.from('trial_requests').insert({
          account_id: accountId,
          app_id: appId,
          plan_id: planId,
          user_id: auth.user.id,
          status: 'requested',
        }).select('id').single();
        if (createRequestError) throw createRequestError;
        requestId = String(createdRequest.id);
      }
      await setRequestStatus('validating');
    }

    const ip = clientIp(request);
    const { data: reasonData, error: reasonError } = await db.rpc('trial_block_reason', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      client_ip: ip,
    });
    if (reasonError) throw reasonError;
    const reason = String(reasonData || 'other');

    if (reason !== 'eligible') {
      await setRequestStatus('blocked');
      const { error: logError } = await db.rpc('record_trial_blocked_attempt', {
        target_account: accountId,
        target_app: appId,
        target_user: auth.user.id,
        target_plan: planId || null,
        client_ip: ip,
        block_reason: reason,
      });
      if (logError) console.error('Could not record blocked trial attempt:', logError.message);
      return reply({ ok: false, eligible: false, paidCheckoutAllowed: true, requestStatus: 'blocked' }, 200);
    }

    const { data: reserved, error: reserveError } = await db.rpc('mp_reserve_trial_ip', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      client_ip: ip,
    });
    if (reserveError) throw reserveError;
    if (reserved !== true) {
      await setRequestStatus('blocked');
      const { error: logError } = await db.rpc('record_trial_blocked_attempt', {
        target_account: accountId,
        target_app: appId,
        target_user: auth.user.id,
        target_plan: planId || null,
        client_ip: ip,
        block_reason: 'ip',
      });
      if (logError) console.error('Could not record blocked trial attempt:', logError.message);
      return reply({ ok: false, eligible: false, paidCheckoutAllowed: true, requestStatus: 'blocked' }, 200);
    }

    if (!planId) return reply({ ok: true, eligible: true, activated: false, requestStatus: 'validating' });

    const { data: trialEndsAt, error: activateError } = await db.rpc('activate_verified_app_trial', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      target_plan: planId,
    });
    if (activateError) {
      const message = String(activateError.message || '');
      if (message.includes('trial_already_used') || message.includes('trial_unavailable')) {
        await setRequestStatus('blocked');
        const { data: retryReason } = await db.rpc('trial_block_reason', {
          target_account: accountId,
          target_app: appId,
          target_user: auth.user.id,
          client_ip: ip,
        });
        const blockedReason = String(retryReason || 'other') === 'eligible' ? 'other' : String(retryReason || 'other');
        const { error: logError } = await db.rpc('record_trial_blocked_attempt', {
          target_account: accountId,
          target_app: appId,
          target_user: auth.user.id,
          target_plan: planId,
          client_ip: ip,
          block_reason: blockedReason,
        });
        if (logError) console.error('Could not record blocked trial attempt:', logError.message);
        return reply({ ok: false, eligible: false, paidCheckoutAllowed: true, requestStatus: 'blocked' }, 200);
      }
      throw activateError;
    }

    const activatedAt = new Date().toISOString();
    await setRequestStatus('activated', activatedAt);
    return reply({ ok: true, eligible: true, activated: true, trialEndsAt, requestStatus: 'activated', requestId });
  } catch (error) {
    await setRequestStatus('validation_pending');
    console.error('Trial antifraud failed:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Não foi possível concluir a validação do teste grátis agora.', requestStatus: requestId ? 'validation_pending' : undefined }, 500);
  }
});
