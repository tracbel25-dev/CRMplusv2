import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

export type R2App = 'zeus' | 'artemis';

type R2Config = {
  app: R2App;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

const STORE_URL = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL || 'https://sodcfarvfhkdjecjmdwc.supabase.co';
const STORE_KEY = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET';

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function readR2Config(app: R2App): R2Config {
  const prefix = app === 'zeus' ? 'ZEUS' : 'ARTEMIS';
  const accountId = env(`${prefix}_R2_ACCOUNT_ID`);
  const accessKeyId = env(`${prefix}_R2_ACCESS_KEY_ID`);
  const secretAccessKey = env(`${prefix}_R2_SECRET_ACCESS_KEY`);
  const bucket = env(`${prefix}_R2_BUCKET`);

  const missing = [
    [`${prefix}_R2_ACCOUNT_ID`, accountId],
    [`${prefix}_R2_ACCESS_KEY_ID`, accessKeyId],
    [`${prefix}_R2_SECRET_ACCESS_KEY`, secretAccessKey],
    [`${prefix}_R2_BUCKET`, bucket],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) throw new Error(`Configuração R2 incompleta para ${app}: ${missing.join(', ')}.`);
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error(`${prefix}_R2_ACCOUNT_ID não possui o formato esperado.`);
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucket)) throw new Error(`${prefix}_R2_BUCKET possui um nome inválido.`);

  return {
    app,
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(bucket: string, key = '') {
  const parts = [bucket, ...key.split('/').filter(Boolean)].map(awsEncode);
  return `/${parts.join('/')}`;
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function signingKey(secret: string, date: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

export function presignR2(app: R2App, method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', key: string, expires = 900) {
  const config = readR2Config(app);
  const now = new Date();
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = iso.slice(0, 8);
  const credentialScope = `${date}/auto/s3/aws4_request`;
  const host = new URL(config.endpoint).host;
  const path = canonicalPath(config.bucket, key);

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': iso,
    'X-Amz-Expires': String(Math.min(Math.max(expires, 1), 604800)),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
    .join('&');

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    iso,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(config.secretAccessKey, date)).update(stringToSign).digest('hex');
  return `${config.endpoint}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

async function storeFetch(path: string, token: string) {
  const response = await fetch(`${STORE_URL}${path}`, {
    headers: { apikey: STORE_KEY, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json();
}

function restPath(table: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/rest/v1/${table}?${query.toString()}`;
}

export async function authorizeR2Request(request: NextRequest, app: R2App) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;

  const userResponse = await fetch(`${STORE_URL}/auth/v1/user`, {
    headers: { apikey: STORE_KEY, authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json().catch(() => null);
  if (!user || typeof user.id !== 'string') return null;

  const memberships = await storeFetch(restPath('account_members', {
    select: 'account_id,role,status',
    user_id: `eq.${user.id}`,
    status: 'eq.active',
    order: 'created_at.asc',
    limit: '1',
  }), token) as Array<{ account_id: string; role: string }> | null;
  const membership = memberships?.[0];
  if (!membership?.account_id) return null;

  const accountApps = await storeFetch(restPath('account_apps', {
    select: 'app_id,status',
    account_id: `eq.${membership.account_id}`,
    app_id: `eq.${app}`,
    status: 'in.(trialing,active)',
    limit: '1',
  }), token) as Array<{ app_id: string }> | null;
  if (!accountApps?.length) return null;

  if (membership.role !== 'owner') {
    const access = await storeFetch(restPath('member_app_access', {
      select: 'app_id,user_id',
      account_id: `eq.${membership.account_id}`,
      user_id: `eq.${user.id}`,
      app_id: `eq.${app}`,
      limit: '1',
    }), token) as Array<{ app_id: string }> | null;
    if (!access?.length) return null;
  }

  return { token, userId: user.id as string, accountId: membership.account_id };
}

export function safeObjectName(fileName: string, contentType: string) {
  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  const ext = extensionByType[contentType] || 'bin';
  const base = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/\.[^.]+$/, '') || 'arquivo';
  return `${Date.now()}-${randomUUID()}-${base}.${ext}`;
}
