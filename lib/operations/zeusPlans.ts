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
  commercialFeatures: readonly string[];
  features: ReadonlySet<ZeusFeature>;
};

const START: ZeusFeature[] = ['core_os','customers','assets','history','service_types','responsible','deadlines','status_stages','tasks','notes','related_jobs','basic_filters','ai'];
const ESSENCIAL: ZeusFeature[] = [...START,'scheduling','checklist','diagnosis','budgets','quote_external_approval'];
const PLUS: ZeusFeature[] = [...ESSENCIAL,'billing','dashboard','advanced_filters','export','team_management','granular_permissions'];
const PREMIUM: ZeusFeature[] = [...PLUS,'full_operational_settings'];

const START_COMMERCIAL = [
  'Abertura de OS',
  'Atendimentos',
  'Clientes',
  'Veículos e equipamentos',
  'Histórico de OS',
  'Histórico por cliente e veículo/equipamento',
  'Tipos de atendimento',
  'Responsável',
  'Prazos',
  'Status e etapas da OS',
  'Tarefas da execução',
  'Observações',
  'Retorno e garantia vinculados a OS anterior',
  'Busca e filtros básicos',
  'IA/Groq nas funções disponíveis do plano',
] as const;

const ESSENCIAL_ADDITIONAL = [
  'Agendamentos',
  'Agenda diária',
  'Agenda semanal',
  'Reagendamento',
  'Checklist de entrada',
  'Modelos de checklist',
  'Personalização dos itens do checklist',
  'Assinatura no checklist',
  'Diagnóstico',
  'Orçamento dentro da OS',
  'Orçamento de balcão',
  'Serviços e peças no orçamento',
  'Quantidade, marca e valor dos itens',
  'Desconto',
  'Validade do orçamento',
  'Versionamento de orçamento',
  'Histórico das versões',
  'PDF do orçamento',
  'Compartilhamento do orçamento',
  'Compartilhamento por WhatsApp',
  'Link externo para cliente aprovar ou reprovar orçamento',
] as const;

const PLUS_ADDITIONAL = [
  'Faturamento',
  'OS pendentes de recebimento',
  'Pagamentos recebidos',
  'Baixa manual',
  'Situação Pendente / Pago / Baixado / Cancelado',
  'Formas de pagamento',
  'Cobrança',
  'Dashboard gerencial',
  'Quantidade de OS',
  'OS abertas e encerradas',
  'Lead time',
  'Lead time médio',
  'Tempo por etapa',
  'OS atrasadas',
  'OS vencendo hoje',
  'Distribuição por status',
  'Valores pendentes',
  'Valores recebidos',
  'Filtros avançados',
  'Exportação de dados',
  'Gestão da equipe',
  'Controle de permissões por usuário',
] as const;

const PREMIUM_ADDITIONAL = [
  'Até 10 acessos',
  'Gestão completa de usuários',
  'Permissões individuais por usuário',
  'Configurações operacionais completas',
] as const;

const START_COMMERCIAL_FULL = [...START_COMMERCIAL];
const ESSENCIAL_COMMERCIAL_FULL = [...START_COMMERCIAL, ...ESSENCIAL_ADDITIONAL];
const PLUS_COMMERCIAL_FULL = [...START_COMMERCIAL, ...ESSENCIAL_ADDITIONAL, ...PLUS_ADDITIONAL];
const PREMIUM_COMMERCIAL_FULL = [...START_COMMERCIAL, ...ESSENCIAL_ADDITIONAL, ...PLUS_ADDITIONAL, ...PREMIUM_ADDITIONAL];

export const ZEUS_PLANS: Record<ZeusPlanCode, ZeusPlanDefinition> = {
  start: {
    code:'start',
    name:'Zeus Start',
    rank:0,
    seats:1,
    summary:'Controle essencial da oficina e das ordens de serviço.',
    highlights:['Ordens de serviço','Clientes e veículos','IA/Groq'],
    commercialFeatures:START_COMMERCIAL_FULL,
    features:new Set(START),
  },
  essencial: {
    code:'essencial',
    name:'Zeus Essencial',
    rank:1,
    seats:2,
    summary:'Operação completa da OS, da agenda ao orçamento.',
    highlights:['Agenda e checklist','Diagnóstico e orçamentos','2 acessos'],
    commercialFeatures:ESSENCIAL_COMMERCIAL_FULL,
    features:new Set(ESSENCIAL),
  },
  plus: {
    code:'plus',
    name:'Zeus Plus',
    rank:2,
    seats:4,
    recommended:true,
    summary:'Gestão da oficina com faturamento, indicadores e equipe.',
    highlights:['Faturamento e dashboard','Equipe e permissões','4 acessos'],
    commercialFeatures:PLUS_COMMERCIAL_FULL,
    features:new Set(PLUS),
  },
  premium: {
    code:'premium',
    name:'Zeus Premium',
    rank:3,
    seats:10,
    summary:'Operação máxima do Zeus para equipes maiores.',
    highlights:['10 acessos','Gestão completa de usuários','Configurações completas'],
    commercialFeatures:PREMIUM_COMMERCIAL_FULL,
    features:new Set(PREMIUM),
  },
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
  start: [...START_COMMERCIAL_FULL],
  essencial: [...ESSENCIAL_COMMERCIAL_FULL],
  plus: [...PLUS_COMMERCIAL_FULL],
  premium: [...PREMIUM_COMMERCIAL_FULL],
};
