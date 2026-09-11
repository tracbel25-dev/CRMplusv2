import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import {
  DEFAULT_GROQ_MODEL,
  findRelevantLessons,
  groqResponse,
  lessonsForPrompt,
  recordAIInteraction,
} from '@/lib/ai/server';

export const runtime = 'nodejs';

const LIMIT = 6000;
const windows = new Map<string, { startedAt: number; count: number }>();

type Suggestion = { title: string; reason: string; category: 'Verificar' | 'Possível causa' | 'Ação sugerida' };

function clean(value: unknown, max = 1800) {
  return String(value ?? '').trim().slice(0, max);
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

function parseSuggestions(raw: string): Suggestion[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA respondeu em um formato inesperado. Tente novamente.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { suggestions?: unknown[] };
  const allowed = new Set(['Verificar', 'Possível causa', 'Ação sugerida']);
  const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).map(item => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const title = clean(row.title, 180);
    const reason = clean(row.reason, 320);
    const category = allowed.has(String(row.category)) ? String(row.category) as Suggestion['category'] : 'Verificar';
    return { title, reason, category };
  }).filter(item => item.title).slice(0, 7);
  if (!suggestions.length) throw new Error('A IA não encontrou sugestões úteis para este caso. Acrescente mais detalhes e tente novamente.');
  return suggestions;
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Zeus.' }, { status: 401 });
  if (!rateLimit(access.userId)) return NextResponse.json({ error: 'Limite temporário de assistência atingido. Tente novamente em um minuto.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const fields = {
    complaint: clean(body.complaint, 1800),
    currentDiagnosis: clean(body.currentDiagnosis, 1800),
    asset: clean(body.asset, 600),
    serviceType: clean(body.serviceType, 300),
    notes: clean(body.notes, 1200),
  };
  const combined = Object.values(fields).join('\n');
  if (!fields.complaint) return NextResponse.json({ error: 'O relato do atendimento é necessário para preparar sugestões.' }, { status: 400 });
  if (combined.length > LIMIT) return NextResponse.json({ error: 'Há informação demais. Resuma as observações e tente novamente.' }, { status: 400 });

  const retrievalQuery = [fields.serviceType, fields.asset, fields.complaint, fields.currentDiagnosis, fields.notes].filter(Boolean).join(' ').slice(0, 1200);
  let lessons: Awaited<ReturnType<typeof findRelevantLessons>> = [];
  let memoryAvailable = true;
  try {
    lessons = await findRelevantLessons('zeus', access.accountId, retrievalQuery, 8);
  } catch {
    memoryAvailable = false;
  }

  const prompt = `Você é um assistente de apoio para uma oficina. Sua função é SUGERIR possibilidades para o profissional avaliar. Você não preenche diagnóstico e não afirma que algo foi testado.\n\nREGRAS:\n- Gere de 3 a 7 sugestões curtas e independentes.\n- Use o veículo/equipamento, ano/modelo quando informado, relato e histórico aprendido desta própria oficina como contexto.\n- Conhecimento geral pode ser usado para apontar problemas comuns e verificações plausíveis, mas nunca trate isso como fato do veículo atual.\n- Não invente medição, código de falha, peça trocada ou resultado de teste.\n- Dê preferência a verificações que ajudem a confirmar ou descartar hipóteses.\n- Não sugira preço.\n- Não escreva relatório, introdução, conclusão, aviso longo ou Markdown.\n- Responda APENAS JSON válido exatamente no formato:\n{"suggestions":[{"category":"Verificar|Possível causa|Ação sugerida","title":"texto curto","reason":"por que vale conferir, em uma frase"}]}\n\nAPRENDIZADOS DESTA OFICINA (referência, nunca prova):\n${lessonsForPrompt(lessons)}\n\nCASO ATUAL:\nTipo: ${fields.serviceType || 'não informado'}\nVeículo/equipamento: ${fields.asset || 'não informado'}\nRelato: ${fields.complaint}\nObservações do profissional: ${fields.notes || 'nenhuma'}\nDiagnóstico já escrito pelo profissional: ${fields.currentDiagnosis || 'ainda vazio'}`;

  try {
    const raw = await groqResponse('zeus', prompt, { maxOutputTokens: 650 });
    const suggestions = parseSuggestions(raw);
    const savedSuggestion = JSON.stringify(suggestions);
    const contextSummary = [`Tipo: ${fields.serviceType || 'não informado'}`, `Equipamento: ${fields.asset || 'não informado'}`, `Relato: ${fields.complaint}`, fields.notes ? `Notas: ${fields.notes}` : ''].filter(Boolean).join(' | ').slice(0, 4000);

    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({
        app: 'zeus', tenantKey: access.accountId, userId: access.userId,
        functionName: 'diagnostico_sugestoes', model: DEFAULT_GROQ_MODEL,
        contextSummary, suggestion: savedSuggestion,
        metadata: { lessonsUsed: lessons.map(item => item.id), memoryAvailable },
      });
    } catch {
      memoryAvailable = false;
    }

    return NextResponse.json({ suggestions, model: DEFAULT_GROQ_MODEL, interactionId, memory: { available: memoryAvailable, lessonsUsed: lessons.length } });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'A IA não conseguiu preparar sugestões agora.' }, { status: 502 });
  }
}
