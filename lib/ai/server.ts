import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readOperationalSupabaseConfig } from '@/lib/supabase/operationalConfig';
import type { ServerApp } from '@/lib/server/appAccess';

export type AIApp = ServerApp;
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

type LessonRow = {
  id: string;
  scope: 'tenant_private' | 'app_knowledge';
  lesson: string;
  context_summary: string;
  tags: string[];
  confidence: number;
  confirmations: number;
  rank?: number;
};

type InteractionInput = {
  app: AIApp;
  tenantKey: string;
  userId: string;
  functionName: string;
  model: string;
  contextSummary: string;
  suggestion: string;
  metadata?: Record<string, unknown>;
};

type LearningSensitivity = 'safe' | 'tenant_confidential' | 'commercial_sensitive' | 'personal_data' | 'secret';

type LearningDistillation = {
  should_learn: boolean;
  lesson: string;
  context_summary: string;
  tags: string[];
  confidence: number;
  sensitivity: LearningSensitivity;
  match_id: string | null;
  reason: string;
};

function env(name: string) {
  return process.env[name]?.trim() || '';
}

export function readGroqKey(app: AIApp) {
  const prefix = app === 'zeus' ? 'ZEUS' : 'ARTEMIS';
  const value = env(`${prefix}_GROQ_API_KEY`);
  if (!value) throw new Error(`A IA do ${app === 'zeus' ? 'Zeus' : 'Artemis'} ainda não foi configurada no servidor.`);
  return value;
}

export function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function operationalAIClient(app: AIApp): SupabaseClient {
  const config = readOperationalSupabaseConfig(app);
  if (!config.secretKey) {
    const prefix = app === 'zeus' ? 'ZEUS' : 'ARTEMIS';
    throw new Error(`${prefix}_SUPABASE_SECRET_KEY é necessária para a memória de IA server-side.`);
  }
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': `crmplus-${app}-ai` } },
  });
}

export async function ensureAITenant(app: AIApp, tenantKey: string) {
  const db = operationalAIClient(app);
  const { error } = await db.from('tenants').upsert({ tenant_key: tenantKey, updated_at: new Date().toISOString() }, { onConflict: 'tenant_key' });
  if (error) throw new Error(`Não foi possível preparar a memória do ${app}: ${error.message}`);
  return db;
}

export async function findRelevantLessons(app: AIApp, tenantKey: string, query: string, limit = 8): Promise<LessonRow[]> {
  const db = operationalAIClient(app);
  const { data, error } = await db.rpc('find_ai_lessons', {
    p_tenant_key: tenantKey,
    p_query: query.slice(0, 1200),
    p_limit: Math.max(1, Math.min(limit, 20)),
  });
  if (error) throw new Error(`Não foi possível consultar a memória do ${app}: ${error.message}`);
  return (data || []) as LessonRow[];
}

export async function recordAIInteraction(input: InteractionInput) {
  const db = await ensureAITenant(input.app, input.tenantKey);
  const inputFingerprint = fingerprint(`${input.functionName}\n${input.contextSummary}`);
  const { data, error } = await db.from('ai_interactions').insert({
    tenant_key: input.tenantKey,
    user_id: input.userId,
    function_name: input.functionName,
    model: input.model,
    input_fingerprint: inputFingerprint,
    context_summary: input.contextSummary.slice(0, 4000),
    suggestion: input.suggestion.slice(0, 12000),
    metadata: input.metadata || {},
  }).select('id').single();
  if (error) throw new Error(`Não foi possível registrar a interação de IA: ${error.message}`);
  return String(data.id);
}

