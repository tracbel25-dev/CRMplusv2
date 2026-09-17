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

  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Entre na sua conta para continuar.' }, 401);
    const db = admin();
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
      const { error: logError } = await db.rpc('record_trial_blocked_attempt', {
        target_account: accountId,
        target_app: appId,
        target_user: auth.user.id,
        target_plan: planId || null,
        client_ip: ip,
        block_reason: reason,
      });
      if (logError) console.error('Could not record blocked trial attempt:', logError.message);
      return reply({ ok: false, eligible: false, paidCheckoutAllowed: true }, 200);
    }

    const { data: reserved, error: reserveError } = await db.rpc('mp_reserve_trial_ip', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      client_ip: ip,
    });
    if (reserveError) throw reserveError;
    if (reserved !== true) {
      const { error: logError } = await db.rpc('record_trial_blocked_attempt', {
        target_account: accountId,
        target_app: appId,
        target_user: auth.user.id,
        target_plan: planId || null,
        client_ip: ip,
        block_reason: 'ip',
      });
      if (logError) console.error('Could not record blocked trial attempt:', logError.message);
      return reply({ ok: false, eligible: false, paidCheckoutAllowed: true }, 200);
    }

    if (!planId) return reply({ ok: true, eligible: true, activated: false });

    const { data: trialEndsAt, error: activateError } = await db.rpc('activate_verified_app_trial', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      target_plan: planId,
    });
    if (activateError) {
      const message = String(activateError.message || '');
      if (message.includes('trial_already_used') || message.includes('trial_unavailable')) {
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
        return reply({ ok: false, eligible: false, paidCheckoutAllowed: true }, 200);
      }
      throw activateError;
    }

    return reply({ ok: true, eligible: true, activated: true, trialEndsAt });
  } catch (error) {
    console.error('Trial antifraud failed:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Não foi possível validar a elegibilidade do teste grátis.' }, 500);
  }
});
