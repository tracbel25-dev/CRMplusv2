import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest, type ServerApp } from '@/lib/server/appAccess';
import {
  DEFAULT_GROQ_MODEL,
  findRelevantLessons,
  groqResponse,
  lessonsForPrompt,
  recordAIInteraction,
} from '@/lib/ai/server';

export const runtime = 'nodejs';

const targets: Record<ServerApp, string[]> = {
  zeus: ['complaint', 'notes', 'task', 'update', 'reason'],
  artemis: ['category', 'description', 'allergens', 'note', 'notes'],
};

const contextFields: Record<ServerApp, string[]> = {
  zeus: ['type', 'model', 'year', 'meter', 'complaint', 'notes', 'task', 'update'],
  artemis: ['name', 'category', 'description', 'allergens', 'preparation', 'note', 'notes'],
};

function isSupportedApp(value: string): value is ServerApp {
  return value === 'zeus' || value === 'artemis';
}

function sanitize(value: unknown, max = 1200) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (/(concorrente|competidor|outra oficina|outra empresa|empresa rival)/i.test(text)
      && /(r\$|pre[cç]o|valor|cobra|cobrou|cota[cç][aã]o|proposta|desconto|margem|or[cç]amento)/i.test(text)) {
    return '[conteúdo comercial de terceiro omitido]';
  }
  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail omitido]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF omitido]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ omitido]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g, '[telefone omitido]')
    .replace(/R\$\s?\d[\d.,]*/gi, '[valor omitido]')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}

function parseSuggestions(raw: string, allowed: string[]) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou preenchimentos em formato válido.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { suggestions?: Record<string, unknown> };
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.suggestions || {})) {
    if (!allowed.includes(name)) continue;
    const next = sanitize(value, 1800);
    if (next) result[name] = next;
  }
  return result;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isSupportedApp(app)) return NextResponse.json({ error: 'Aplicativo de IA inválido.' }, { status: 404 });

  const access = await authorizeAppRequest(request, app);
  if (!access) return NextResponse.json({ error: 'Entre com uma conta que tenha acesso a este aplicativo.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawValues = body?.values && typeof body.values === 'object' ? body.values as Record<string, unknown> : {};
  const presentNames = Array.isArray(body?.fieldNames) ? body.fieldNames.map((value: unknown) => String(value)) : [];
  const allowedTargets = targets[app].filter(name => presentNames.includes(name));
  if (!allowedTargets.length) {
    return NextResponse.json({ error: 'Este formulário ainda não possui campos adequados para assistência de IA.' }, { status: 400 });
  }

  const values = Object.fromEntries(contextFields[app]
    .filter(name => name in rawValues)
    .map(name => [name, sanitize(rawValues[name], 1000)]));

  const mass = (Array.isArray(body?.mass) ? body.mass : [])
    .slice(0, 44)
    .map((item: unknown) => sanitize(item, 900))
    .filter(Boolean);

  const query = `${Object.values(values).join(' ')} ${mass.slice(0, 10).join(' ')}`.slice(0, 2500);
  const lessons = await findRelevantLessons(app, access.accountId, query || allowedTargets.join(' '), 8).catch(() => []);
  const memory = lessonsForPrompt(lessons);

  const appInstruction = app === 'zeus'
    ? `Você auxilia o preenchimento operacional de uma oficina. Melhore relatos, observações, tarefas e atualizações sem inventar diagnóstico, teste, peça, medição, causa ou resultado. O relato do cliente deve preservar apenas o que foi informado e separar sintoma de hipótese.`
    : `Você auxilia o preenchimento operacional de um restaurante. Sugira categoria, descrição de cardápio, ingredientes/alergênicos e observações sem inventar ingrediente, alergênico, preparo, característica do produto ou informação que não esteja sustentada pelo formulário ou pelos padrões fornecidos.`;

  const prompt = `${appInstruction}\n\nREGRAS OBRIGATÓRIAS:\n- Use somente os campos atuais, padrões históricos sanitizados da própria conta e aprendizados privados relevantes.\n- Não use nem produza preço, margem, proposta, desconto ou dado comercial de concorrente.\n- Não inclua nome de cliente, telefone, e-mail, CPF/CNPJ ou identificador único.\n- Não transforme frequência histórica em fato sobre o caso atual.\n- Se não houver informação suficiente para um campo, omita esse campo da resposta.\n- Se um campo já estiver claro e completo, não o reescreva sem necessidade.\n- Seja curto, operacional e em português do Brasil.\n\nCAMPOS QUE PODE SUGERIR NESTE FORMULÁRIO:\n${allowedTargets.join(', ')}\n\nVALORES ATUAIS SEGUROS:\n${JSON.stringify(values)}\n\nPADRÕES OPERACIONAIS SANITIZADOS DA PRÓPRIA CONTA:\n${mass.length ? mass.map((item: string, index: number) => `${index + 1}. ${item}`).join('\n') : 'Nenhum histórico suficiente ainda.'}\n\nAPRENDIZADOS PRIVADOS RELEVANTES:\n${memory}\n\nResponda SOMENTE JSON válido no formato:\n{"suggestions":{"nome_do_campo":"texto sugerido"}}`;

  try {
    const raw = await groqResponse(app, prompt, { maxOutputTokens: 650 });
    const suggestions = parseSuggestions(raw, allowedTargets);
    if (!Object.keys(suggestions).length) {
      return NextResponse.json({ suggestions: {}, interactionId: '', memory: { lessonsUsed: lessons.length, massUsed: mass.length } });
    }

    const suggestionSummary = Object.entries(suggestions).map(([name, value]) => `${name}: ${value}`).join('\n');
    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({
        app,
        tenantKey: access.accountId,
        userId: access.userId,
        functionName: 'preenchimento_assistido',
        model: DEFAULT_GROQ_MODEL,
        contextSummary: Object.entries(values).map(([name, value]) => `${name}: ${value}`).join(' | ').slice(0, 4000),
        suggestion: suggestionSummary,
        metadata: { fields: Object.keys(suggestions), lessonsUsed: lessons.map(item => item.id), massUsed: mass.length },
      });
    } catch {
      interactionId = '';
    }

    return NextResponse.json({
      suggestions,
      interactionId,
      model: DEFAULT_GROQ_MODEL,
      memory: { lessonsUsed: lessons.length, massUsed: mass.length },
    });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível preparar o preenchimento agora.' }, { status: 502 });
  }
}