export async function getAIInteraction(app: AIApp, tenantKey: string, interactionId: string) {
  const db = operationalAIClient(app);
  const { data, error } = await db.from('ai_interactions')
    .select('id,tenant_key,user_id,function_name,model,context_summary,suggestion,metadata,created_at')
    .eq('id', interactionId)
    .eq('tenant_key', tenantKey)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível consultar a interação de IA: ${error.message}`);
  return data as null | {
    id: string;
    tenant_key: string;
    user_id: string;
    function_name: string;
    model: string;
    context_summary: string;
    suggestion: string;
    metadata: Record<string, unknown>;
    created_at: string;
  };
}

export async function groqResponse(app: AIApp, prompt: string, options?: { maxOutputTokens?: number; temperature?: number }) {
  const response = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${readGroqKey(app)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_GROQ_MODEL,
      input: prompt,
      reasoning: { effort: 'low' },
      max_output_tokens: options?.maxOutputTokens ?? 600,
      ...(typeof options?.temperature === 'number' ? { temperature: options.temperature } : {}),
      store: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'A Groq não conseguiu responder agora.');

  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  const text = parts.join('\n').trim();
  if (!text) throw new Error('A Groq não retornou uma resposta utilizável.');
  return text;
}

function normalize(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function classifyLearningSensitivity(text: string): { sensitivity: LearningSensitivity; blocked: boolean; reason: string } {
  const raw = text || '';
  const value = normalize(raw);

  const secretPatterns = [
    /sb_secret_[a-z0-9_-]+/i,
    /service[_ -]?role/i,
    /secret[_ -]?access[_ -]?key/i,
    /api[_ -]?key/i,
    /\btoken\b/i,
    /\bsenha\b/i,
    /\bpassword\b/i,
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}/,
  ];
  if (secretPatterns.some(pattern => pattern.test(raw))) {
    return { sensitivity: 'secret', blocked: true, reason: 'Segredos e credenciais nunca entram na memória de IA.' };
  }

  const competitor = /(concorrente|competidor|outra oficina|outra empresa|empresa rival)/.test(value);
  const commercial = /(r\$|preco|valor|cobra|cobrou|cotacao|proposta|desconto|margem|orcamento)/.test(value);
  if (competitor && commercial) {
    return { sensitivity: 'commercial_sensitive', blocked: true, reason: 'Preço ou dado comercial de concorrente é apenas contexto da sessão e não vira aprendizado.' };
  }

  const hasEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw);
  const hasCpf = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(raw);
  const hasPhone = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/.test(raw);
  if (hasEmail || hasCpf || hasPhone) {
    return { sensitivity: 'personal_data', blocked: true, reason: 'Dados pessoais não entram na memória reutilizável.' };
  }

  return { sensitivity: 'safe', blocked: false, reason: '' };
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não retornou o aprendizado em formato válido.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function safeTags(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map(value => String(value).trim().toLocaleLowerCase('pt-BR')).filter(Boolean).slice(0, 12).map(value => value.slice(0, 60));
}

export async function distillLearningCandidate(app: AIApp, interaction: { context_summary: string; suggestion: string }, correctedText: string, candidates: LessonRow[]): Promise<LearningDistillation> {
  const candidateList = candidates.slice(0, 5).map(item => ({ id: item.id, lesson: item.lesson, context: item.context_summary, confirmations: item.confirmations }));
  const prompt = `Você é o mecanismo de memória operacional do CRM PLUS. Transforme uma correção humana em um aprendizado técnico reutilizável, sem transformar um caso isolado em verdade universal.\n\nREGRAS OBRIGATÓRIAS:\n- Nunca inclua nome de cliente, empresa, concorrente, pessoa, telefone, e-mail, CPF/CNPJ, placa, número de série ou identificador único.\n- Nunca inclua preço, valor, desconto, margem, proposta ou informação comercial de concorrente.\n- Nunca inclua senha, token, chave, credencial ou segredo.\n- Não invente causa, teste, medição, procedimento ou resultado.\n- Uma correção isolada deve virar orientação condicional: \"em casos semelhantes, considerar/verificar...\", não uma certeza.\n- O aprendizado desta etapa é privado da empresa. Não proponha compartilhamento global.\n- Se não houver um aprendizado técnico seguro e generalizável, marque should_learn=false.\n- Se um aprendizado existente abaixo representar essencialmente a mesma lição, devolva o id em match_id. Caso contrário use null.\n\nCONTEXTO DO CASO (privado):\n${interaction.context_summary.slice(0, 2500)}\n\nSUGESTÃO ORIGINAL:\n${interaction.suggestion.slice(0, 2500)}\n\nCORREÇÃO HUMANA:\n${correctedText.slice(0, 3500)}\n\nAPRENDIZADOS PRIVADOS PARECIDOS JÁ EXISTENTES:\n${JSON.stringify(candidateList)}\n\nResponda SOMENTE JSON válido neste formato:\n{\n  \"should_learn\": true,\n  \"lesson\": \"orientação técnica curta e condicional\",\n  \"context_summary\": \"contexto técnico genérico em que a lição é relevante\",\n  \"tags\": [\"termo1\", \"termo2\"],\n  \"confidence\": 0.55,\n  \"sensitivity\": \"safe\",\n  \"match_id\": null,\n  \"reason\": \"motivo curto\"\n}`;

  const raw = await groqResponse(app, prompt, { maxOutputTokens: 500 });
  const parsed = parseJsonObject(raw) as Partial<LearningDistillation>;
  const allowedSensitivity: LearningSensitivity[] = ['safe', 'tenant_confidential', 'commercial_sensitive', 'personal_data', 'secret'];
  const confidence = Number(parsed.confidence);
  const matchId = typeof parsed.match_id === 'string' && candidateList.some(item => item.id === parsed.match_id) ? parsed.match_id : null;

  return {
    should_learn: parsed.should_learn === true,
    lesson: String(parsed.lesson || '').trim().slice(0, 1800),
    context_summary: String(parsed.context_summary || '').trim().slice(0, 1800),
    tags: safeTags(parsed.tags),
    confidence: Number.isFinite(confidence) ? Math.max(0.35, Math.min(confidence, 0.75)) : 0.55,
    sensitivity: allowedSensitivity.includes(parsed.sensitivity as LearningSensitivity) ? parsed.sensitivity as LearningSensitivity : 'tenant_confidential',
    match_id: matchId,
    reason: String(parsed.reason || '').trim().slice(0, 500),
  };
}

