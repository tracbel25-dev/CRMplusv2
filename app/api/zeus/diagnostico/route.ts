import { NextRequest, NextResponse } from 'next/server';

const GROQ_MODEL = 'openai/gpt-oss-20b';
const LIMIT = 6000;
const STORE_URL = process.env.NEXT_PUBLIC_STORE_SUPABASE_URL || 'https://sodcfarvfhkdjecjmdwc.supabase.co';
const STORE_KEY = process.env.NEXT_PUBLIC_STORE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_hPguKVNttFAz7Pqq4necfA_rxbVUqET';
const windows = new Map<string, { startedAt: number; count: number }>();

function clean(value: unknown, max = 1800) { return String(value ?? '').trim().slice(0, max); }
function rateLimit(key: string) {
  const now = Date.now(); const current = windows.get(key);
  if (!current || now - current.startedAt > 60_000) { windows.set(key, { startedAt: now, count: 1 }); return true; }
  if (current.count >= 10) return false;
  current.count += 1; return true;
}
async function authenticatedUser(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;
  const response = await fetch(`${STORE_URL}/auth/v1/user`, { headers: { apikey: STORE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user : null;
}
function extractOutput(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output || []) for (const content of item?.content || []) if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
  return parts.join('\n').trim();
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sessão inválida. Entre novamente para usar a assistência do diagnóstico.' }, { status: 401 });
  if (!rateLimit(user.id)) return NextResponse.json({ error: 'Limite temporário de assistência atingido. Tente novamente em um minuto.' }, { status: 429 });
  const apiKey = process.env.ZEUS_GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'A assistência Groq do Zeus ainda não foi configurada no servidor.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const fields = {
    complaint: clean(body.complaint, 1800), currentDiagnosis: clean(body.currentDiagnosis, 1800),
    asset: clean(body.asset, 600), serviceType: clean(body.serviceType, 300), notes: clean(body.notes, 1200)
  };
  const combined = Object.values(fields).join('\n');
  if (!fields.complaint) return NextResponse.json({ error: 'O relato do atendimento é necessário para preparar a sugestão.' }, { status: 400 });
  if (combined.length > LIMIT) return NextResponse.json({ error: 'Há informação demais para esta assistência. Resuma as observações técnicas e tente novamente.' }, { status: 400 });

  const prompt = `Você auxilia um profissional de oficina a REDIGIR um relatório de diagnóstico. Não invente testes, medições, causas, peças, códigos ou fatos que não estejam nas notas. Se algo não estiver comprovado, escreva como pendência/verificação recomendada. Use português do Brasil, linguagem técnica clara e curta. Organize em até 4 blocos: Sintomas relatados; Verificações/achados informados; Diagnóstico ou hipótese técnica (somente se sustentada); Recomendação/próximos passos. Não afirme certeza onde ela não existe.\n\nTipo de atendimento: ${fields.serviceType || 'não informado'}\nVeículo/equipamento: ${fields.asset || 'não informado'}\nRelato do cliente: ${fields.complaint}\nObservações técnicas adicionais: ${fields.notes || 'nenhuma'}\nRascunho atual: ${fields.currentDiagnosis || 'vazio'}`;

  const response = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, input: prompt, reasoning: { effort: 'low' }, max_output_tokens: 500, store: false })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: payload?.error?.message || 'A Groq não conseguiu preparar a sugestão agora.' }, { status: 502 });
  const text = extractOutput(payload);
  if (!text) return NextResponse.json({ error: 'A Groq não retornou uma sugestão utilizável.' }, { status: 502 });
  return NextResponse.json({ text, model: GROQ_MODEL });
}
