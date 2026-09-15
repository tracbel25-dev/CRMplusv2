'use client';

import { createStoreClient } from '@/lib/supabase/storeClient';
import { advanceJob, decideQuote, event, now } from './model';
import type { Workspace } from './storage';

type QuoteResponseRow = {
  id: string;
  link_id: string;
  record_id: string;
  response: Record<string, unknown>;
  created_at: string;
};

type QuoteLinkRow = { id: string; payload: Record<string, unknown> };

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

      const responseVersion = Number(response.version || payload.version || 0);
      if (responseVersion && responseVersion !== quote.version) {
        if (job && !job.events.some(item => item.text.includes(`versão ${responseVersion} ignorada`))) {
          job.events.push(event(`Resposta externa da versão ${responseVersion} ignorada porque o orçamento atual está na versão ${quote.version}`));
        }
        continue;
      }

      const approved = response.decision === 'approved';
      decideQuote(quote, approved, `Resposta pelo link externo${response.name ? ` · ${response.name}` : ''}${response.note ? ` · ${response.note}` : ''}`);
      if (job) {
        job.status = approved ? 'Em andamento' : 'Reprovado';
        job.events.push(event(`Cliente respondeu pelo link externo: ${approved ? 'Aprovado' : 'Reprovado'}`));
        if (approved && job.stage === 'Orçamento') advanceJob(data, job.id, 'Orçamento');
      }
    }
  }, `${rows.length} resposta(s) externa(s) de orçamento processada(s).`);

  if (!ok) return 0;
  const { error: updateError } = await supabase.from('external_link_responses').update({ processed_at: now() }).in('id', imported);
  if (updateError) throw updateError;
  return imported.length;
}