export async function persistLearningFeedback(input: {
  app: AIApp;
  tenantKey: string;
  userId: string;
  interactionId: string;
  correctedText: string;
}) {
  const db = await ensureAITenant(input.app, input.tenantKey);
  const interaction = await getAIInteraction(input.app, input.tenantKey, input.interactionId);
  if (!interaction) throw new Error('Interação de IA não encontrada para esta empresa.');

  const sensitivity = classifyLearningSensitivity(input.correctedText);
  if (sensitivity.blocked) {
    const { error } = await db.from('ai_feedback').insert({
      tenant_key: input.tenantKey,
      interaction_id: input.interactionId,
      user_id: input.userId,
      rating: -1,
      correction_text: '',
      correction_summary: sensitivity.reason,
      approved_for_learning: false,
      retention_scope: 'session_only',
      sensitivity: sensitivity.sensitivity,
    });
    if (error) throw new Error(`Não foi possível registrar o feedback protegido: ${error.message}`);
    return { learned: false, reason: sensitivity.reason, sensitivity: sensitivity.sensitivity };
  }

  const candidates = await findRelevantLessons(input.app, input.tenantKey, `${interaction.context_summary} ${input.correctedText}`, 5).catch(() => []);
  const distilled = await distillLearningCandidate(input.app, interaction, input.correctedText, candidates);

  if (!distilled.should_learn || distilled.sensitivity !== 'safe' || !distilled.lesson) {
    const { error } = await db.from('ai_feedback').insert({
      tenant_key: input.tenantKey,
      interaction_id: input.interactionId,
      user_id: input.userId,
      rating: -1,
      correction_text: input.correctedText.slice(0, 12000),
      correction_summary: distilled.reason || 'Correção registrada, mas sem lição reutilizável segura.',
      approved_for_learning: false,
      retention_scope: 'tenant_private',
      sensitivity: distilled.sensitivity,
    });
    if (error) throw new Error(`Não foi possível registrar o feedback: ${error.message}`);
    return { learned: false, reason: distilled.reason || 'A correção foi registrada, mas não virou uma regra reutilizável.', sensitivity: distilled.sensitivity };
  }

  const { data: feedback, error: feedbackError } = await db.from('ai_feedback').insert({
    tenant_key: input.tenantKey,
    interaction_id: input.interactionId,
    user_id: input.userId,
    rating: -1,
    correction_text: input.correctedText.slice(0, 12000),
    correction_summary: distilled.context_summary,
    approved_for_learning: true,
    retention_scope: 'tenant_private',
    sensitivity: 'safe',
  }).select('id').single();
  if (feedbackError) throw new Error(`Não foi possível registrar o feedback: ${feedbackError.message}`);

  if (distilled.match_id) {
    const existing = candidates.find(item => item.id === distilled.match_id);
    if (existing) {
      const confirmations = existing.confirmations + 1;
      const confidence = Math.min(0.95, Math.max(Number(existing.confidence) || 0.55, distilled.confidence) + 0.05);
      const { error } = await db.from('ai_lessons').update({
        confirmations,
        confidence,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id).eq('tenant_key', input.tenantKey);
      if (error) throw new Error(`Não foi possível reforçar o aprendizado existente: ${error.message}`);
      return { learned: true, reinforced: true, lessonId: existing.id, confirmations, confidence };
    }
  }

  const { data: lesson, error: lessonError } = await db.from('ai_lessons').insert({
    tenant_key: input.tenantKey,
    scope: 'tenant_private',
    lesson: distilled.lesson,
    context_summary: distilled.context_summary,
    tags: distilled.tags,
    source_feedback_id: feedback.id,
    confidence: distilled.confidence,
    confirmations: 1,
    status: 'active',
  }).select('id,confidence,confirmations').single();
  if (lessonError) throw new Error(`Não foi possível guardar o aprendizado: ${lessonError.message}`);

  return { learned: true, reinforced: false, lessonId: String(lesson.id), confirmations: lesson.confirmations, confidence: Number(lesson.confidence) };
}

export function lessonsForPrompt(lessons: LessonRow[]) {
  if (!lessons.length) return 'Nenhum aprendizado anterior relevante encontrado.';
  return lessons.slice(0, 8).map((item, index) => {
    const origin = item.scope === 'tenant_private' ? 'memória privada desta empresa' : 'conhecimento aprovado do aplicativo';
    return `${index + 1}. [${origin}; confiança ${Number(item.confidence).toFixed(2)}; confirmações ${item.confirmations}] ${item.lesson} Contexto: ${item.context_summary}`;
  }).join('\n');
}
