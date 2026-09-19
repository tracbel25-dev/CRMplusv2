import type { Data, Job } from '@/lib/operations/model';
import { zeusChecklistState } from '@/lib/operations/zeusChecklist';
import { zeusHasFeature, type ZeusPlanCode } from '@/lib/operations/zeusPlans';

const stable = (value: unknown) => JSON.stringify(value ?? null);
const jobQuote = (job: Job) => job.quote;

export function validateZeusPlanTransition(current: Data | null, next: Data, plan: ZeusPlanCode) {
  if (!zeusHasFeature(plan, 'scheduling') && (!current ? next.appointments.length > 0 : stable(current.appointments) !== stable(next.appointments))) {
    throw new Error('PLAN_FEATURE_REQUIRED: agendamentos');
  }

  if (!zeusHasFeature(plan, 'budgets')) {
    if (!current ? next.quotes.length > 0 : stable(current.quotes) !== stable(next.quotes)) throw new Error('PLAN_FEATURE_REQUIRED: orçamentos');
    const before = new Map((current?.jobs || []).map(job => [job.id, job]));
    for (const job of next.jobs) {
      const previous = before.get(job.id);
      if (previous && stable(jobQuote(previous)) !== stable(jobQuote(job))) throw new Error('PLAN_FEATURE_REQUIRED: orçamentos');
      if (!previous && (job.quote.lines.length > 0 || job.quote.status !== 'Rascunho' || job.quote.versions.length > 0 || job.quote.discount > 0)) {
        throw new Error('PLAN_FEATURE_REQUIRED: orçamentos');
      }
    }
  }

  if (!zeusHasFeature(plan, 'diagnosis')) {
    const before = new Map((current?.jobs || []).map(job => [job.id, job]));
    for (const job of next.jobs) {
      const previous = before.get(job.id);
      if (!previous && (job.diagnosis.trim() || job.stage === 'Diagnóstico')) throw new Error('PLAN_FEATURE_REQUIRED: diagnóstico');
      if (!previous) continue;
      if (previous.diagnosis !== job.diagnosis || (previous.stage !== job.stage && job.stage === 'Diagnóstico')) {
        throw new Error('PLAN_FEATURE_REQUIRED: diagnóstico');
      }
    }
  }

  if (!zeusHasFeature(plan, 'checklist')) {
    const ids = new Set([...(current?.jobs || []).map(job => job.id), ...next.jobs.map(job => job.id)]);
    for (const id of ids) {
      if (!current) {
        if (zeusChecklistState(next, id).enabled) throw new Error('PLAN_FEATURE_REQUIRED: checklist');
        continue;
      }
      if (stable(zeusChecklistState(current, id)) !== stable(zeusChecklistState(next, id))) {
        throw new Error('PLAN_FEATURE_REQUIRED: checklist');
      }
    }
  }

  if (!zeusHasFeature(plan, 'full_operational_settings') &&
      stable(current?.settings.operationPreferences) !== stable(next.settings.operationPreferences)) {
    throw new Error('PLAN_FEATURE_REQUIRED: configurações operacionais completas');
  }
}
