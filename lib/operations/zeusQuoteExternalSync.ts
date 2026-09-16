'use client';

import { createStoreClient } from '@/lib/supabase/storeClient';
import { activeJob, advanceJob, event, now } from './model';
import type { Quote } from './model';
import type { Workspace } from './storage';

type QuoteResponseRow = {
  id: string;
  link_id: string;
  record_id: string;
  response: Record<string, unknown>;
  created_at: string;
};

type QuoteLinkRow = { id: string; payload: Record<string, unknown> };

function responseDay(value: string) {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value || '');
  return match?.[0] || '';
}

function decideExternalQuote(quote: Quote, approved: boolean, note: string, respondedAt: string) {
  if (quote.status !== 'Enviado') throw new Error('Somente orçamentos enviados podem receber uma decisão.');
  if (!note.trim()) throw new Error('Informe como a decisão do cliente foi recebida.');
  const receivedDay = responseDay(respondedAt);
  if (quote.validUntil && receivedDay && receivedDay > quote.validUntil) throw new Error('Resposta recebida após a validade do orçamento.');
  quote.status = approved ? 'Aprovado' : 'Reprovado';
  quote.decisionAt = respondedAt || now();
  quote.decisionNote = note;
  quote.events.push(event(`Versão ${quote.version}: ${quote.status.toLowerCase()}, decisão recebida pelo link externo. ${note}`));
}

export async function syncZeusQuoteExternalResponses(w: Workspace) {
  if (!w.accountId || w.accountId === 'guest') return 0;
  const supabase = createStoreClient();
  const { data: rows, error } = await supabase
    .from('external_link_responses')
    .select('id,link_id,record_id,response,created_at')
    .eq('account_id', w.accountId)
    .eq('app_id', 'zeus')
    .eq('kind', 'zeus-quote')
    .is('processed_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!rows?.length) return 0;

  const linkIds = Array.from(new Set(rows.map(row => String(row.link_id || '')).filter(Boolean)));
  const { data: links, error: linkError } = linkIds.length
    ? await supabase.from('external_links').select('id,payload').eq('account_id', w.accountId).in('id', linkIds)
    : { data: [] as QuoteLinkRow[], error: null };
  if (linkError) throw linkError;
  const payloadByLink = new Map((links || []).map(link => [String(link.id), (link.payload || {}) as Record<string, unknown>]));
  const imported = rows.map(row => row.id);

  const ok = await w.mutate(data => {
    for (const raw of rows as QuoteResponseRow[]) {
      const response = (raw.response || {}) as Record<string, unknown>;
      const payload = payloadByLink.get(String(raw.link_id)) || {};
      const job = data.jobs.find(item => item.id === raw.record_id);
      const quote = job?.quote || data.quotes.find(item => item.id === raw.record_id);
      if (!quote || quote.status !== 'Enviado') continue;

      if (job && !activeJob(job)) {
        if (!job.events.some(item => item.text.includes(`Resposta externa ignorada porque a OS está ${job.status}`))) {
          job.events.push(event(`Resposta externa ignorada porque a OS está ${job.status}.`));
        }
        continue;
      }

      const responseVersion = Number(response.version || payload.version || 0);
      if (responseVersion && responseVersion !== quote.version) {
        if (job && !job.events.some(item => item.text.includes(`versão ${responseVersion} ignorada`))) {
          job.events.push(event(`Resposta externa da versão ${responseVersion} ignorada porque o orçamento atual está na versão ${quote.version}`));
        }
        continue;
      }

      const decision = String(response.decision || '');
      if (!['approved', 'rejected'].includes(decision)) {
        quote.events.push(event('Resposta externa ignorada por não conter uma decisão válida.'));
        continue;
      }

      const receivedDay = responseDay(raw.created_at);
      if (quote.validUntil && receivedDay && receivedDay > quote.validUntil) {
        quote.events.push(event(`Resposta externa recebida em ${receivedDay} ignorada porque a validade terminou em ${quote.validUntil}.`));
        if (job) job.events.push(event('Resposta externa do orçamento ignorada porque foi recebida após a validade.'));
        continue;
      }

      const approved = decision === 'approved';
      const note = `Resposta pelo link externo${response.name ? ` · ${response.name}` : ''}${response.note ? ` · ${response.note}` : ''}`;
      decideExternalQuote(quote, approved, note, raw.created_at);
      if (job) {
        job.status = approved ? 'Em andamento' : 'Reprovado';
        job.events.push(event(`Cliente respondeu pelo link externo: ${approved ? 'Aprovado' : 'Reprovado'}`));
        if (approved && job.stage === 'Orçamento') advanceJob(data, job.id, 'Orçamento');
      }
    }
  }, `${rows.length} resposta(s) externa(s) de orçamento processada(s).`);

  if (!ok) throw new Error('A resposta externa de orçamento ainda não pôde ser aplicada ao estado atual.');
  const { error: updateError } = await supabase.from('external_link_responses').update({ processed_at: now() }).in('id', imported);
  if (updateError) throw updateError;
  return imported.length;
}
