import { NextRequest, NextResponse } from 'next/server';
import { authorizeR2Request, describeR2Failure, presignR2, readR2Config, safeObjectName, type R2App } from '@/lib/r2/server';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const windows = new Map<string, { startedAt: number; count: number }>();

function isR2App(value: string): value is R2App {
  return value === 'zeus' || value === 'artemis';
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

function validOwnedKey(key: string, accountId: string) {
  return !!key && key.startsWith(`accounts/${accountId}/`) && !key.includes('..');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isR2App(app)) return NextResponse.json({ error: 'Aplicativo de armazenamento inválido.' }, { status: 404 });

  const access = await authorizeR2Request(request, app);
  if (!access) return NextResponse.json({ error: 'Entre com uma conta que tenha acesso a este aplicativo para enviar arquivos.' }, { status: 401 });
  if (!rateLimit(`${app}:${access.userId}`)) return NextResponse.json({ error: 'Muitos envios em pouco tempo. Aguarde um minuto e tente novamente.' }, { status: 429 });

  try { readR2Config(app); }
  catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : 'R2 não configurado.' }, { status: 503 }); }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione um arquivo válido.' }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: 'Formato não permitido. Use JPG, PNG, WEBP ou PDF.' }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'O arquivo deve ter no máximo 8 MB.' }, { status: 400 });

  const objectName = safeObjectName(file.name, file.type);
  const key = `accounts/${access.accountId}/${objectName}`;
  const payload = Buffer.from(await file.arrayBuffer());
  const upload = await fetch(presignR2(app, 'PUT', key, 300), {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: payload,
    cache: 'no-store',
  });
  if (!upload.ok) {
    const detail = await describeR2Failure(upload, 'gravação');
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({
    key,
    url: presignR2(app, 'GET', key, 900),
    name: file.name,
    type: file.type,
    size: file.size,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isR2App(app)) return NextResponse.json({ error: 'Aplicativo de armazenamento inválido.' }, { status: 404 });
  const access = await authorizeR2Request(request, app);
  if (!access) return NextResponse.json({ error: 'Sessão inválida para acessar este arquivo.' }, { status: 401 });

  try { readR2Config(app); }
  catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : 'R2 não configurado.' }, { status: 503 }); }

  if (request.nextUrl.searchParams.get('health') === '1') {
    const probeKey = `accounts/${access.accountId}/.crmplus-r2-health-${Date.now()}.txt`;
    const probe = await fetch(presignR2(app, 'PUT', probeKey, 60), {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'crmplus-r2-health',
      cache: 'no-store',
    });
    if (!probe.ok) {
      const detail = await describeR2Failure(probe, 'validação de escrita');
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    const remove = await fetch(presignR2(app, 'DELETE', probeKey, 60), { method: 'DELETE', cache: 'no-store' });
    if (!remove.ok && remove.status !== 404) {
      const detail = await describeR2Failure(remove, 'limpeza do teste');
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    return NextResponse.json({ ok: true, app, write: true });
  }

  const key = request.nextUrl.searchParams.get('key') || '';
  if (!validOwnedKey(key, access.accountId)) return NextResponse.json({ error: 'Arquivo fora do escopo desta conta.' }, { status: 403 });
  return NextResponse.json({ url: presignR2(app, 'GET', key, 900) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isR2App(app)) return NextResponse.json({ error: 'Aplicativo de armazenamento inválido.' }, { status: 404 });
  const access = await authorizeR2Request(request, app);
  if (!access) return NextResponse.json({ error: 'Sessão inválida para remover este arquivo.' }, { status: 401 });

  try { readR2Config(app); }
  catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : 'R2 não configurado.' }, { status: 503 }); }

  const body = await request.json().catch(() => ({}));
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!validOwnedKey(key, access.accountId)) return NextResponse.json({ error: 'Arquivo fora do escopo desta conta.' }, { status: 403 });

  const remove = await fetch(presignR2(app, 'DELETE', key, 300), { method: 'DELETE', cache: 'no-store' });
  if (!remove.ok && remove.status !== 404) {
    const detail = await describeR2Failure(remove, 'remoção');
    return NextResponse.json({ error: detail }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
