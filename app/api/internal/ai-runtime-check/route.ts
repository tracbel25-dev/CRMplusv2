import { NextRequest, NextResponse } from 'next/server';
import { groqResponse, operationalAIClient, type AIApp } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHECK_TOKEN = 'FIXOnxXHP49__SaWPz6EsZuDjGhNbKfw';

async function checkApp(app: AIApp) {
  const prefix = app === 'zeus' ? 'ZEUS' : 'ARTEMIS';
  const groqEnv = Boolean(process.env[`${prefix}_GROQ_API_KEY`]?.trim());
  const supabaseSecretEnv = Boolean(process.env[`${prefix}_SUPABASE_SECRET_KEY`]?.trim());

  let groq = false;
  let memory = false;
  let groqStatus = groqEnv ? 'pending' : 'missing_env';
  let memoryStatus = supabaseSecretEnv ? 'pending' : 'missing_env';

  if (groqEnv) {
    try {
      const text = await groqResponse(app, 'Responda somente com a palavra OK.', { maxOutputTokens: 20 });
      groq = Boolean(text.trim());
      groqStatus = groq ? 'ok' : 'empty_response';
    } catch {
      groqStatus = 'request_failed';
    }
  }

  if (supabaseSecretEnv) {
    try {
      const db = operationalAIClient(app);
      const { error } = await db.from('ai_lessons').select('id', { head: true, count: 'exact' });
      memory = !error;
      memoryStatus = error ? 'query_failed' : 'ok';
    } catch {
      memoryStatus = 'query_failed';
    }
  }

  return {
    groqEnv,
    groq,
    groqStatus,
    supabaseSecretEnv,
    memory,
    memoryStatus,
  };
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== CHECK_TOKEN) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const [zeus, artemis] = await Promise.all([checkApp('zeus'), checkApp('artemis')]);
  const ok = zeus.groq && zeus.memory && artemis.groq && artemis.memory;

  return NextResponse.json(
    { ok, zeus, artemis },
    {
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store, max-age=0' },
    },
  );
}
