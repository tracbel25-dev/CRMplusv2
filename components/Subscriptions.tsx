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
const statuses: Record<string, string> = { creating: 'Conferindo criação', pending: 'Aguardando autorização', authorized: 'Renovação automática autorizada', paused: 'Renovação pausada', cancelled: 'Renovação cancelada', failed: 'Não concluída' };

export function Subscriptions({ initialApp, initialPlan, returned }: { initialApp?: string; initialPlan?: string; returned: boolean }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const autoCheckoutStarted = useRef(false);
  const [selected, setSelected] = useState(apps.some(app => app.slug === initialApp) ? initialApp! : apps[0].slug);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [trialEligibleApps, setTrialEligibleApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<boolean | null>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(returned ? 'Estamos confirmando sua assinatura no Mercado Pago.' : '');
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
      const billing = billingResult.value;
      setSubscriptions(billing.subscriptions || []);
      setTrialEligibleApps(billing.trialEligibleApps || []);
      setReady(billing.ready);
      setBillingLoaded(true);
    } else {
      setReady(null);
      setBillingLoaded(false);
      problems.push('Não foi possível consultar sua assinatura. Seus planos continuam disponíveis abaixo.');
    }
    setError(problems.join(' '));
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void load().catch(reason => setError(reason.message)).finally(() => setLoading(false));
  }, [accountId, load]);

  useEffect(() => {
    if (!returned || !accountId) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (++attempts >= 12) window.clearInterval(timer);
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

  const openCheckout = useCallback(async (planId: string, automatic = false) => {
    if (!accountId || busy) return;
    const targetPlan = plans.find(plan => plan.id === planId);
    if (!targetPlan) {
      if (automatic) setContinuationFailedPlan(planId);
      setError('O plano selecionado não está mais disponível.');
      return;
    }

    const shouldUseTrial = trialEligibleApps.includes(targetPlan.app_id) && !(targetPlan.app_id === selected && skipTrial);
    setBusy(planId);
    setContinuationFailedPlan('');
    setError('');
    setNotice(automatic ? 'Conta conectada. Abrindo o Mercado Pago para concluir o plano escolhido…' : 'Abrindo o Mercado Pago…');

    try {
      const result = await billingRequest<{ url?: string; trialApplied?: boolean }>({
        action: 'checkout',
        accountId,
        planId,
        skipTrial: !shouldUseTrial,
      });
      if (!result.url) throw new Error('O Mercado Pago não retornou o link para continuar.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) throw new Error('Link de pagamento inválido.');
      if (automatic) window.location.replace(url.href);
      else window.location.assign(url.href);
    } catch (reason) {
      const message = (reason as Error).message || 'Não foi possível abrir o Mercado Pago.';
      setError(message);
      setNotice('');
      if (automatic) setContinuationFailedPlan(planId);
    } finally {
      setBusy('');
    }
  }, [accountId, busy, plans, selected, skipTrial, trialEligibleApps]);

  useEffect(() => {
    if (!initialPlan || autoCheckoutStarted.current || !accountId || loading || !billingLoaded || ready !== true) return;
    const targetPlan = plans.find(plan => plan.id === initialPlan);
    if (!targetPlan) return;
    const targetEntitlement = access.account?.apps.find(item => item.appId === targetPlan.app_id);
    const targetCanOpen = access.hasApp(targetPlan.app_id as Parameters<typeof access.hasApp>[0]);
    if (targetCanOpen || targetEntitlement?.status === 'suspended') return;

    autoCheckoutStarted.current = true;
    if (selected !== targetPlan.app_id) setSelected(targetPlan.app_id);
    void openCheckout(initialPlan, true);
  }, [initialPlan, accountId, loading, billingLoaded, ready, plans, access, selected, openCheckout]);

  async function act(action: 'checkout' | 'sync' | 'cancel', id: string) {
    if (!accountId || busy) return;
    if (action === 'checkout') {
      await openCheckout(id, false);
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
      setNotice(action === 'cancel' ? 'Renovação cancelada. O período já liberado continua disponível até vencer.' : 'Status consultado no Mercado Pago.');
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível concluir.');
    } finally {
      setBusy('');
    }
  }

  if (!access.ready) return <p role="status">Carregando sua conta…</p>;
  if (!access.user) {
    const redirect = encodeURIComponent(`/assinaturas?app=${selected}${initialPlan ? `&plano=${encodeURIComponent(initialPlan)}` : ''}`);
    return <section className="billing-panel"><h2>Entre para continuar.</h2><p>Depois do login, você volta automaticamente para o plano escolhido e segue para o Mercado Pago.</p><div className="billing-actions"><Link className="primary" href={`/login?redirect=${redirect}`}>Entrar</Link><Link className="ghost" href={`/cadastro?app=${selected}&redirect=${redirect}`}>Criar conta</Link></div></section>;
  }
  if (access.error || !access.account) return <p role="alert">{access.error || 'Conclua o cadastro da sua empresa para continuar.'}</p>;

  return <>
    <div className="billing-account"><strong>{access.account.name}</strong><Link href="/entrar">Meus aplicativos</Link></div>
    {error && <div className="billing-error" role="alert"><p>{error}</p><div className="billing-actions">{continuationFailedPlan && <button className="primary" disabled={!!busy || ready !== true} onClick={() => void openCheckout(continuationFailedPlan, true)}>Tentar abrir Mercado Pago</button>}<button className="ghost" disabled={loading} onClick={() => { setLoading(true); void load().finally(() => setLoading(false)); }}>Atualizar</button></div></div>}
    {notice && <p className="billing-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Carregando assinaturas…</p> : <>
      {ready === false && <p className="billing-notice">As novas assinaturas estarão disponíveis em breve.</p>}
      <section className="billing-panel"><label htmlFor="billing-app">Escolha seu aplicativo</label>
        <select id="billing-app" value={selected} onChange={event => setSelected(event.target.value)}>{apps.map(app => <option value={app.slug} key={app.slug}>{app.name} — {app.category}</option>)}</select>

        <div className="billing-access-summary" role="status">
          <span className="eyebrow">Seu acesso</span>
          <h2>{canOpen ? entitlement?.status === 'trialing' ? 'Teste grátis ativo' : 'Aplicativo liberado' : entitlement?.status === 'suspended' ? 'Acesso suspenso' : entitlement ? 'Seu acesso venceu' : currentSubscription ? 'Conclua sua assinatura' : billingLoaded ? 'Escolha como começar' : 'Consultando seu acesso'}</h2>
          <p>{canOpen ? entitlement?.currentPeriodEnd ? `Disponível até ${new Date(entitlement.currentPeriodEnd).toLocaleString('pt-BR')}.` : 'Sua empresa já pode utilizar o aplicativo.' : entitlement ? 'Seus dados estão preservados. Gerencie sua assinatura para continuar.' : currentSubscription ? 'A autorização ainda precisa ser concluída no Mercado Pago antes de liberar o aplicativo.' : billingLoaded ? 'Escolha um plano e continue no Mercado Pago. O aplicativo só é liberado depois que a assinatura ou o teste for autorizado lá.' : 'Você pode consultar os preços enquanto verificamos sua assinatura.'}</p>
          {canOpen && <Link className="primary" href={`/${selected}`}>Abrir {apps.find(item => item.slug === selected)?.name}</Link>}
          {currentSubscription && !canOpen && <button className="ghost" disabled={!!busy || !currentSubscription.plan_id} onClick={() => { const pendingPlan = plans.find(plan => plan.app_id === selected); if (pendingPlan) void openCheckout(pendingPlan.id, false); }}>Continuar no Mercado Pago</button>}
        </div>

        {trialEligible && <div className="billing-trial-identity">
          <div className="billing-trial-heading"><span>7 DIAS GRÁTIS</span><h3>Ativação pelo Mercado Pago</h3><p>O teste só começa depois que você autorizar a assinatura no Mercado Pago. Não usamos SMS e você não precisa informar CPF/CNPJ nesta tela.</p></div>
          {!skipTrial ? <>
            <p className="billing-trial-status">A validação acontece com o pagador e o meio de pagamento retornados pelo próprio Mercado Pago após a autorização.</p>
            <p className="billing-caption">Um teste por pagador e aplicativo. Se o mesmo pagador ou cartão já tiver usado o período grátis, o teste não libera o acesso novamente.</p>
            <button className="text-action billing-skip-trial" type="button" onClick={() => setSkipTrial(true)}>Prefiro assinar sem teste grátis</button>
          </> : <div className="billing-no-trial"><strong>Assinatura sem teste grátis</strong><p>A cobrança começa agora conforme o plano escolhido. Nenhum período gratuito será solicitado ao Mercado Pago.</p><button className="ghost" type="button" onClick={() => { setSkipTrial(false); setError(''); }}>Usar 7 dias grátis</button></div>}
        </div>}

        <div className="billing-plans">{plans.filter(plan => plan.app_id === selected).map(plan => <article key={plan.id} style={initialPlan === plan.id ? { outline: '2px solid #a5762d' } : undefined}>
          <h2>{cycles[plan.billing_interval]}{initialPlan === plan.id ? ' · Selecionado' : ''}</h2><strong>{money(plan.amount_cents)}</strong>
          <p>{usingTrial ? '7 dias grátis após a autorização no Mercado Pago. Depois, ' : ''}{plan.billing_interval === 'monthly' ? 'cobrança mensal' : plan.billing_interval === 'semiannual' ? 'cobrança a cada 6 meses' : 'cobrança a cada 12 meses'} com renovação automática.</p>
          <button className="primary" disabled={!!busy || ready !== true || canOpen || entitlement?.status === 'suspended'} onClick={() => void act('checkout', plan.id)}>{busy === plan.id ? 'Abrindo Mercado Pago…' : canOpen ? 'Acesso já liberado' : usingTrial ? 'Ativar 7 dias no Mercado Pago' : trialEligible ? 'Assinar sem teste grátis' : 'Assinar com Mercado Pago'}</button>
        </article>)}</div>
        <p className="billing-caption">{usingTrial ? 'O acesso permanece bloqueado até o Mercado Pago confirmar a autorização do teste. A primeira cobrança acontece após os 7 dias.' : 'A assinatura segue diretamente para cobrança pelo Mercado Pago.'}</p>
      </section>
      <section className="billing-panel" id="minhas-assinaturas"><h2>Suas assinaturas</h2>
        {!billingLoaded ? <p>A consulta da assinatura está indisponível. Tente atualizar novamente.</p> : subscriptions.length === 0 ? <p>Você ainda não iniciou uma assinatura. Escolha um dos planos acima.</p> : subscriptions.map(subscription => {
          const paid = !!subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now();
          const trial = access.hasApp(subscription.app_id as Parameters<typeof access.hasApp>[0]) && subscription.trial_requested && !!subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) > Date.now();
          const pendingPlan = plans.find(plan => plan.app_id === subscription.app_id && plan.amount_cents === subscription.amount_cents && (cycles[plan.billing_interval] ? true : true));
          return <article className="billing-subscription" key={subscription.id}><div>
            <h3>{apps.find(app => app.slug === subscription.app_id)?.name || subscription.app_id}</h3>
            <p>{money(subscription.amount_cents)} a cada {subscription.frequency} {subscription.frequency === 1 ? 'mês' : 'meses'}</p>
            <p>{statuses[subscription.status] || subscription.status}</p>
            <strong>{trial ? `7 dias grátis até ${new Date(subscription.trial_ends_at!).toLocaleString('pt-BR')}` : paid ? `Período pago até ${new Date(subscription.current_period_end!).toLocaleDateString('pt-BR')}` : subscription.trial_requested && subscription.status === 'pending' ? 'Aguardando autorização do teste no Mercado Pago' : 'Sem período pago vigente'}</strong>
          </div><div className="billing-actions">
            {subscription.status === 'pending' && pendingPlan && <button className="primary" disabled={!!busy || ready !== true} onClick={() => void openCheckout(pendingPlan.id, false)}>Continuar no Mercado Pago</button>}
            {subscription.status !== 'failed' && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('sync', subscription.id)}>{busy === subscription.id ? 'Aguarde…' : 'Atualizar status'}</button>}
            {['pending', 'authorized', 'paused'].includes(subscription.status) && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('cancel', subscription.id)}>Cancelar renovação</button>}
            {access.hasApp(subscription.app_id as Parameters<typeof access.hasApp>[0]) && <Link className="primary" href={`/${subscription.app_id}`}>Abrir aplicativo</Link>}
          </div></article>;
        })}
      </section>
    </>}
  </>;
}
