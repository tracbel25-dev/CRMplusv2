'use client';

import { createStoreClient } from '@/lib/supabase/storeClient';
import { AppId, Data, Order, Response as SurveyResponse, advanceJob, decideQuote, event, nextNumber, now, uid } from './model';
import type { Workspace } from './storage';

export type ExternalKind = 'artemis-menu' | 'zeus-quote' | 'athena-budget' | 'athena-survey' | 'kronos-response';
export type ExternalDraft = { kind: ExternalKind; recordId?: string; title: string; payload: Record<string, unknown> };

export function externalDraft(app: AppId, page: string, recordId: string, data: Data): ExternalDraft | null {
  if (app === 'artemis' && ['cardapio', 'cardapio-digital', 'inicio'].includes(page) && !recordId) {
    return {
      kind: 'artemis-menu',
      title: data.settings.business ? `Cardápio · ${data.settings.business}` : 'Cardápio digital',
      payload: {
        business: data.settings.business,
        phone: data.settings.phone,
        hours: data.settings.hours,
        deliveryFee: data.settings.deliveryFee,
        minimumOrder: data.settings.minimumOrder,
        deliveryAreas: data.settings.deliveryAreas,
        products: data.products.filter(item => item.available).map(item => ({ id: item.id, name: item.name, description: item.description, category: item.category, price: item.price, allergens: item.allergens }))
      }
    };
  }

  if (app === 'zeus' && recordId) {
    const job = data.jobs.find(item => item.id === recordId);
    if (job?.quote.status === 'Enviado') {
      const customer = data.customers.find(item => item.id === job.customerId);
      const asset = data.assets.find(item => item.id === job.assetId);
      return {
        kind: 'zeus-quote', recordId: job.id,
        title: `Orçamento OS ${String(job.number).padStart(4, '0')}`,
        payload: { business: data.settings.business, customer: customer?.name, asset: asset ? `${asset.identifier} · ${asset.model}` : '', quote: job.quote, quoteId: job.quote.id, jobId: job.id, origin: 'os', version: job.quote.version }
      };
    }
    const quote = data.quotes.find(item => item.id === recordId);
    if (quote?.status === 'Enviado') {
      const customer = data.customers.find(item => item.id === quote.customerId);
      return { kind: 'zeus-quote', recordId: quote.id, title: `Orçamento balcão ${String(quote.number).padStart(4, '0')}`, payload: { business: data.settings.business, customer: customer?.name, quote, quoteId: quote.id, origin: 'balcao', version: quote.version } };
    }
    return null;
  }

  if (app === 'athena-orcamentos' && recordId) {
    const quote = data.quotes.find(item => item.id === recordId);
    if (!quote || quote.status !== 'Enviado') return null;
    const customer = data.customers.find(item => item.id === quote.customerId);
    return { kind: 'athena-budget', recordId: quote.id, title: quote.title || `Orçamento ${String(quote.number).padStart(4, '0')}`, payload: { business: data.settings.business, customer: customer?.name, quote } };
  }

  if (app === 'athena-pesquisa' && recordId) {
    const survey = data.surveys.find(item => item.id === recordId);
    if (!survey || survey.status !== 'Ativa') return null;
    return { kind: 'athena-survey', recordId: survey.id, title: survey.title, payload: { business: data.settings.business, survey } };
  }

  if (app === 'kronos' && recordId) {
    const deal = data.deals.find(item => item.id === recordId);
    if (!deal) return null;
    const customer = data.customers.find(item => item.id === deal.customerId);
    return { kind: 'kronos-response', recordId: deal.id, title: deal.title, payload: { business: data.settings.business, customer: customer?.name, value: deal.value, stage: deal.stage, nextAction: deal.nextAction } };
  }

  return null;
}

export async function createExternalLink(w: Workspace, app: AppId, draft: ExternalDraft) {
  if (!w.accountId || w.accountId === 'guest') throw new Error('Entre com a conta da empresa para gerar um link externo.');
  const supabase = createStoreClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sua sessão expirou. Entre novamente.');
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const { error } = await supabase.from('external_links').insert({
    account_id: w.accountId,
    app_id: app,
    kind: draft.kind,
    record_id: draft.recordId || null,
    token,
    title: draft.title,
    payload: draft.payload,
    created_by: auth.user.id
  });
  if (error) throw error;
  return `${window.location.origin}/externo/${token}`;
}

