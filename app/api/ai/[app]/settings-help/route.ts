import { NextRequest, NextResponse } from 'next/server';
import { authorizeAppRequest, type ServerApp } from '@/lib/server/appAccess';
import { planFeatureError, requireZeusFeature } from '@/lib/server/zeusPlanAccess';
import { DEFAULT_GROQ_MODEL, findRelevantLessons, groqResponse, lessonsForPrompt, recordAIInteraction } from '@/lib/ai/server';

export const runtime = 'nodejs';

function isSupportedApp(value: string): value is ServerApp {
  return value === 'zeus' || value === 'artemis';
}

function clean(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseSuggestions(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou sugestões válidas.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { suggestions?: unknown[] };
  const seen = new Set<string>();
  return (Array.isArray(parsed.suggestions) ? parsed.suggestions : [])
    .map(value => clean(value, 220))
    .filter(value => {
      const key = value.toLocaleLowerCase('pt-BR');
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  if (!isSupportedApp(app)) return NextResponse.json({ error: 'Aplicativo de IA inválido.' }, { status: 404 });

  const access = await authorizeAppRequest(request, app);
  if (!access) return NextResponse.json({ error: 'Entre com uma conta que tenha acesso a este aplicativo.' }, { status: 401 });

  if (app === 'zeus') {
    try { await requireZeusFeature(access.accountId, 'ai'); }
    catch (reason) { return NextResponse.json({ error: planFeatureError(reason, 'Sugestões de IA não estão incluídas no Zeus Start.') }, { status: 403 }); }
  }

  const body = await request.json().catch(() => ({}));
  const fieldKey = clean(body?.fieldKey, 80);
  const label = clean(body?.label, 120);
  const currentHelp = clean(body?.currentHelp, 300);
  const description = clean(body?.description, 300);
  if (!fieldKey || !label) return NextResponse.json({ error: 'Campo não informado.' }, { status: 400 });

  const query = `personalização ${fieldKey} ${label} ${currentHelp} ${description}`.slice(0, 1200);
  const lessons = await findRelevantLessons(app, access.accountId, query, 6).catch(() => []);
  const memory = lessonsForPrompt(lessons);

  const prompt = `Você ajuda uma empresa a personalizar as dicas curtas dos campos do CRM PLUS.\n\nREGRAS:\n- Gere exatamente 4 sugestões curtas, claras e diferentes entre si.\n- A dica deve orientar o operador sobre o que preencher, sem texto técnico e sem inventar regras da empresa.\n- Considere o nome atual do campo, a descrição original e a dica já escrita pelo cliente.\n- Reaproveite aprendizados privados da própria empresa quando forem relevantes.\n- Não inclua preço, dados pessoais, nomes de clientes, credenciais ou informações sensíveis.\n- Português do Brasil.\n\nCAMPO: ${label}\nCHAVE: ${fieldKey}\nDESCRIÇÃO ORIGINAL: ${description || 'Não informada'}\nDICA ATUAL DO CLIENTE: ${currentHelp || 'Ainda não preenchida'}\nAPRENDIZADOS PRIVADOS RELEVANTES:\n${memory}\n\nResponda SOMENTE JSON válido: {"suggestions":["sugestão 1","sugestão 2","sugestão 3","sugestão 4"]}`;

  try {
    const raw = await groqResponse(app, prompt, { maxOutputTokens: 420 });
    const suggestions = parseSuggestions(raw);
    if (!suggestions.length) return NextResponse.json({ suggestions: [], interactionId: '' });

    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({
        app,
        tenantKey: access.accountId,
        userId: access.userId,
        functionName: 'personalizacao_dica',
        model: DEFAULT_GROQ_MODEL,
        contextSummary: `campo=${fieldKey}; nome=${label}; dica_atual=${currentHelp}; descricao=${description}`,
        suggestion: suggestions.join('\n'),
        metadata: { fieldKey, label, lessonsUsed: lessons.map(item => item.id) },
      });
    } catch {
      interactionId = '';
    }

    return NextResponse.json({ suggestions, interactionId });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível gerar sugestões agora.' }, { status: 502 });
  }
}
