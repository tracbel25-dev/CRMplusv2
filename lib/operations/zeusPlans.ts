export type ZeusPlanCode = 'start' | 'essencial' | 'plus' | 'premium';

export type ZeusFeature =
  | 'core_os' | 'customers' | 'assets' | 'history' | 'service_types' | 'responsible' | 'deadlines'
  | 'status_stages' | 'tasks' | 'notes' | 'related_jobs' | 'ai' | 'payments'
  | 'scheduling' | 'checklist' | 'diagnosis' | 'budgets' | 'quote_external_approval'
  | 'billing' | 'dashboard' | 'export' | 'team_management' | 'granular_permissions';

export const ZEUS_FEATURES: ZeusFeature[] = [
  'core_os','customers','assets','history','service_types','responsible','deadlines',
  'status_stages','tasks','notes','related_jobs','ai','payments',
  'scheduling','checklist','diagnosis','budgets','quote_external_approval',
  'billing','dashboard','export','team_management','granular_permissions'
];

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

const START: ZeusFeature[] = [
  'core_os','customers','assets','history','service_types','responsible','deadlines',
  'status_stages','tasks','notes','related_jobs','payments'
];
const ESSENCIAL: ZeusFeature[] = [...START,'ai','scheduling','checklist','diagnosis','budgets','quote_external_approval','team_management'];
const PLUS: ZeusFeature[] = [...ESSENCIAL,'billing','dashboard','export','granular_permissions'];
const PREMIUM: ZeusFeature[] = [...PLUS];

const START_COMMERCIAL = [
  'Abertura e gestão de OS',
  'Atendimentos e histórico',
  'Clientes',
  'Veículos, equipamentos e item atendido',
  'Tipos de atendimento',
  'Prazos, status e etapas da OS',
  'Tarefas da execução e observações',
  'Retorno e garantia vinculados a OS anterior',
  'Busca, filtros e ordenação',
  'Personalização de campos, nomes, dicas e fluxo',
  'Campos personalizados',
  'Pagamentos e cobranças pelo Mercado Pago',
  'Fotos nos atendimentos',
] as const;

const ESSENCIAL_ADDITIONAL = [
  'Agendamentos',
  'Agenda diária e semanal',
  'Reagendamento',
  'Checklist de entrada',
  'Modelos e personalização do checklist',
  'Assinatura no checklist',
  'Diagnóstico',
  'Sugestões de inteligência artificial',
  'Orçamento dentro da OS',
  'Orçamento de balcão',
  'Serviços e peças no orçamento',
  'Quantidade, marca e valor dos itens',
  'Desconto e validade do orçamento',
  'Versionamento e histórico das versões',
  'PDF e compartilhamento do orçamento',
  'Compartilhamento por WhatsApp',
  'Link externo para cliente aprovar ou reprovar orçamento',
  'Gestão básica da equipe',
] as const;

const PLUS_ADDITIONAL = [
  'Faturamento gerencial',
  'OS pendentes de recebimento',
  'Pagamentos recebidos e baixa manual',
  'Situação Pendente / Pago / Baixado / Cancelado',
  'Dashboard gerencial',
  'Quantidade de OS',
  'OS abertas e encerradas',
  'Lead time e tempo por etapa',
  'OS atrasadas e vencendo hoje',
  'Distribuição por status',
  'Valores pendentes e recebidos',
  'Exportação de dados',
  'Permissões individuais por usuário',
  'Perfis de acesso personalizados',
] as const;

const PREMIUM_ADDITIONAL = [
  'Até 10 acessos',
  'Mesmos recursos do Plus para uma equipe maior',
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
    summary:'OS simples e pronta para o pequeno empreendedor começar sem configurar tudo do zero.',
    highlights:['OS pronta para usar','Personalização e filtros','Pagamentos','Fotos nos atendimentos'],
    commercialFeatures:START_COMMERCIAL_FULL,
    features:new Set(START),
  },
  essencial: {
    code:'essencial',
    name:'Zeus Essencial',
    rank:1,
    seats:2,
    summary:'Operação completa da OS, da agenda ao orçamento.',
    highlights:['Agenda e checklist','Diagnóstico, IA e orçamentos','2 acessos','Fotos nos atendimentos'],
    commercialFeatures:ESSENCIAL_COMMERCIAL_FULL,
    features:new Set(ESSENCIAL),
  },
  plus: {
    code:'plus',
    name:'Zeus Plus',
    rank:2,
    seats:4,
    recommended:true,
    summary:'Gestão da oficina com faturamento, indicadores e controle de equipe.',
    highlights:['Faturamento e dashboard','Permissões individuais','4 acessos','Fotos nos atendimentos'],
    commercialFeatures:PLUS_COMMERCIAL_FULL,
    features:new Set(PLUS),
  },
  premium: {
    code:'premium',
    name:'Zeus Premium',
    rank:3,
    seats:10,
    summary:'Todos os recursos do Plus com capacidade para uma equipe maior.',
    highlights:['10 acessos','Todos os recursos do Plus','Escala para equipe maior','Fotos nos atendimentos'],
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

export function zeusViewHasFeature(settings: { planCode?: unknown; planFeatures?: Record<string, boolean> } | null | undefined, feature: ZeusFeature) {
  const flags = settings?.planFeatures;
  if (flags && typeof flags[feature] === 'boolean') return flags[feature];
  return zeusHasFeature(settings?.planCode || 'start', feature);
}