export async function syncExternalResponses(w: Workspace, app: AppId) {
  if (!w.accountId || w.accountId === 'guest') return 0;
  const supabase = createStoreClient();
  const { data: rows, error } = await supabase.from('external_link_responses').select('id,kind,record_id,response,created_at').eq('account_id', w.accountId).eq('app_id', app).is('processed_at', null).order('created_at', { ascending: true });
  if (error) throw error;
  if (!rows?.length) return 0;

  const imported: string[] = [];
  const ok = await w.mutate(data => {
    for (const row of rows) {
      const response = row.response as Record<string, unknown>;
      if ((row.kind === 'zeus-quote' || row.kind === 'athena-budget') && row.record_id) {
        const zeusJob = row.kind === 'zeus-quote' ? data.jobs.find(item => item.id === row.record_id) : undefined;
        const quote = row.kind === 'zeus-quote'
          ? zeusJob?.quote || data.quotes.find(item => item.id === row.record_id)
          : data.quotes.find(item => item.id === row.record_id);
        const responseVersion = Number(response.version || 0);
        if (quote && quote.status === 'Enviado' && (!responseVersion || responseVersion === quote.version)) {
          const approved = response.decision === 'approved';
          decideQuote(quote, approved, `Resposta pelo link externo${response.name ? ` · ${response.name}` : ''}${response.note ? ` · ${response.note}` : ''}`);
          if (row.kind === 'zeus-quote' && zeusJob) {
            zeusJob.status = approved ? 'Em andamento' : 'Reprovado';
            zeusJob.events.push(event(`Cliente respondeu pelo link externo: ${approved ? 'Aprovado' : 'Reprovado'}`));
            if (approved && zeusJob.stage === 'Orçamento') advanceJob(data, zeusJob.id, 'Orçamento');
          }
        }
      } else if (row.kind === 'athena-survey' && row.record_id) {
        const answersArray = Array.isArray(response.answers) ? response.answers as { questionId?: string; value?: string }[] : [];
        const answers = Object.fromEntries(answersArray.filter(item => item.questionId).map(item => [String(item.questionId), String(item.value || '')]));
        const surveyResponse: SurveyResponse = { id: uid(), surveyId: row.record_id, at: row.created_at, answers, contact: String(response.respondent || '') };
        data.responses.push(surveyResponse);
      } else if (row.kind === 'artemis-menu') {
        const requested = Array.isArray(response.items) ? response.items as { productId?: string; quantity?: number; note?: string }[] : [];
        const lines = requested.map(item => {
          const product = data.products.find(p => p.id === item.productId && p.available);
          if (!product) return null;
          return { id: uid(), kind: 'Produto' as const, description: product.name, brand: '', quantity: Math.max(1, Number(item.quantity || 1)), price: product.price, productId: product.id, done: false, note: String(item.note || ''), prepMinutes: product.preparation || 0 };
        }).filter(Boolean) as Order['lines'];
        if (lines.length) data.orders.push({ id: uid(), number: nextNumber(data.orders), customerId: '', customerName: String(response.customer || ''), phone: String(response.phone || ''), address: String(response.address || ''), channel: String(response.channel || 'Delivery') === 'Retirada' ? 'Retirada' : 'Delivery', tableId: '', lines, notes: String(response.notes || ''), status: 'Novo', delivery: 'Aguardando saída', fee: String(response.channel || 'Delivery') === 'Delivery' ? data.settings.deliveryFee : 0, discount: 0, createdAt: row.created_at, events: [event('Pedido recebido pelo cardápio externo')], stockConsumed: false, reserved: false });
      } else if (row.kind === 'kronos-response' && row.record_id) {
        const deal = data.deals.find(item => item.id === row.record_id);
        if (deal) {
          const intent = String(response.intent || '');
          deal.events.push(event(`Resposta externa: ${intent === 'advance' ? 'quer avançar' : intent === 'later' ? 'pediu contato depois' : 'sem interesse'}${response.note ? ` · ${response.note}` : ''}`));
          if (intent === 'advance') { deal.nextAction = 'Retomar contato com cliente'; deal.due = new Date().toISOString().slice(0, 10); }
          if (intent === 'not-interested') deal.lostReason = String(response.note || 'Cliente informou que não tem interesse pelo link externo.');
        }
      }
      imported.push(row.id);
    }
  }, `${rows.length} resposta(s) externa(s) recebida(s).`);

  if (!ok) return 0;
  const { error: updateError } = await supabase.from('external_link_responses').update({ processed_at: now() }).in('id', imported);
  if (updateError) throw updateError;
  return imported.length;
}
