'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apps } from '@/lib/catalog';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { TrialActivation } from '@/components/TrialActivation';
import { billingRequest } from '@/lib/billing';

type Plan = { id: string; app_id: string; billing_interval: string; amount_cents: number; currency: string };
type Subscription = { id: string; app_id: string; status: string; amount_cents: number; frequency: number; current_period_end: string | null };
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cycles: Record<string, string> = { monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual' };
const statuses: Record<string, string> = { creating: 'Conferindo criação', pending: 'Aguardando autorização', authorized: 'Renovação automática autorizada', paused: 'Renovação pausada', cancelled: 'Renovação cancelada', failed: 'Não concluída' };

export function Subscriptions({ initialApp, initialPlan, returned }: { initialApp?: string; initialPlan?: string; returned: boolean }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const [selected, setSelected] = useState(apps.some(app => app.slug === initialApp) ? initialApp! : apps[0].slug);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(returned ? 'Estamos aguardando a confirmação do pagamento. Você pode atualizar o status abaixo.' : '');
  const load = useCallback(async () => {
    if (!accountId) return;
    const [catalog, billing] = await Promise.all([
      createStoreClient().from('plans').select('id,app_id,billing_interval,amount_cents,currency').eq('active', true).order('amount_cents'),
      billingRequest<{ subscriptions: Subscription[]; ready: boolean }>({ action: 'list', accountId }),
    ]);
    if (catalog.error) throw new Error('Não foi possível carregar os planos.');
    setPlans(catalog.data || []); setSubscriptions(billing.subscriptions); setReady(billing.ready);
  }, [accountId]);
  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void load().catch(reason => setError(reason.message)).finally(() => setLoading(false));
  }, [accountId, load]);
  // Poll only our database after checkout. Returning from Mercado Pago never grants access.
  useEffect(() => {
    if (!returned || !accountId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts >= 12) window.clearInterval(timer);
      void load().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [returned, accountId, load]);

  async function act(action: 'checkout' | 'sync' | 'cancel', id: string) {
    if (!accountId || busy) return;
    if (action === 'cancel' && !window.confirm('Cancelar as próximas cobranças? O acesso permanece até o fim do período já pago.')) return;
    setBusy(id); setError(''); setNotice('');
    try {
      const result = await billingRequest<{ url?: string }>({ action, accountId, [action === 'checkout' ? 'planId' : 'subscriptionId']: id });
      if (action === 'checkout' && result.url) {
        const url = new URL(result.url);
        if (url.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) throw new Error('Link de pagamento inválido.');
        window.location.assign(url.href); return;
      }
      await load(); await access.refresh();
      setNotice(action === 'cancel' ? 'Renovação cancelada. O período já pago continua disponível.' : 'Status consultado no Mercado Pago.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(''); }
  }

  if (!access.ready) return <p role="status">Carregando sua conta…</p>;
  if (!access.user) {
    const redirect = encodeURIComponent(`/assinaturas?app=${selected}${initialPlan ? `&plano=${encodeURIComponent(initialPlan)}` : ""}`);
    return <section className="billing-panel"><h2>Entre para assinar um aplicativo.</h2><p>A assinatura ficará vinculada à sua empresa.</p><div className="billing-actions"><Link className="primary" href={`/login?redirect=${redirect}`}>Entrar</Link><Link className="ghost" href={`/cadastro?app=${selected}&redirect=${redirect}`}>Criar conta</Link></div></section>;
  }
  if (access.error || !access.account) return <p role="alert">{access.error || 'Conclua o cadastro da sua empresa para continuar.'}</p>;
  return <>
    <div className="billing-account"><strong>{access.account.name}</strong><Link href="/entrar">Meus aplicativos</Link></div>
    {error && <p className="billing-error" role="alert">{error}</p>}
    {notice && <p className="billing-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando assinaturas…</p> : <>
      {!ready && <p className="billing-notice">As novas assinaturas estarão disponíveis em breve.</p>}
      <section className="billing-panel"><label htmlFor="billing-app">Escolha seu aplicativo</label>
        <select id="billing-app" value={selected} onChange={event => setSelected(event.target.value)}>{apps.map(app => <option value={app.slug} key={app.slug}>{app.name} — {app.category}</option>)}</select>
        <div className="billing-plans">{plans.filter(plan => plan.app_id === selected).map(plan => <article key={plan.id} style={initialPlan === plan.id ? { outline: "2px solid #a5762d" } : undefined}>
          <h2>{cycles[plan.billing_interval]}{initialPlan === plan.id ? " · Selecionado" : ""}</h2><strong>{money(plan.amount_cents)}</strong>
          <p>{plan.billing_interval === 'monthly' ? 'A cada mês' : plan.billing_interval === 'semiannual' ? 'A cada 6 meses' : 'A cada 12 meses'}. Renovação automática.</p>
          <button className="primary" disabled={!!busy || !ready} onClick={() => void act('checkout', plan.id)}>{busy === plan.id ? 'Abrindo pagamento…' : 'Assinar com Mercado Pago'}</button>
        </article>)}</div>
        <p className="billing-caption">O acesso é liberado após a confirmação do pagamento. Cancele a renovação quando precisar.</p>
      </section>
      <TrialActivation app={selected} user={access.user} account={access.account} owner={access.member?.role === 'owner'} refresh={access.refresh} />
      <section className="billing-panel"><h2>Suas assinaturas</h2>
        {subscriptions.length === 0 ? <p>Nenhuma assinatura iniciada.</p> : subscriptions.map(subscription => {
          const paid = !!subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now();
          return <article className="billing-subscription" key={subscription.id}><div>
            <h3>{apps.find(app => app.slug === subscription.app_id)?.name || subscription.app_id}</h3>
            <p>{money(subscription.amount_cents)} a cada {subscription.frequency} {subscription.frequency === 1 ? 'mês' : 'meses'}</p>
            <p>{statuses[subscription.status] || subscription.status}</p>
            <strong>{paid ? `Período pago até ${new Date(subscription.current_period_end!).toLocaleDateString('pt-BR')}` : 'Sem período pago vigente'}</strong>
          </div><div className="billing-actions">
            {subscription.status !== 'failed' && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('sync', subscription.id)}>{busy === subscription.id ? 'Aguarde…' : 'Atualizar status'}</button>}
            {['pending', 'authorized', 'paused'].includes(subscription.status) && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('cancel', subscription.id)}>Cancelar renovação</button>}
            {paid && <Link className="primary" href={`/${subscription.app_id}`}>Abrir aplicativo</Link>}
          </div></article>;
        })}
      </section>
    </>}
  </>;
}
