export type ZeusPlanCode = 'start' | 'essencial' | 'plus' | 'premium';

export type ZeusFeature =
  | 'core_os' | 'customers' | 'assets' | 'history' | 'service_types' | 'responsible' | 'deadlines'
  | 'status_stages' | 'tasks' | 'notes' | 'related_jobs' | 'basic_filters' | 'ai'
  | 'scheduling' | 'checklist' | 'diagnosis' | 'budgets' | 'quote_external_approval'
  | 'billing' | 'dashboard' | 'advanced_filters' | 'export' | 'team_management' | 'granular_permissions'
  | 'full_operational_settings';

export type ZeusPlanDefinition = {
  code: ZeusPlanCode;
  name: string;
  rank: number;
  seats: number;
  recommended?: boolean;
  summary: string;
  highlights: string[];
  features: ReadonlySet<ZeusFeature>;
};

const START: ZeusFeature[] = ['core_os','customers','assets','history','service_types','responsible','deadlines','status_stages','tasks','notes','related_jobs','basic_filters','ai'];
const ESSENCIAL: ZeusFeature[] = [...START,'scheduling','checklist','diagnosis','budgets','quote_external_approval'];
const PLUS: ZeusFeature[] = [...ESSENCIAL,'billing','dashboard','advanced_filters','export','team_management','granular_permissions'];
const PREMIUM: ZeusFeature[] = [...PLUS,'full_operational_settings'];

export const ZEUS_PLANS: Record<ZeusPlanCode, ZeusPlanDefinition> = {
  start: { code:'start', name:'Zeus Start', rank:0, seats:1, summary:'Controle essencial da oficina e das ordens de serviço.', highlights:['Ordens de serviço','Clientes e veículos','IA/Groq'], features:new Set(START) },
  essencial: { code:'essencial', name:'Zeus Essencial', rank:1, seats:2, summary:'Operação completa da OS, da agenda ao orçamento.', highlights:['Tudo do Start','Agenda e checklist','Diagnóstico e orçamentos'], features:new Set(ESSENCIAL) },
  plus: { code:'plus', name:'Zeus Plus', rank:2, seats:4, recommended:true, summary:'Gestão da oficina com faturamento, indicadores e equipe.', highlights:['Tudo do Essencial','Faturamento e dashboard','Equipe e permissões'], features:new Set(PLUS) },
  premium: { code:'premium', name:'Zeus Premium', rank:3, seats:10, summary:'Operação máxima do Zeus para equipes maiores.', highlights:['Tudo do Plus','Até 10 acessos','Configurações completas'], features:new Set(PREMIUM) },
};

export function normalizeZeusPlan(value: unknown): ZeusPlanCode {
  const code = String(value || '').toLowerCase();
  return code === 'essencial' || code === 'plus' || code === 'premium' ? code : 'start';
}

export function zeusPlan(code: unknown) { return ZEUS_PLANS[normalizeZeusPlan(code)]; }
export function zeusHasFeature(code: unknown, feature: ZeusFeature) { return zeusPlan(code).features.has(feature); }

export const ZEUS_PAGE_FEATURE: Record<string, ZeusFeature | undefined> = {
  inicio: 'core_os', atendimentos:'core_os', historico:'history', clientes:'customers',
  agendamentos:'scheduling', checklist:'checklist', orcamentos:'budgets', faturamento:'billing', dashboard:'dashboard'
};

export const ZEUS_MODULES_BY_PLAN: Record<ZeusPlanCode, string[]> = {
  start: ['Atendimentos','Clientes e veículos/equipamentos','Histórico de OS','IA/Groq'],
  essencial: ['Tudo do Start','Agendamentos','Checklist','Diagnóstico','Orçamentos','IA/Groq'],
  plus: ['Tudo do Essencial','Faturamento','Dashboard gerencial','Equipe e permissões','Exportação','IA/Groq'],
  premium: ['Tudo do Plus','Configurações operacionais completas','Todos os módulos do Zeus','IA/Groq'],
};
