import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const TERMS_VERSION = '2026-09-10-v1';
const TERMS_TEXT = `TERMO DE INTEGRAÇÃO DE PAGAMENTOS — MERCADO PAGO

1. Objeto. Ao aceitar este termo, o titular da conta autoriza o CRM PLUS a conectar-se à conta Mercado Pago indicada pelo próprio titular, por meio do fluxo oficial OAuth do Mercado Pago, exclusivamente para disponibilizar recursos de cobrança e acompanhamento de pagamentos solicitados dentro dos aplicativos CRM PLUS.

2. Prestação do serviço de pagamento. O CRM PLUS é software de apoio à operação e não é instituição financeira, adquirente, subadquirente, instituição de pagamento ou custodiante dos valores transacionados nesta integração. O processamento, a autorização, a liquidação, o repasse e os demais serviços de pagamento são prestados diretamente pelo Mercado Pago, sujeito aos termos, políticas, disponibilidade e regras do próprio Mercado Pago.

3. Destino dos valores. Nesta integração, as cobranças são criadas em nome da conta Mercado Pago conectada pelo titular. O CRM PLUS não recebe comissão, percentual, split, tarifa ou repasse das transações realizadas por meio desta funcionalidade e não recebe os valores pagos pelos consumidores.

4. Taxas e condições do Mercado Pago. Tarifas, taxas, prazos de recebimento, antecipações, retenções, reservas, limites, bloqueios, recusas, chargebacks, estornos e demais condições aplicáveis são definidos e cobrados pelo Mercado Pago diretamente da conta conectada. O CRM PLUS não se responsabiliza por taxas cobradas pelo Mercado Pago nem por alterações de preços, regras ou condições do provedor.

5. Responsabilidade do estabelecimento. O titular é responsável pelas cobranças emitidas, pelos produtos ou serviços vendidos, pelos dados informados ao consumidor, por cancelamentos, devoluções, estornos, atendimento ao consumidor, obrigações fiscais e emissão de documentos fiscais quando aplicável. O titular deve conferir os valores e a identificação da cobrança antes do envio ao cliente.

6. Autorização técnica. O CRM PLUS armazenará de forma protegida os tokens de autorização necessários para operar a integração em nome da conta conectada. Senha da conta Mercado Pago, dados bancários e credenciais privadas do titular não são solicitados pelo CRM PLUS. A autorização pode ser desconectada pelo titular no CRM PLUS; a revogação também poderá estar sujeita aos mecanismos disponibilizados pelo próprio Mercado Pago.

7. Terceiros e disponibilidade. O funcionamento da integração depende dos sistemas e APIs do Mercado Pago. O CRM PLUS não garante disponibilidade ininterrupta do serviço de terceiros e não responde por indisponibilidades, bloqueios ou decisões tomadas pelo Mercado Pago, sem prejuízo das responsabilidades que não possam ser afastadas pela legislação aplicável.

8. Aceite. Ao marcar o aceite e prosseguir, o titular declara que leu e compreendeu este termo, que possui poderes para autorizar a conexão da conta Mercado Pago do estabelecimento e que concorda com o uso da integração conforme descrito acima.`;

