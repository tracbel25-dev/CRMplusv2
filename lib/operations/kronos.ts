import type { Data, Deal } from './model';
import { event, normalize, now, syncDealNextActivity, uid } from './model';

export type KronosMotion = 'Ativa' | 'Reativa' | '';
export type KronosTemperature = 'Fria' | 'Morna' | 'Quente' | '';
export type KronosQuoteStatus = 'Sem cotação' | 'Em elaboração' | 'Enviada' | 'Aprovada' | 'Reprovada';
export type KronosVisitKind = 'Visita' | 'Ligação' | 'Reunião' | 'Demonstração';
export type KronosVisitStatus = 'Planejada' | 'Realizada' | 'Cancelada';

export type KronosDealMeta = {
  motion: KronosMotion;
  temperature: KronosTemperature;
  quoteStatus: KronosQuoteStatus;
  quoteValue: number;
  lastContactAt: string;
  lastOutcome: string;
};

export type KronosVisit = {
  id: string;
  customerId: string;
  dealId: string;
  kind: KronosVisitKind;
  at: string;
  offering: string;
  objective: string;
  quoteStatus: KronosQuoteStatus;
  quoteValue: number;
  notes: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: KronosVisitStatus;
  result: string;
  followUp: string;
  followUpAt: string;
  followUpDone: boolean;
  createdAt: string;
};

const VISITS_RECORD = '__kronos_visits__';
const META_KEYS = {
  motion: '__kronos_motion',
  temperature: '__kronos_temperature',
  quoteStatus: '__kronos_quote_status',
  quoteValue: '__kronos_quote_value',
  lastContactAt: '__kronos_last_contact_at',
  lastOutcome: '__kronos_last_outcome'
} as const;

const quoteStatuses: KronosQuoteStatus[] = ['Sem cotação', 'Em elaboração', 'Enviada', 'Aprovada', 'Reprovada'];
const motions: KronosMotion[] = ['', 'Ativa', 'Reativa'];
const temperatures: KronosTemperature[] = ['', 'Fria', 'Morna', 'Quente'];
const visitKinds: KronosVisitKind[] = ['Visita', 'Ligação', 'Reunião', 'Demonstração'];
const visitStatuses: KronosVisitStatus[] = ['Planejada', 'Realizada', 'Cancelada'];

const asEnum = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const coordinate = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const visitTaskId = (visitId: string) => `kronos-visit:${visitId}`;

function proposalStageIndex(data: Data) {
  return data.settings.salesStages.findIndex(stage => {
    const key = normalize(stage);
    return key.includes('proposta') || key.includes('orcamento') || key.includes('cotacao');
  });
}

function alignDealStageWithQuote(data: Data, dealId: string, quoteStatus: KronosQuoteStatus) {
  if (!['Em elaboração', 'Enviada', 'Aprovada'].includes(quoteStatus)) return;
  const deal = data.deals.find(item => item.id === dealId);
  if (!deal || isClosedDeal(deal)) return;
  const targetIndex = proposalStageIndex(data);
  const currentIndex = data.settings.salesStages.indexOf(deal.stage);
  if (targetIndex < 0 || currentIndex < 0 || currentIndex >= targetIndex) return;
  deal.stage = data.settings.salesStages[targetIndex];
  deal.events.push(event(`Momento atualizado automaticamente para ${deal.stage} após avanço da cotação`));
}

function syncVisitTask(data: Data, visit: KronosVisit, previousDealId = '') {
  const taskId = visitTaskId(visit.id);
  const existing = data.tasks.find(task => task.id === taskId);

  if (previousDealId && previousDealId !== visit.dealId) {
    if (existing) existing.done = true;
    syncDealNextActivity(data, previousDealId);
  }

  if (!visit.dealId) return;

  const title = `${visit.kind}${visit.objective ? `: ${visit.objective}` : visit.offering ? `: ${visit.offering}` : ''}`;
  if (visit.status === 'Planejada') {
    if (existing) {
      existing.dealId = visit.dealId;
      existing.title = title;
      existing.due = visit.at;
      existing.done = false;
    } else {
      data.tasks.push({ id: taskId, dealId: visit.dealId, title, due: visit.at, done: false });
    }
  } else if (existing) {
    existing.done = true;
  }
  syncDealNextActivity(data, visit.dealId);
}

