'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apps } from '@/lib/catalog';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { billingRequest } from '@/lib/billing';

type Plan = { id: string; app_id: string; billing_interval: string; amount_cents: number; currency: string };
type Subscription = {
  id: string;
  app_id: string;
  status: string;
  amount_cents: number;
  frequency: number;
  current_period_end: string | null;
  trial_requested: boolean;
  trial_ends_at: string | null;
};
type BillingList = { subscriptions: Subscription[]; ready: boolean; trialEligibleApps?: string[] };

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const cycles: Record<string, string> = { monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual' };
const frequencies: Record<string, number> = { monthly: 1, semiannual: 6, annual: 12 };
const statuses: Record<string, string> = {
  creating: 'Preparando Mercado Pago',
  pending: 'Aguardando autorização no Mercado Pago',
  authorized: 'Renovação automática autorizada',
  paused: 'Renovação pausada',
  cancelled: 'Renovação cancelada',
  failed: 'Não concluída',
};

export function Subscriptions({ initialApp, initialPlan, returned }: { initialApp?: string; initialPlan?: string; returned: boolean }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const autoCheckoutStarted = useRef(false);
  const [selected, setSelected] = useState(apps.some(item => item.slug === initialApp) ? initialApp! : apps[0].slug);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [trialEligibleApps, setTrialEligibleApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<boolean | null>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(returned ? 'Recebemos seu retorno do Mercado Pago. Conferindo a autorização…' : '');
  const [skipTrial, setSkipTrial] = useState(false);
  const [continuationFailedPlan, setContinuationFailedPlan] = useState('');

  const load = useCallback(async () => {
    if (!accountId) return;
    const [catalogResult, billingResult] = await Promise.allSettled([
      createStoreClient().from('plans').select('id,app_id,billing_interval,amount_cents,currency').eq('active', true).order('amount_cents'),
      billingRequest<BillingList>({ action: 'list', accountId }),
    ]);

    const problems: string[] = [];
    if (catalogResult.status === 'fulfilled' && !catalogResult.value.error) setPlans(catalogResult.value.data || []);
    else problems.push('Não foi possível carregar os planos.');

    if (billingResult.status === 'fulfilled') {
      setSubscriptions(billingResult.value.subscriptions || []);
      setTrialEligibleApps(billingResult.value.trialEligibleApps || []);
      setReady(billingResult.value.ready);
      setBillingLoaded(true);
    } else {
      setReady(null);
      setBillingLoaded(false);
      problems.push('Não foi possível consultar sua assinatura.');
    }
    setError(problems.join(' '));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void load().catch(reason => setError((reason as Error).message)).finally(() => setLoading(false));
  }, [accountId, load]);

  useEffect(() => {
    if (!returned || !accountId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts >= 12) window.clearInterval(timer);
      void load().then(() => access.refresh()).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [returned, accountId, load, access.refresh]);

  useEffect(() => {
    setSkipTrial(false);
    setContinuationFailedPlan('');
  }, [selected]);

  const entitlement = access.account?.apps.find(item => item.appId === selected);
  const canOpen = access.hasApp(selected as Parameters<typeof access.hasApp>[0]);
  const currentSubscription = subscriptions.find(item => item.app_id === selected && ['creating', 'pending', 'authorized', 'paused'].includes(item.status));
  const trialEligible = trialEligibleApps.includes(selected);
  const usingTrial = trialEligible && !skipTrial;

  const matchingPlan = useCallback((subscription: Subscription) => plans.find(plan =>
    plan.app_id === subscription.app_id &&
    plan.amount_cents === subscription.amount_cents &&
    frequencies[plan.billing_interval] === subscription.frequency
  ), [plans]);

  const openCheckout = useCallback(async (planId: string, automatic = false) => {
    if (!accountId || busy) return;
    const targetPlan = plans.find(plan => plan.id === planId);
    if (!targetPlan) {
      setError('O plano selecionado não está mais disponível.');
      if (automatic) setContinuationFailedPlan(planId);
      return;
    }

    const useTrial = trialEligibleApps.includes(targetPlan.app_id) && !(targetPlan.app_id === selected && skipTrial);
    setBusy(planId);
    setError('');
    setContinuationFailedPlan('');
    setNotice(automatic ? 'Login confirmado. Abrindo seu plano no Mercado Pago…' : 'Abrindo o Mercado Pago…');

    try {
      const result = await billingRequest<{ url?: string }>({
        action: 'checkout',
        accountId,
        planId,
        skipTrial: !useTrial,
      });
      if (!result.url) throw new Error('O Mercado Pago não retornou o link para continuar.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) throw new Error('Link de pagamento inválido.');
      if (automatic) window.location.replace(url.href);
      else window.location.assign(url.href);
    } catch (reason) {
      setNotice('');
      setError((reason as Error).message || 'Não foi possível abrir o Mercado Pago.');
      if (automatic) setContinuationFailedPlan(planId);
    } finally {
      setBusy('');
    }
  }, [accountId, busy, plans, selected, skipTrial, trialEligibleApps]);

  useEffect(() => {
    if (!initialPlan || autoCheckoutStarted.current || !accountId || loading || !billingLoaded || ready !== true) return;
    const targetPlan = plans.find(plan => plan.id === initialPlan);
    if (!targetPlan) return;
    const targetAccess = access.account?.apps.find(item => item.appId === targetPlan.app_id);
    const accessStillValid = !!targetAccess && ['active', 'trialing'].includes(targetAccess.status) &&
      (!targetAccess.currentPeriodEnd || Date.parse(targetAccess.currentPeriodEnd) > Date.now());
    if (accessStillValid || targetAccess?.status === 'suspended') return;

    autoCheckoutStarted.current = true;
    if (selected !== targetPlan.app_id) setSelected(targetPlan.app_id);
    void openCheckout(initialPlan, true);
  }, [initialPlan, accountId, loading, billingLoaded, ready, plans, access.account, selected, openCheckout]);

  async function act(action: 'checkout' | 'sync' | 'cancel', id: string) {
    if (!accountId || busy) return;
    if (action === 'checkout') {
      await openCheckout(id);
      return;
    }
    if (action === 'cancel' && !window.confirm('Cancelar as próximas cobranças? O acesso permanece até o fim do período já liberado.')) return;

    setBusy(id);
    setError('');
    setNotice('');
    try {
      await billingRequest({ action, accountId, subscriptionId: id });
      await load();
      await access.refresh();
      setNotice(action === 'cancel' ? 'Renovação cancelada.' : 'Status atualizado com o Mercado Pago.');
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível concluir.');
    } finally {
      setBusy('');
    }
  }

  if (!access.ready) return <p role="status">Carregando sua conta…</p>;
  if (!access.user) {
    const destination = `/assinaturas?app=${selected}${initialPlan ? `&plano=${encodeURIComponent(initialPlan)}` : ''}`;
    const redirect = encodeURIComponent(destination);
    return <section className="billing-panel"><h2>Entre para continuar.</h2><p>Seu plano fica preservado. Depois do login, o Mercado Pago abre automaticamente.</p><div className="billing-actions"><Link className="primary" href={`/login?redirect=${redirect}`}>Entrar</Link><Link className="ghost" href={`/cadastro?app=${selected}&redirect=${redirect}`}>Criar conta</Link></div></section>;
  }
  if (access.error || !access.account) return <p role="alert">{access.error || 'Conclua o cadastro da sua empresa para continuar.'}</p>;

  const pendingSelectedPlan = currentSubscription ? matchingPlan(currentSubscription) : undefined;

  return <>
    <div className="billing-account"><strong>{access.account.name}</strong><Link href="/entrar">Meus aplicativos</Link></div>

    {error && <div className="billing-error" role="alert"><p>{error}</p><div className="billing-actions">{continuationFailedPlan && <button className="primary" disabled={!!busy || ready !== true} onClick={() => void openCheckout(continuationFailedPlan, true)}>Tentar abrir Mercado Pago</button>}<button className="ghost" disabled={loading} onClick={() => { setLoading(true); void load().finally(() => setLoading(false)); }}>Atualizar</button></div></div>}
    {notice && <p className="billing-notice" role="status">{notice}</p>}

    {loading ? <p role="status">Carregando assinaturas…</p> : <>
      {ready === false && <p className="billing-notice">As novas assinaturas estão temporariamente indisponíveis.</p>}
      <section className="billing-panel">
        <label htmlFor="billing-app">Escolha seu aplicativo</label>
        <select id="billing-app" value={selected} onChange={event => setSelected(event.target.value)}>{apps.map(app => <option value={app.slug} key={app.slug}>{app.name} — {app.category}</option>)}</select>

        <div className="billing-access-summary" role="status">
          <span className="eyebrow">Seu acesso</span>
          <h2>{canOpen ? entitlement?.status === 'trialing' ? 'Teste grátis ativo' : 'Aplicativo liberado' : entitlement?.status === 'suspended' ? 'Acesso suspenso' : currentSubscription ? 'Falta autorizar no Mercado Pago' : 'Escolha seu plano'}</h2>
          <p>{canOpen ? entitlement?.currentPeriodEnd ? `Disponível até ${new Date(entitlement.currentPeriodEnd).toLocaleString('pt-BR')}.` : 'Sua empresa já pode utilizar o aplicativo.' : currentSubscription ? 'Sua conta CRM PLUS já está pronta. Agora falta somente concluir a autorização no Mercado Pago.' : 'O acesso ao aplicativo só é liberado depois da autorização no Mercado Pago.'}</p>
          {canOpen && <Link className="primary" href={`/${selected}`}>Abrir {apps.find(item => item.slug === selected)?.name}</Link>}
          {!canOpen && currentSubscription?.status === 'pending' && pendingSelectedPlan && <button className="primary" disabled={!!busy || ready !== true} onClick={() => void openCheckout(pendingSelectedPlan.id)}>Continuar no Mercado Pago</button>}
        </div>

        {trialEligible && <div className="billing-trial-identity">
          <div className="billing-trial-heading"><span>7 DIAS GRÁTIS</span><h3>Ativação pelo Mercado Pago</h3><p>Você autoriza o teste no Mercado Pago e só depois o CRM PLUS libera o aplicativo. Não usamos SMS e não pedimos CPF/CNPJ nesta tela.</p></div>
          {!skipTrial ? <>
            <p className="billing-trial-status">A proteção contra repetição usa o pagador e o meio de pagamento retornados pelo Mercado Pago após a autorização.</p>
            <p className="billing-caption">Um teste por pagador e aplicativo. A primeira cobrança acontece após os 7 dias.</p>
            <button className="text-action billing-skip-trial" type="button" onClick={() => setSkipTrial(true)}>Prefiro assinar sem teste grátis</button>
          </> : <div className="billing-no-trial"><strong>Assinatura sem teste grátis</strong><p>A cobrança começa agora conforme o plano escolhido.</p><button className="ghost" type="button" onClick={() => { setSkipTrial(false); setError(''); }}>Usar 7 dias grátis</button></div>}
        </div>}

        <div className="billing-plans">{plans.filter(plan => plan.app_id === selected).map(plan => <article key={plan.id} style={initialPlan === plan.id ? { outline: '2px solid #a5762d' } : undefined}>
          <h2>{cycles[plan.billing_interval]}{initialPlan === plan.id ? ' · Selecionado' : ''}</h2>
          <strong>{money(plan.amount_cents)}</strong>
          <p>{usingTrial ? '7 dias grátis após a autorização no Mercado Pago. Depois, ' : ''}{plan.billing_interval === 'monthly' ? 'cobrança mensal' : plan.billing_interval === 'semiannual' ? 'cobrança a cada 6 meses' : 'cobrança a cada 12 meses'} com renovação automática.</p>
          <button className="primary" disabled={!!busy || ready !== true || canOpen || entitlement?.status === 'suspended'} onClick={() => void act('checkout', plan.id)}>{busy === plan.id ? 'Abrindo Mercado Pago…' : canOpen ? 'Acesso já liberado' : usingTrial ? 'Ativar 7 dias no Mercado Pago' : 'Continuar no Mercado Pago'}</button>
        </article>)}</div>
        <p className="billing-caption">{usingTrial ? 'Cadastro CRM PLUS → autorização no Mercado Pago → 7 dias liberados. Sem autorização, o aplicativo permanece bloqueado.' : 'A assinatura segue diretamente para cobrança pelo Mercado Pago.'}</p>
      </section>

      <section className="billing-panel" id="minhas-assinaturas"><h2>Suas assinaturas</h2>
        {!billingLoaded ? <p>A consulta da assinatura está indisponível.</p> : subscriptions.length === 0 ? <p>Você ainda não iniciou uma assinatura.</p> : subscriptions.map(subscription => {
          const paid = !!subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now();
          const trial = access.hasApp(subscription.app_id as Parameters<typeof access.hasApp>[0]) && subscription.trial_requested && !!subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) > Date.now();
          const pendingPlan = matchingPlan(subscription);
          return <article className="billing-subscription" key={subscription.id}><div>
            <h3>{apps.find(app => app.slug === subscription.app_id)?.name || subscription.app_id}</h3>
            <p>{money(subscription.amount_cents)} a cada {subscription.frequency} {subscription.frequency === 1 ? 'mês' : 'meses'}</p>
            <p>{statuses[subscription.status] || subscription.status}</p>
            <strong>{trial ? `7 dias grátis até ${new Date(subscription.trial_ends_at!).toLocaleString('pt-BR')}` : paid ? `Período pago até ${new Date(subscription.current_period_end!).toLocaleDateString('pt-BR')}` : subscription.trial_requested && subscription.status === 'pending' ? 'Finalize no Mercado Pago para iniciar os 7 dias' : 'Sem período vigente'}</strong>
          </div><div className="billing-actions">
            {subscription.status === 'pending' && pendingPlan && <button className="primary" disabled={!!busy || ready !== true} onClick={() => void openCheckout(pendingPlan.id)}>Continuar no Mercado Pago</button>}
            {subscription.status !== 'failed' && <button className="ghost" disabled={!!busy || ready !== true} onClick={() => void act('sync', subscription.id)}>{busy === subscription.id ? 'Aguarde…' : 'Atualizar status'}</button>}
            {['pending', 'authorized', 'paused'].includes(subscription.status) && <button className="ghost" disabled={!!busy || ready !== true} onClick={() => void act('cancel', subscription.id)}>Cancelar renovação</button>}
            {access.hasApp(subscription.app_id as Parameters<typeof access.hasApp>[0]) && <Link className="primary" href={`/${subscription.app_id}`}>Abrir aplicativo</Link>}
          </div></article>;
        })}
      </section>
    </>}
  </>;
}
