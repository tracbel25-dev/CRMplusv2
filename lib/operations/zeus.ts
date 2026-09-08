import { Data, Job, Quote, Settings, localDay, total } from './model';

export const ZEUS_PREFS_ID = '__zeus_preferences';

export type ZeusPreferences = {
  budgetValidityDays: number;
  jobFilters: string[];
  quoteFilters: string[];
  dashboardFilters: string[];
};

export const ZEUS_JOB_FILTERS = ['Status', 'Etapa', 'Tipo', 'Responsável', 'Cliente'];
export const ZEUS_QUOTE_FILTERS = ['Origem', 'Status', 'Cliente', 'Validade'];
export const ZEUS_DASHBOARD_FILTERS = ['Status', 'Etapa', 'Tipo', 'Responsável'];

export function readZeusPreferences(data: Data): ZeusPreferences {
  const raw = data.customFieldValues?.[ZEUS_PREFS_ID] || {};
  const parseList = (value: string | undefined, fallback: string[]) => {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : fallback;
    } catch { return fallback; }
  };
  const days = Number(raw.budgetValidityDays || 7);
  return {
    budgetValidityDays: Number.isFinite(days) && days >= 1 && days <= 365 ? Math.round(days) : 7,
    jobFilters: parseList(raw.jobFilters, ZEUS_JOB_FILTERS),
    quoteFilters: parseList(raw.quoteFilters, ZEUS_QUOTE_FILTERS),
    dashboardFilters: parseList(raw.dashboardFilters, ZEUS_DASHBOARD_FILTERS)
  };
}

export function writeZeusPreferences(data: Data, preferences: ZeusPreferences) {
  data.customFieldValues ??= {};
  data.customFieldValues[ZEUS_PREFS_ID] = {
    budgetValidityDays: String(Math.max(1, Math.min(365, Math.round(preferences.budgetValidityDays || 7)))),
    jobFilters: JSON.stringify(preferences.jobFilters),
    quoteFilters: JSON.stringify(preferences.quoteFilters),
    dashboardFilters: JSON.stringify(preferences.dashboardFilters)
  };
}

export function defaultQuoteValidity(data: Data, from = new Date()) {
  const value = new Date(from);
  value.setDate(value.getDate() + readZeusPreferences(data).budgetValidityDays);
  return localDay(value);
}

export function initialJobStatus(settings: Settings) {
  if (settings.diagnosisEnabled) return 'Aguardando diagnóstico';
  if (settings.budgetEnabled) return 'Aguardando orçamento';
  return 'Aguardando execução';
}

export type ZeusBudgetRecord = {
  quote: Quote;
  origin: 'OS' | 'Balcão';
  job?: Job;
};

export function zeusBudgets(data: Data): ZeusBudgetRecord[] {
  const os = data.jobs
    .filter(job => job.quote.lines.length > 0 || job.stage === 'Orçamento' || job.quote.status !== 'Rascunho')
    .map(job => ({ quote: job.quote, origin: 'OS' as const, job }));
  const counter = data.quotes.map(quote => ({ quote, origin: 'Balcão' as const }));
  return [...os, ...counter];
}

export function findZeusBudget(data: Data, quoteId: string): ZeusBudgetRecord | undefined {
  const job = data.jobs.find(item => item.quote.id === quoteId);
  if (job) return { quote: job.quote, origin: 'OS', job };
  const quote = data.quotes.find(item => item.id === quoteId);
  return quote ? { quote, origin: 'Balcão' } : undefined;
}

export function budgetLabel(record: ZeusBudgetRecord) {
  return record.origin === 'OS'
    ? `Orçamento OS ${String(record.job?.number || record.quote.number).padStart(4, '0')}`
    : `Orçamento balcão ${String(record.quote.number).padStart(4, '0')}`;
}

export function budgetValue(record: ZeusBudgetRecord) {
  try { return total(record.quote.lines, record.quote.discount); } catch { return 0; }
}

export type LeadSegment = { stage: string; startedAt: string; endedAt: string; durationMs: number };
export type JobLeadTime = { job: Job; totalMs: number; finished: boolean; segments: LeadSegment[] };

function terminalAt(job: Job) {
  const terminal = [...job.events].reverse().find(item => /encerrad|cancelad|reprovad/i.test(item.text));
  return terminal?.at || '';
}

export function jobLeadTime(job: Job, reference = new Date()): JobLeadTime {
  const transitions = [...job.events]
    .filter(item => /^Etapa:\s*/i.test(item.text))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(item => ({ stage: item.text.replace(/^Etapa:\s*/i, '').trim(), at: item.at }));
  const terminal = terminalAt(job);
  const finished = !!terminal || ['Encerrado', 'Cancelado', 'Reprovado'].includes(job.status);
  const end = terminal || reference.toISOString();
  const points = [{ stage: 'Identificação', at: job.createdAt }, ...transitions];
  const segments = points.map((point, index) => {
    const endedAt = points[index + 1]?.at || end;
    return { stage: point.stage, startedAt: point.at, endedAt, durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(point.at).getTime()) };
  });
  return { job, totalMs: Math.max(0, new Date(end).getTime() - new Date(job.createdAt).getTime()), finished, segments };
}

export function formatLeadTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}min`;
  return `${mins}min`;
}
