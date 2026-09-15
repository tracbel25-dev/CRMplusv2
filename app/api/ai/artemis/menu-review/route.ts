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

type MenuReviewProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  allergens: string;
  preparation: number;
  variantNames: string[];
};

type MenuReviewSuggestion = {
  kind: string;
  title: string;
  reason: string;
  productId: string;
  productIds: string[];
  suggestedCategory: string;
  variantNames: string[];
};

const allowedKinds = new Set<string>(['variants', 'category', 'completion', 'organization']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max = 500) {
  return String(value ?? '')
    .replace(/R\$\s?\d[\d.,]*/gi, '[valor manual]')
    .replace(/\b\d+[.,]\d{2}\s*(reais|real)?\b/gi, '[valor manual]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanVariantNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set<string>(value
    .slice(0, 8)
    .map((item: unknown) => cleanText(item, 50))
    .filter((item: string) => item.length > 0 && !/R\$|pre[cç]o\s*[:=]?\s*\d|valor\s*[:=]?\s*\d/i.test(item))))
    .slice(0, 6);
}

function parseResult(raw: string, validProducts: Set<string>) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou uma revisão válida.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { summary?: unknown; suggestions?: unknown[] };
  const source: unknown[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const suggestions: MenuReviewSuggestion[] = source.slice(0, 8).flatMap((item: unknown): MenuReviewSuggestion[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const kind = cleanText(row.kind, 30);
    if (!allowedKinds.has(kind)) return [];
    const candidateProductId = cleanText(row.productId, 64);
    const productId = uuidPattern.test(candidateProductId) && validProducts.has(candidateProductId) ? candidateProductId : '';
    const productIds = Array.isArray(row.productIds)
      ? row.productIds
        .map((value: unknown) => cleanText(value, 64))
        .filter((value: string) => uuidPattern.test(value) && validProducts.has(value))
        .slice(0, 30)
      : [];
    const suggestedCategory = cleanText(row.suggestedCategory, 90);
    const variantNames = cleanVariantNames(row.variantNames);
    const title = cleanText(row.title, 140);
    const reason = cleanText(row.reason, 500);
    if (!title || !reason) return [];
    if (kind === 'variants' && (!productId || !variantNames.length)) return [];
    if (kind === 'category' && (!suggestedCategory || (!productId && !productIds.length))) return [];
    if ((kind === 'completion' || kind === 'organization') && !productId && !productIds.length && !suggestedCategory) return [];
    return [{ kind, title, reason, productId, productIds, suggestedCategory, variantNames }];
  });
  return { summary: cleanText(parsed.summary, 700), suggestions };
}

export async function POST(request: NextRequest) {
  const access = await authorizeAppRequest(request, 'artemis');
  if (!access) return NextResponse.json({ error: 'Entre com a conta do restaurante para revisar o cardápio.' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rawProducts: unknown[] = Array.isArray(body.products) ? (body.products as unknown[]).slice(0, 220) : [];
  const products: MenuReviewProduct[] = rawProducts.flatMap((item: unknown): MenuReviewProduct[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const id = cleanText(row.id, 64);
    if (!uuidPattern.test(id)) return [];
    return [{
      id,
      name: cleanText(row.name, 140),
      category: cleanText(row.category, 100),
      description: cleanText(row.description, 700),
      allergens: cleanText(row.allergens, 700),
      preparation: Math.max(0, Math.min(1440, Math.round(Number(row.preparation) || 0))),
      variantNames: cleanVariantNames(row.variantNames),
    }];
  }).filter((item: MenuReviewProduct) => item.name.length > 0 && item.category.length > 0);

  if (!products.length) return NextResponse.json({ error: 'Cadastre ao menos um produto antes de revisar o cardápio.' }, { status: 400 });

  const validProducts = new Set<string>(products.map((item: MenuReviewProduct) => item.id));
  const categories = Array.from(new Set<string>(products.map((item: MenuReviewProduct) => item.category))).slice(0, 80);
  const query = `${products.slice(0, 30).map((item: MenuReviewProduct) => `${item.name} ${item.category}`).join(' ')} ${categories.join(' ')}`.slice(0, 3000);
  const lessons = await findRelevantLessons('artemis', access.accountId, query || 'organização do cardápio', 8).catch(() => []);
  const memory = lessonsForPrompt(lessons);

  const prompt = `Você revisa o cardápio de UM restaurante e sugere melhorias práticas usando somente o cadastro recebido e aprendizados privados desta mesma conta.

OBJETIVO:
- encontrar produtos que provavelmente precisam de opções/variações (ex.: pizza sem tamanho, suco sem volume, porção sem tamanho), sem presumir que toda operação trabalha assim;
- identificar categorias mal organizadas, duplicadas, vagas ou que poderiam ser segmentadas;
- apontar produtos incompletos (descrição, preparo ou informação importante ausente) quando isso realmente ajudar o cliente;
- sugerir organização simples, sem transformar o Artemis em ERP.

REGRAS ABSOLUTAS:
- NÃO sugira preço, valor, custo, margem, desconto ou qualquer número monetário.
- Para variações, sugira apenas NOMES de opções (ex.: Pequena, Média, Grande). O restaurante preencherá os preços manualmente.
- Não invente que o restaurante vende uma opção, marca, ingrediente ou tamanho. Trate como sugestão para confirmação.
- Não misture aprendizados de outros restaurantes.
- Não inclua CPF, CNPJ, telefone, e-mail ou identificadores de pessoas.
- Faça no máximo 8 sugestões úteis e evite redundância.
- Quando sugerir reorganização de categoria, use productId/productIds existentes e suggestedCategory.
- Quando sugerir variações, use kind="variants", productId e variantNames.
- Para completar cadastro, use kind="completion" e productId.
- Para organização geral, use kind="organization".

PRODUTOS (SEM PREÇOS):
${JSON.stringify(products)}

CATEGORIAS ATUAIS:
${JSON.stringify(categories)}

APRENDIZADOS PRIVADOS DESTA CONTA:
${memory}

Responda SOMENTE JSON válido neste formato:
{"summary":"resumo curto","suggestions":[{"kind":"variants|category|completion|organization","title":"...","reason":"...","productId":"uuid opcional","productIds":["uuid"],"suggestedCategory":"opcional","variantNames":["opcional"]}]}`;

  try {
    const raw = await groqResponse('artemis', prompt, { maxOutputTokens: 1100 });
    const result = parseResult(raw, validProducts);
    let interactionId = '';
    try {
      interactionId = await recordAIInteraction({
        app: 'artemis',
        tenantKey: access.accountId,
        userId: access.userId,
        functionName: 'revisao_cardapio',
        model: DEFAULT_GROQ_MODEL,
        contextSummary: products.slice(0, 40).map((item: MenuReviewProduct) => `${item.name} · ${item.category}`).join(' | ').slice(0, 4000),
        suggestion: [result.summary, ...result.suggestions.map((item: MenuReviewSuggestion) => `${item.kind}: ${item.title} — ${item.reason}`)].filter(Boolean).join('\n').slice(0, 7000),
        metadata: { suggestions: result.suggestions.length, lessonsUsed: lessons.map(item => item.id), commercialValuesBlocked: true },
      });
    } catch {
      interactionId = '';
    }
    return NextResponse.json({ ...result, interactionId, model: DEFAULT_GROQ_MODEL, memory: { lessonsUsed: lessons.length } });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : 'Não foi possível revisar o cardápio agora.' }, { status: 502 });
  }
}