export function getKronosDealMeta(data: Data, dealId: string): KronosDealMeta {
  const values = data.customFieldValues?.[dealId] || {};
  return {
    motion: asEnum(values[META_KEYS.motion], motions, ''),
    temperature: asEnum(values[META_KEYS.temperature], temperatures, ''),
    quoteStatus: asEnum(values[META_KEYS.quoteStatus], quoteStatuses, 'Sem cotação'),
    quoteValue: Math.max(0, Math.round(finite(values[META_KEYS.quoteValue]))),
    lastContactAt: values[META_KEYS.lastContactAt] || '',
    lastOutcome: values[META_KEYS.lastOutcome] || ''
  };
}

export function setKronosDealMeta(data: Data, dealId: string, patch: Partial<KronosDealMeta>) {
  data.customFieldValues ??= {};
  const values = { ...(data.customFieldValues[dealId] || {}) };
  if (patch.motion !== undefined) values[META_KEYS.motion] = patch.motion;
  if (patch.temperature !== undefined) values[META_KEYS.temperature] = patch.temperature;
  if (patch.quoteStatus !== undefined) values[META_KEYS.quoteStatus] = patch.quoteStatus;
  if (patch.quoteValue !== undefined) values[META_KEYS.quoteValue] = String(Math.max(0, Math.round(patch.quoteValue)));
  if (patch.lastContactAt !== undefined) values[META_KEYS.lastContactAt] = patch.lastContactAt;
  if (patch.lastOutcome !== undefined) values[META_KEYS.lastOutcome] = patch.lastOutcome;
  data.customFieldValues[dealId] = values;
  if (patch.quoteStatus !== undefined) alignDealStageWithQuote(data, dealId, patch.quoteStatus);
}

function parseVisit(value: unknown): KronosVisit | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<KronosVisit>;
  if (!item.id || !item.customerId || !item.at) return null;
  return {
    id: String(item.id),
    customerId: String(item.customerId),
    dealId: String(item.dealId || ''),
    kind: asEnum(item.kind, visitKinds, 'Visita'),
    at: String(item.at),
    offering: String(item.offering || ''),
    objective: String(item.objective || ''),
    quoteStatus: asEnum(item.quoteStatus, quoteStatuses, 'Sem cotação'),
    quoteValue: Math.max(0, Math.round(finite(item.quoteValue))),
    notes: String(item.notes || ''),
    address: String(item.address || ''),
    lat: coordinate(item.lat),
    lng: coordinate(item.lng),
    status: asEnum(item.status, visitStatuses, 'Planejada'),
    result: String(item.result || ''),
    followUp: String(item.followUp || ''),
    followUpAt: String(item.followUpAt || ''),
    followUpDone: Boolean(item.followUpDone),
    createdAt: String(item.createdAt || now())
  };
}

export function getKronosVisits(data: Data): KronosVisit[] {
  const payload = data.customFieldValues?.[VISITS_RECORD]?.payload;
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed.map(parseVisit).filter((item): item is KronosVisit => Boolean(item)) : [];
  } catch {
    return [];
  }
}

export function saveKronosVisits(data: Data, visits: KronosVisit[]) {
  data.customFieldValues ??= {};
  data.customFieldValues[VISITS_RECORD] = { payload: JSON.stringify(visits) };
}

export function newKronosVisit(input: Omit<KronosVisit, 'id' | 'status' | 'result' | 'followUp' | 'followUpAt' | 'followUpDone' | 'createdAt'>): KronosVisit {
  return {
    ...input,
    id: uid(),
    status: 'Planejada',
    result: '',
    followUp: '',
    followUpAt: '',
    followUpDone: false,
    createdAt: now()
  };
}

export function upsertKronosVisit(data: Data, visit: KronosVisit) {
  const visits = getKronosVisits(data);
  const index = visits.findIndex(item => item.id === visit.id);
  const previousDealId = index >= 0 ? visits[index].dealId : '';
  if (index >= 0) visits[index] = visit;
  else visits.push(visit);
  saveKronosVisits(data, visits);
  syncVisitTask(data, visit, previousDealId);
}

