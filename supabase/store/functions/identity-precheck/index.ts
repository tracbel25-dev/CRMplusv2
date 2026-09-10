import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const siteUrl = () => (Deno.env.get('STORE_SITE_URL') || 'https://crmplusv2.vercel.app').replace(/\/$/, '');
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const digits = (v: unknown) => String(v || '').replace(/\D/g, '');
const cleanName = (v: unknown) => String(v || '').trim().replace(/\s+/g, ' ');
const normalizedName = (v: unknown) => cleanName(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const validCpf = (value: string) => {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
};
const birthForSerpro = (value: string) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
};
const tokenString = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

async function verifyWithSerpro(cpf: string, birth: string, informedName: string) {
  const key = Deno.env.get('SERPRO_CPF_CONSUMER_KEY');
  const secret = Deno.env.get('SERPRO_CPF_CONSUMER_SECRET');
  const urlTemplate = Deno.env.get('SERPRO_CPF_URL_TEMPLATE');
  if (!key || !secret || !urlTemplate) return { verified: false, provider: 'local' };

  const basic = btoa(`${key}:${secret}`);
  const tokenResponse = await fetch(Deno.env.get('SERPRO_CPF_TOKEN_URL') || 'https://gateway.apiserpro.serpro.gov.br/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData?.access_token) throw new Error('SERPRO_AUTH');

  const url = urlTemplate.replaceAll('{cpf}', encodeURIComponent(cpf)).replaceAll('{birth}', encodeURIComponent(birth));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const data = await response.json().catch(() => ({}));
  if ([400, 404, 422].includes(response.status)) return { verified: false, provider: 'serpro', mismatch: true };
  if (!response.ok) throw new Error('SERPRO_QUERY');

  const candidates = [data?.nome, data?.name, data?.nomePessoa, data?.dados?.nome, data?.pessoa?.nome].filter(Boolean).map(normalizedName);
  if (!candidates.length) throw new Error('SERPRO_NAME_MISSING');
  const matches = candidates.includes(normalizedName(informedName));
  return { verified: matches, provider: 'serpro', mismatch: !matches };
}

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
    const body = await request.json().catch(() => null);
    const cpf = digits(body?.cpf);
    const name = cleanName(body?.name);
    const email = String(body?.email || '').trim().toLowerCase();
    const birth = birthForSerpro(String(body?.birthDate || ''));
    if (!validCpf(cpf)) return reply({ error: 'CPF inválido.' }, 400);
    if (name.length < 5 || !name.includes(' ')) return reply({ error: 'Informe o nome completo.' }, 400);
    if (!birth) return reply({ error: 'Data de nascimento inválida.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: 'E-mail inválido.' }, 400);

    const verification = await verifyWithSerpro(cpf, birth, name);
    if (verification.mismatch) return reply({ error: 'CPF, nome ou data de nascimento não conferem.' }, 422);

    const reservationToken = tokenString();
    const { data, error } = await admin().rpc('reserve_signup_identity', {
      reservation_token: reservationToken,
      document: cpf,
      full_name: name,
      birth_date: birth,
      email,
      provider_verified: verification.verified,
      verification_provider: verification.provider,
    });
    if (error) throw error;
    const result = String(data || '');
    if (result === 'document_used') return reply({ error: 'Este CPF já está vinculado a uma conta.' }, 409);
    if (result === 'document_reserved') return reply({ error: 'Este CPF já está em processo de cadastro.' }, 409);
    if (result === 'invalid_cpf') return reply({ error: 'CPF inválido.' }, 400);
    if (result !== 'reserved') return reply({ error: 'Não foi possível validar os dados do cadastro.' }, 400);

    return reply({ ok: true, reservationToken, verification: verification.verified ? 'official' : 'format' });
  } catch (error) {
    console.error('Identity precheck failed:', error instanceof Error ? error.message : 'unknown');
    const code = error instanceof Error ? error.message : '';
    if (code.startsWith('SERPRO_')) return reply({ error: 'A validação oficial do CPF está temporariamente indisponível. Tente novamente.' }, 503);
    return reply({ error: 'Não foi possível validar os dados do cadastro.' }, 500);
  }
});
