import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest } from '@/lib/server/appAccess';
import { DEFAULT_GROQ_MODEL, findRelevantLessons, groqResponse, lessonsForPrompt, recordAIInteraction } from '@/lib/ai/server';

export const runtime = 'nodejs';

type Suggestion = { title: string; reason: string };

const clean = (value: unknown, max = 1600) => String(value ?? '').trim().slice(0, max);

function parse(raw: string): Suggestion[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA respondeu em formato inesperado.');
  const data = JSON.parse(text.slice(start, end + 1)) as { suggestions?: Array<Record<string, unknown>> };
  return (data.suggestions || []).map(item => ({ title: clean(item.title, 180), reason: clean(item.reason, 320) })).filter(item => item.title).slice(0, 6);
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'zeus');
  if (!access) return NextResponse.json({ error: 'Sessão inválida ou sem acesso ao Zeus.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const stage = clean(body.stage, 80);
  const context = clean(body.context, 4500);
  if (!stage || !context) return NextResponse.json({ error: 'Faltam dados do atendimento para preparar sugestões.' }, { status: 400 });

  let lessons: Awaited<ReturnType<typeof findRelevantLessons>> = [];
  try { lessons = await findRelevantLessons('zeus', access.accountId, `${stage} ${context}`.slice(0, 1200), 6); } catch { /* segue sem memória */ }

  const stageRule = stage === 'Identificação' ? 'aponte informações úteis que podem faltar antes de iniciar o trabalho'
    : stage === 'Diagnóstico' ? 'sugira verificações e hipóteses plausíveis sem afirmar diagnóstico'
      : stage === 'Orçamento' ? 'sugira itens de escopo que merecem ser considerados, sem sugerir preço'
        : stage === 'Execução' ? 'sugira uma checklist curta de execução e cuidados coerentes com o que já foi aprovado'
          : stage === 'Conferência' ? 'sugira pontos objetivos para conferir antes da entrega'
            : 'sugira pontos objetivos para entrega, orientação ao cliente e encerramento';

  const prompt = `Você auxilia uma oficina dentro do Zeus. Está na etapa ${stage}. ${stageRule}.\nNão preencha campos automaticamente. Não invente teste realizado, peça trocada, medição ou resultado. Não sugira preço. Use aprendizados desta própria oficina apenas como referência. Gere 2 a 6 opções curtas que o profissional pode ignorar, editar ou aplicar. Responda só JSON: {"suggestions":[{"title":"ação curta","reason":"motivo em uma frase"}]}\n\nAPRENDIZADOS DESTA OFICINA:\n${lessonsForPrompt(lessons)}\n\nCONTEXTO ATUAL:\n${context}`;

  try {
    const raw = await groqResponse('zeus', prompt, { maxOutputTokens: 520 });
    const suggestions = parse(raw);
    if (!suggestions.length) throw new Error('Nenhuma sugestão útil foi encontrada para esta etapa.');
    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({ app: 'zeus', tenantKey: access.accountId, userId: access.userId, functionName: `etapa_${stage.toLocaleLowerCase('pt-BR')}`, model: DEFAULT_GROQ_MODEL, contextSummary: context.slice(0, 4000), suggestion: JSON.stringify(suggestions), metadata: { stage, lessonsUsed: lessons.map(item => item.id) } });
    } catch { /* assistência funciona mesmo se o registro de aprendizado falhar */ }
    return NextResponse.json({ suggestions, interactionId, model: DEFAULT_GROQ_MODEL });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'A IA não conseguiu preparar sugestões agora.' }, { status: 502 });
  }
}
