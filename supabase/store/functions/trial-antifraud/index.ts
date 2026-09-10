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
    if (!/^[0-9a-f-]{36}$/i.test(accountId) || !/^[a-z0-9_-]{2,40}$/i.test(appId)) return reply({ error: 'Solicitação inválida.' }, 400);

    const ip = clientIp(request);
    if (!ip || ip.length > 128) return reply({ error: 'Não foi possível validar a rede usada para o teste grátis.' }, 403);

    const { data: member, error: memberError } = await db.from('account_members').select('role,status').eq('account_id', accountId).eq('user_id', auth.user.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== 'active') return reply({ error: 'Conta sem permissão para iniciar teste grátis.' }, 403);

    const { data: eligible, error: eligibleError } = await db.rpc('mp_trial_eligible_ip', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      client_ip: ip,
    });
    if (eligibleError) throw eligibleError;
    if (eligible !== true) return reply({ error: 'Teste grátis indisponível. Esta conta, usuário ou rede já utilizou o benefício.' }, 409);

    const { data: reserved, error: reserveError } = await db.rpc('mp_reserve_trial_ip', {
      target_account: accountId,
      target_app: appId,
      target_user: auth.user.id,
      client_ip: ip,
    });
    if (reserveError) throw reserveError;
    if (reserved !== true) return reply({ error: 'Este endereço de internet já foi usado para teste grátis em outra conta.' }, 409);

    return reply({ ok: true });
  } catch (error) {
    console.error('Trial antifraud failed:', error instanceof Error ? error.message : 'unknown');
    return reply({ error: 'Não foi possível validar a elegibilidade do teste grátis.' }, 500);
  }
});