const siteUrl = () => (Deno.env.get('STORE_SITE_URL') || 'https://crmplusv2.vercel.app').replace(/\/$/, '');
const clientId = () => Deno.env.get('MERCADO_PAGO_CONNECT_CLIENT_ID') || '4059087158712728';
const clientSecret = () => Deno.env.get('MERCADO_PAGO_CONNECT_CLIENT_SECRET') || '';
const redirectUri = () => Deno.env.get('MERCADO_PAGO_CONNECT_REDIRECT_URI') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/mercadopago-connect`;
const encryptionSecret = () => Deno.env.get('MERCADO_PAGO_CONNECT_ENCRYPTION_KEY') || '';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!key) {
    try { key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { /* ignored */ }
  }
  if (!key) throw new HttpError(503, 'Backend do CRM PLUS não está configurado.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
async function sha256Hex(value: string) {
  return Array.from(await sha256(value), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function cryptoKey() {
  const secret = encryptionSecret();
  if (!secret) throw new HttpError(503, 'A conexão Mercado Pago ainda não está configurada.');
  let bytes: Uint8Array;
  try { bytes = base64UrlToBytes(secret); } catch { throw new HttpError(503, 'Chave de proteção da integração inválida.'); }
  if (bytes.byteLength !== 32) throw new HttpError(503, 'Chave de proteção da integração inválida.');
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function seal(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(value)));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}
async function openSealed(value: string) {
  const [version, ivText, cipherText] = value.split('.');
  if (version !== 'v1' || !ivText || !cipherText) throw new HttpError(500, 'Credencial protegida inválida.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(ivText) }, await cryptoKey(), base64UrlToBytes(cipherText));
  return new TextDecoder().decode(plain);
}
function randomToken(bytes = 32) { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }

async function requireUser(request: Request, accountId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(accountId || '')) throw new HttpError(400, 'Conta inválida.');
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const db = admin();
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  const [{ data: member, error: memberError }, { data: account, error: accountError }] = await Promise.all([
    db.from('account_members').select('role,status').eq('account_id', accountId).eq('user_id', auth.user.id).maybeSingle(),
    db.from('accounts').select('status').eq('id', accountId).maybeSingle(),
  ]);
  if (memberError || accountError) throw new HttpError(500, 'Não foi possível validar a conta.');
  if (!member || member.status !== 'active' || account?.status !== 'active') throw new HttpError(403, 'Conta sem permissão para esta integração.');
  return { db, user: auth.user, member };
}

async function requireAppConfigurator(db: ReturnType<typeof admin>, accountId: string, userId: string, role: string, appId: string) {
  if (!['zeus','artemis','kronos','athena-orcamentos','athena-pesquisa'].includes(appId)) throw new HttpError(400, 'Aplicativo inválido.');
  const { data: entitlement, error: entitlementError } = await db.from('account_apps').select('status,current_period_end').eq('account_id', accountId).eq('app_id', appId).maybeSingle();
  if (entitlementError) throw new HttpError(500, 'Não foi possível validar o aplicativo.');
  const valid = entitlement && ['active','trialing'].includes(entitlement.status) && (!entitlement.current_period_end || Date.parse(entitlement.current_period_end) > Date.now());
  if (!valid) throw new HttpError(403, 'O aplicativo não está ativo para esta conta.');
  if (role === 'owner') return;
  const { data: access, error } = await db.from('member_app_access').select('can_configure').eq('account_id', accountId).eq('user_id', userId).eq('app_id', appId).maybeSingle();
  if (error) throw new HttpError(500, 'Não foi possível validar a permissão.');
  if (!access?.can_configure) throw new HttpError(403, 'Você não possui permissão para alterar pagamentos deste aplicativo.');
}

async function exchangeToken(body: Record<string, unknown>) {
  if (!clientSecret()) throw new HttpError(503, 'Credencial OAuth do Mercado Pago não configurada.');
  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), ...body }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mercado Pago OAuth failed:', response.status, data?.error || data?.message || 'unknown');
    throw new HttpError(response.status >= 500 ? 502 : 400, 'O Mercado Pago não concluiu a autorização. Tente novamente.');
  }
  if (!data?.access_token || !data?.refresh_token || !data?.user_id || !Number(data?.expires_in)) throw new HttpError(502, 'Resposta OAuth do Mercado Pago incompleta.');
  return data as Record<string, any>;
}

async function callback(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const providerError = url.searchParams.get('error');
  const back = (result: string) => Response.redirect(`${siteUrl()}/assinaturas?mp=${encodeURIComponent(result)}`, 302);
  if (!state) return back('invalid');
  try {
    const db = admin();
    const stateHash = await sha256Hex(state);
    const { data: saved, error } = await db.rpc('mp_oauth_consume', { target_state_hash: stateHash });
    if (error || !saved) throw new HttpError(400, 'Autorização expirada ou já utilizada.');
    if (providerError || !code) return back('denied');

    const [{ data: member }, { data: account }] = await Promise.all([
      db.from('account_members').select('role,status').eq('account_id', saved.account_id).eq('user_id', saved.user_id).maybeSingle(),
      db.from('accounts').select('status').eq('id', saved.account_id).maybeSingle(),
    ]);
    if (member?.role !== 'owner' || member?.status !== 'active' || account?.status !== 'active') throw new HttpError(403, 'O titular não possui mais permissão para conectar a conta.');

    const verifier = await openSealed(saved.code_verifier_ciphertext);
    const token = await exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier });
    const scopes = String(token.scope || '').split(/\s+/).filter(Boolean);
    if (!['read','write','offline_access'].every(scope => scopes.includes(scope))) throw new HttpError(403, 'A conta Mercado Pago não concedeu todas as permissões necessárias.');
    if (token.live_mode !== true) throw new HttpError(403, 'Conecte uma conta Mercado Pago de produção.');

    const expiresAt = new Date(Date.now() + Number(token.expires_in) * 1000).toISOString();
    const { error: saveError } = await db.rpc('mp_connected_account_upsert', {
      target_account: saved.account_id,
      target_provider_user_id: Number(token.user_id),
      target_public_key: token.public_key ? String(token.public_key) : null,
      target_scope: scopes.join(' '),
      target_live_mode: true,
      target_access_token_ciphertext: await seal(String(token.access_token)),
      target_refresh_token_ciphertext: await seal(String(token.refresh_token)),
      target_token_expires_at: expiresAt,
      target_connected_by: saved.user_id,
    });
    if (saveError) {
      if (saveError.code === '23505') throw new HttpError(409, 'Esta conta Mercado Pago já está vinculada a outra empresa no CRM PLUS.');
      throw saveError;
    }
    return back('connected');
  } catch (error) {
    console.error('Mercado Pago OAuth callback failed:', error instanceof Error ? error.message : 'unknown');
    return back('error');
  }
}

export async function handler(request: Request) {
  if (request.method === 'GET') return callback(request);
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': siteUrl(),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && origin !== siteUrl()) return reply({ error: 'Origem não autorizada.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Método inválido.' }, 405);

  try {
    const body = await request.json().catch(() => null) as Record<string, any> | null;
    if (!body) throw new HttpError(400, 'Solicitação inválida.');
    const accountId = String(body.accountId || '');
    const { db, user, member } = await requireUser(request, accountId);
    const termsHash = await sha256Hex(TERMS_TEXT);

    if (body.action === 'status') {
      const [connectionResult, settingsResult] = await Promise.all([
        db.rpc('mp_connected_account_get', { target_account: accountId }),
        db.rpc('mp_connected_app_settings_get', { target_account: accountId }),
      ]);
      if (connectionResult.error || settingsResult.error) throw new HttpError(500, 'Não foi possível consultar a integração.');
      const connection = connectionResult.data as Record<string, any> | null;
      const appSettings = Array.isArray(settingsResult.data) ? settingsResult.data : [];
      return reply({
        ready: !!clientSecret() && !!encryptionSecret(),
        isOwner: member.role === 'owner',
        terms: { version: TERMS_VERSION, hash: termsHash, text: TERMS_TEXT },
        connection: connection ? {
          providerUserId: String(connection.provider_user_id), publicKey: connection.public_key,
          scope: connection.scope, liveMode: connection.live_mode, tokenExpiresAt: connection.token_expires_at,
          status: connection.status, connectedAt: connection.connected_at, updatedAt: connection.updated_at,
        } : null,
        appSettings: appSettings.map((item: Record<string, any>) => ({ appId: item.app_id, enabled: item.enabled, updatedAt: item.updated_at })),
      });
    }

    if (body.action === 'authorize') {
      if (member.role !== 'owner') throw new HttpError(403, 'Somente o titular pode conectar a conta Mercado Pago.');
      if (!clientSecret() || !encryptionSecret()) throw new HttpError(503, 'A conexão Mercado Pago ainda está em configuração.');
      if (body.acceptedTerms !== true || body.termsVersion !== TERMS_VERSION) throw new HttpError(400, 'Leia e aceite o termo da integração para continuar.');
      const state = randomToken(32);
      const verifier = randomToken(48);
      const challenge = bytesToBase64Url(await sha256(verifier));
      const stateHash = await sha256Hex(state);
      const { error: beginError } = await db.rpc('mp_oauth_begin', {
        target_state_hash: stateHash,
        target_account: accountId,
        target_user: user.id,
        verifier_ciphertext: await seal(verifier),
        target_terms_version: TERMS_VERSION,
        target_terms_hash: termsHash,
        target_user_agent: request.headers.get('user-agent')?.slice(0, 500) || '',
      });
      if (beginError) throw new HttpError(500, 'Não foi possível registrar o aceite e iniciar a autorização.');
      const authorizeUrl = new URL('https://auth.mercadopago.com/authorization');
      authorizeUrl.searchParams.set('client_id', clientId());
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('platform_id', 'mp');
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri());
      authorizeUrl.searchParams.set('code_challenge', challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      return reply({ url: authorizeUrl.toString() });
    }

    if (body.action === 'disconnect') {
      if (member.role !== 'owner') throw new HttpError(403, 'Somente o titular pode desconectar a conta Mercado Pago.');
      const { error } = await db.rpc('mp_connected_account_disconnect', { target_account: accountId, target_user: user.id });
      if (error) throw new HttpError(500, 'Não foi possível desconectar a conta.');
      return reply({ ok: true });
    }

    if (body.action === 'set-app-enabled') {
      const appId = String(body.appId || '');
      await requireAppConfigurator(db, accountId, user.id, member.role, appId);
      const enabled = body.enabled === true;
      if (enabled) {
        const { data: connection, error } = await db.rpc('mp_connected_account_get', { target_account: accountId });
        if (error || !connection || connection.status !== 'active') throw new HttpError(409, 'Conecte uma conta Mercado Pago antes de habilitar pagamentos.');
        const scopes = String(connection.scope || '').split(/\s+/);
        if (!scopes.includes('write')) throw new HttpError(409, 'A autorização Mercado Pago não permite criar cobranças. Reconecte a conta.');
      }
      const { error } = await db.rpc('mp_connected_app_setting_set', { target_account: accountId, target_app: appId, target_enabled: enabled, target_user: user.id });
      if (error) throw new HttpError(500, 'Não foi possível atualizar a configuração de pagamentos.');
      return reply({ ok: true, enabled });
    }

    throw new HttpError(400, 'Ação inválida.');
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('Mercado Pago connection failed:', error);
    return reply({ error: error instanceof HttpError ? error.message : 'Não foi possível concluir a solicitação.' }, error instanceof HttpError ? error.status : 500);
  }
}

Deno.serve(handler);
