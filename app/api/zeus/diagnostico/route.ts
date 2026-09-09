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
  if (!fields.complaint) return NextResponse.json({ error: 'O relato do atendimento é necessário para preparar a sugestão.' }, { status: 400 });
  if (combined.length > LIMIT) return NextResponse.json({ error: 'Há informação demais para esta assistência. Resuma as observações técnicas e tente novamente.' }, { status: 400 });

  const retrievalQuery = [fields.serviceType, fields.asset, fields.complaint, fields.currentDiagnosis, fields.notes].filter(Boolean).join(' ').slice(0, 1200);
  let lessons: Awaited<ReturnType<typeof findRelevantLessons>> = [];
  let memoryAvailable = true;
  try {
    lessons = await findRelevantLessons('zeus', access.accountId, retrievalQuery, 8);
  } catch {
    memoryAvailable = false;
  }

  const memory = lessonsForPrompt(lessons);
  const prompt = `Você auxilia um profissional de oficina a REDIGIR e RACIOCINAR sobre um relatório de diagnóstico técnico. Seja criterioso e útil, não apenas reescreva frases.\n\nREGRAS OBRIGATÓRIAS:\n- Não invente teste, medição, código de falha, causa, peça, procedimento ou resultado que não tenha sido informado.\n- Diferencie claramente fato observado, hipótese e verificação recomendada.\n- Se houver mais de uma causa plausível, priorize verificações que discriminem as hipóteses.\n- Aprendizados anteriores são referências, nunca provas de que o caso atual é igual.\n- Evidência atual sempre prevalece sobre memória anterior.\n- Não revele dados de outras empresas, clientes ou aplicativos.\n- Não use preço, proposta ou dado comercial de concorrente como conhecimento reutilizável.\n- Use português do Brasil e linguagem técnica direta.\n- Organize em até 4 blocos: Sintomas relatados; Verificações/achados; Hipóteses/diagnóstico; Recomendação/próximos passos.\n\nMEMÓRIA RELEVANTE DO ZEUS:\n${memory}\n\nCASO ATUAL:\nTipo de atendimento: ${fields.serviceType || 'não informado'}\nVeículo/equipamento: ${fields.asset || 'não informado'}\nRelato do cliente: ${fields.complaint}\nObservações técnicas adicionais: ${fields.notes || 'nenhuma'}\nRascunho atual: ${fields.currentDiagnosis || 'vazio'}`;

  try {
    const text = await groqResponse('zeus', prompt, { maxOutputTokens: 650 });
    const contextSummary = [
      `Tipo: ${fields.serviceType || 'não informado'}`,
      `Equipamento: ${fields.asset || 'não informado'}`,
      `Relato: ${fields.complaint}`,
      fields.notes ? `Notas: ${fields.notes}` : '',
    ].filter(Boolean).join(' | ').slice(0, 4000);

    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({
        app: 'zeus',
        tenantKey: access.accountId,
        userId: access.userId,
        functionName: 'diagnostico',
        model: DEFAULT_GROQ_MODEL,
        contextSummary,
        suggestion: text,
        metadata: { lessonsUsed: lessons.map(item => item.id), memoryAvailable },
      });
    } catch {
      memoryAvailable = false;
    }

    return NextResponse.json({
      text,
      model: DEFAULT_GROQ_MODEL,
      interactionId,
      memory: { available: memoryAvailable, lessonsUsed: lessons.length },
    });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'A Groq não conseguiu preparar a sugestão agora.' }, { status: 502 });
  }
}