export function updateKronosVisit(data: Data, id: string, patch: Partial<KronosVisit>) {
  const visits = getKronosVisits(data);
  const index = visits.findIndex(item => item.id === id);
  if (index < 0) throw new Error('Compromisso comercial não encontrado.');
  const previousDealId = visits[index].dealId;
  visits[index] = { ...visits[index], ...patch, id: visits[index].id };
  saveKronosVisits(data, visits);
  syncVisitTask(data, visits[index], previousDealId);
  return visits[index];
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query || typeof window === 'undefined') return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: controller.signal });
    if (!response.ok) return null;
    const result = await response.json() as { lat?: string; lon?: string }[];
    const lat = Number(result[0]?.lat);
    const lng = Number(result[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function dealActivityAt(data: Data, deal: Deal) {
  const meta = getKronosDealMeta(data, deal.id);
  const visitAt = getKronosVisits(data)
    .filter(item => item.dealId === deal.id && item.status === 'Realizada')
    .map(item => item.at)
    .sort()
    .at(-1) || '';
  return [meta.lastContactAt, visitAt, deal.createdAt].filter(Boolean).sort().at(-1) || deal.createdAt;
}

export type KronosSignal = {
  score: number;
  label: 'Baixo' | 'Moderado' | 'Forte' | 'Atenção';
  reasons: string[];
  overdue: boolean;
  daysWithoutContact: number;
};

export function kronosSignal(data: Data, deal: Deal, stages: string[]): KronosSignal {
  const meta = getKronosDealMeta(data, deal.id);
  const pending = data.tasks.filter(item => item.dealId === deal.id && !item.done).sort((a, b) => a.due.localeCompare(b.due));
  const next = pending[0];
  const plannedVisit = getKronosVisits(data).filter(item => item.dealId === deal.id && item.status === 'Planejada').sort((a, b) => a.at.localeCompare(b.at))[0];
  const nextAt = next?.due || plannedVisit?.at || '';
  const hasNext = Boolean(next || plannedVisit);
  const overdue = Boolean(nextAt && new Date(nextAt).getTime() < Date.now());
  const stageIndex = Math.max(0, stages.indexOf(deal.stage));
  const stageProgress = stages.length > 1 ? stageIndex / (stages.length - 1) : 0;
  const last = new Date(dealActivityAt(data, deal)).getTime();
  const daysWithoutContact = Number.isFinite(last) ? Math.max(0, Math.floor((Date.now() - last) / 86400000)) : 0;

  let score = 18 + Math.round(stageProgress * 40);
  const reasons: string[] = [];

  if (meta.quoteStatus === 'Em elaboração') { score += 7; reasons.push('cotação em elaboração'); }
  if (meta.quoteStatus === 'Enviada') { score += 15; reasons.push('cotação enviada'); }
  if (meta.quoteStatus === 'Aprovada') { score += 24; reasons.push('cotação aprovada'); }
  if (meta.quoteStatus === 'Reprovada') { score -= 25; reasons.push('cotação reprovada'); }
  if (meta.temperature === 'Quente') { score += 10; reasons.push('percepção do vendedor: quente'); }
  if (meta.temperature === 'Fria') { score -= 8; reasons.push('percepção do vendedor: fria'); }
  if (hasNext && !overdue) { score += 8; reasons.push(plannedVisit ? 'compromisso programado' : 'próxima ação definida'); }
  if (!hasNext) { score -= 12; reasons.push('sem próxima ação'); }
  if (overdue) { score -= 20; reasons.push(plannedVisit ? 'compromisso atrasado' : 'retorno atrasado'); }
  if (daysWithoutContact <= 7) { score += 7; reasons.push('contato recente'); }
  if (daysWithoutContact >= 15) { score -= 12; reasons.push(`${daysWithoutContact} dias sem contato`); }

  score = Math.max(5, Math.min(95, score));
  const label = overdue || daysWithoutContact >= 21 || !hasNext
    ? 'Atenção'
    : score >= 70
      ? 'Forte'
      : score >= 42
        ? 'Moderado'
        : 'Baixo';

  return { score, label, reasons: reasons.slice(0, 4), overdue, daysWithoutContact };
}

export function isClosedDeal(deal: Deal) {
  return ['Ganha', 'Perdida'].includes(deal.stage);
}
