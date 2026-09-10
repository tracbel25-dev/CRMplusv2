'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apps } from '@/lib/catalog';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';
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

function brazilPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 11 ? `55${digits}` : digits;
  if (!/^55\d{11}$/.test(normalized)) throw new Error('Informe um celular brasileiro com DDD.');
  return `+${normalized}`;
}

export function Subscriptions({ initialApp, initialPlan, returned }: { initialApp?: string; initialPlan?: string; returned: boolean }) {
  const access = useStoreAccess();
  const accountId = access.account?.id;
  const [selected, setSelected] = useState(apps.some(app => app.slug === initialApp) ? initialApp! : apps[0].slug);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [trialEligibleApps, setTrialEligibleApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(returned ? 'Estamos confirmando sua assinatura no Mercado Pago.' : '');
  const [trialDocument, setTrialDocument] = useState('');
  const [trialPhone, setTrialPhone] = useState('');
  const [sentPhone, setSentPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);
  const [identityMessage, setIdentityMessage] = useState('');
  const [skipTrial, setSkipTrial] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const [catalog, billing] = await Promise.all([
      createStoreClient().from('plans').select('id,app_id,billing_interval,amount_cents,currency').eq('active', true).order('amount_cents'),
      billingRequest<BillingList>({ action: 'list', accountId }),
    ]);
    if (catalog.error) throw new Error('Não foi possível carregar os planos.');
    setPlans(catalog.data || []);
    setSubscriptions(billing.subscriptions || []);
    setTrialEligibleApps(billing.trialEligibleApps || []);
    setReady(billing.ready);
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
  }, [returned, accountId, load, access]);

  useEffect(() => {
    let alive = true;
    void fetch(`${STORE_SUPABASE.url}/auth/v1/settings`, { headers: { apikey: STORE_SUPABASE.publishableKey } })
      .then(response => response.ok ? response.json() : null)
      .then(settings => { if (alive) setSmsEnabled(settings?.external?.phone === true && settings?.phone_autoconfirm === false); })
      .catch(() => { if (alive) setSmsEnabled(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setTrialDocument('');
    setIdentityMessage('');
    setSkipTrial(false);
  }, [selected]);

  const trialEligible = trialEligibleApps.includes(selected);
  const phoneVerified = !!access.user?.phone && !!access.user?.phone_confirmed_at;
  const usingTrial = trialEligible && !skipTrial;

  async function sendPhoneCode() {
    if (identityBusy) return;
    setIdentityBusy(true); setIdentityMessage(''); setError('');
    try {
      const phone = brazilPhone(trialPhone);
      const result = await createStoreClient().auth.updateUser({ phone });
      if (result.error) throw result.error;
      setSentPhone(phone);
      setIdentityMessage('Código enviado. Digite o código recebido por SMS.');
    } catch (reason) {
      setError((reason as Error).message || 'Não foi possível enviar o código.');
    } finally { setIdentityBusy(false); }
  }

  async function confirmPhoneCode() {
    if (identityBusy || !sentPhone || !phoneCode.trim()) return;
    setIdentityBusy(true); setIdentityMessage(''); setError('');
    try {
      const result = await createStoreClient().auth.verifyOtp({ phone: sentPhone, token: phoneCode.trim(), type: 'phone_change' });
      if (result.error) throw result.error;
      setSentPhone(''); setPhoneCode('');
      await access.refresh();
      setIdentityMessage('Celular confirmado. Complete o CPF/CNPJ e siga para o Mercado Pago.');
    } catch {
      setError('Código inválido ou expirado. Confira o SMS e tente novamente.');
    } finally { setIdentityBusy(false); }
  }

  async function act(action: 'checkout' | 'sync' | 'cancel', id: string) {
    if (!accountId || busy) return;
    if (action === 'cancel' && !window.confirm('Cancelar as próximas cobranças? O acesso permanece até o fim do período já liberado.')) return;
    if (action === 'checkout' && usingTrial) {
      if (!phoneVerified) { setError('Confirme seu celular para receber os 7 dias grátis.'); return; }
      if (!trialDocument.trim()) { setError('Informe seu CPF ou CNPJ para validar os 7 dias grátis.'); return; }
    }
    setBusy(id); setError(''); setNotice('');
    try {
      const payload: Record<string, unknown> = { action, accountId, [action === 'checkout' ? 'planId' : 'subscriptionId']: id };
      if (action === 'checkout') {
        payload.skipTrial = !usingTrial;
        if (usingTrial) payload.trialDocument = trialDocument;
      }
      const result = await billingRequest<{ url?: string; trialApplied?: boolean }>(payload);
      if (action === 'checkout' && result.url) {
        const url = new URL(result.url);
        if (url.protocol !== 'https:' || !['www.mercadopago.com.br', 'mercadopago.com.br'].includes(url.hostname)) throw new Error('Link de pagamento inválido.');
        window.location.assign(url.href); return;
      }
      await load(); await access.refresh();
      setNotice(action === 'cancel' ? 'Renovação cancelada. O período já liberado continua disponível até vencer.' : 'Status consultado no Mercado Pago.');
    } catch (reason) {
      const message = (reason as Error).message || 'Não foi possível concluir.';
      if (action === 'checkout' && (message.includes('já utilizou o teste grátis') || message.includes('teste grátis não está disponível'))) {
        setSkipTrial(true);
        setError(`${message} Se quiser continuar, a próxima tentativa será uma assinatura normal com cobrança imediata.`);
        void load().catch(() => {});
      } else setError(message);
    } finally { setBusy(''); }
  }

  if (!access.ready) return <p role="status">Carregando sua conta…</p>;
  if (!access.user) {
    const redirect = encodeURIComponent(`/assinaturas?app=${selected}${initialPlan ? `&plano=${encodeURIComponent(initialPlan)}` : ''}`);
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

        {trialEligible && <div className="billing-trial-identity">
          <div className="billing-trial-heading"><span>TESTE PROTEGIDO</span><h3>Validação dos 7 dias grátis</h3><p>O teste é liberado uma única vez por aplicativo. Validamos sua conta, celular confirmado e CPF/CNPJ; após a autorização, o Mercado Pago também valida o pagador e o meio de pagamento.</p></div>
          {!skipTrial ? <>
            {!phoneVerified ? <div className="billing-trial-grid">
              {smsEnabled === null ? <p>Verificando confirmação por SMS…</p> : smsEnabled ? <>
                <label htmlFor="trial-phone">Celular com DDD<input id="trial-phone" type="tel" autoComplete="tel" value={trialPhone} onChange={event => setTrialPhone(event.target.value)} placeholder="(91) 99999-9999" disabled={identityBusy}/></label>
                <button className="ghost" type="button" disabled={identityBusy || !trialPhone} onClick={() => void sendPhoneCode()}>{identityBusy ? 'Aguarde…' : 'Enviar código por SMS'}</button>
                {sentPhone && <><label htmlFor="trial-code">Código recebido<input id="trial-code" inputMode="numeric" autoComplete="one-time-code" value={phoneCode} onChange={event => setPhoneCode(event.target.value)} maxLength={10} disabled={identityBusy}/></label><button className="ghost" type="button" disabled={identityBusy || !phoneCode} onClick={() => void confirmPhoneCode()}>Confirmar celular</button></>}
              </> : <p>A confirmação por SMS está indisponível agora. Você ainda pode assinar normalmente sem o período grátis.</p>}
            </div> : <p className="billing-trial-status">✓ Celular confirmado: {access.user.phone}</p>}
            {phoneVerified && <label className="billing-trial-document" htmlFor="trial-document">CPF do responsável ou CNPJ da empresa<input id="trial-document" inputMode="numeric" autoComplete="off" value={trialDocument} onChange={event => setTrialDocument(event.target.value)} maxLength={18} placeholder="Somente para validar a elegibilidade"/></label>}
            {identityMessage && <p className="billing-trial-status" role="status">{identityMessage}</p>}
            <p className="billing-caption">No controle antifraude, CPF/CNPJ e celular são comparados por hashes com chave interna. O telefone confirmado permanece no Supabase Auth como dado da sua conta.</p>
            <button className="text-action billing-skip-trial" type="button" onClick={() => setSkipTrial(true)}>Prefiro assinar sem teste grátis</button>
          </> : <div className="billing-no-trial"><strong>Assinatura sem teste grátis</strong><p>A cobrança começa agora conforme o plano escolhido. Nenhum período gratuito será solicitado ao Mercado Pago.</p><button className="ghost" type="button" onClick={() => { setSkipTrial(false); setError(''); }}>Tentar validar os 7 dias grátis</button></div>}
        </div>}

        <div className="billing-plans">{plans.filter(plan => plan.app_id === selected).map(plan => <article key={plan.id} style={initialPlan === plan.id ? { outline: '2px solid #a5762d' } : undefined}>
          <h2>{cycles[plan.billing_interval]}{initialPlan === plan.id ? ' · Selecionado' : ''}</h2><strong>{money(plan.amount_cents)}</strong>
          <p>{usingTrial ? '7 dias grátis se a validação for aprovada. Depois, ' : ''}{plan.billing_interval === 'monthly' ? 'cobrança mensal' : plan.billing_interval === 'semiannual' ? 'cobrança a cada 6 meses' : 'cobrança a cada 12 meses'} com renovação automática.</p>
          <button className="primary" disabled={!!busy || !ready} onClick={() => void act('checkout', plan.id)}>{busy === plan.id ? 'Abrindo pagamento…' : usingTrial ? 'Assinar com 7 dias grátis' : trialEligible ? 'Assinar sem teste grátis' : 'Assinar com Mercado Pago'}</button>
        </article>)}</div>
        <p className="billing-caption">{usingTrial ? 'A primeira cobrança acontece somente após os 7 dias grátis. Se a identidade já tiver usado o teste, o período grátis é bloqueado.' : 'A assinatura segue diretamente para cobrança pelo Mercado Pago.'}</p>
      </section>
      <section className="billing-panel"><h2>Suas assinaturas</h2>
        {subscriptions.length === 0 ? <p>Nenhuma assinatura iniciada.</p> : subscriptions.map(subscription => {
          const paid = !!subscription.current_period_end && Date.parse(subscription.current_period_end) > Date.now();
          const trial = subscription.trial_requested && !!subscription.trial_ends_at && Date.parse(subscription.trial_ends_at) > Date.now();
          return <article className="billing-subscription" key={subscription.id}><div>
            <h3>{apps.find(app => app.slug === subscription.app_id)?.name || subscription.app_id}</h3>
            <p>{money(subscription.amount_cents)} a cada {subscription.frequency} {subscription.frequency === 1 ? 'mês' : 'meses'}</p>
            <p>{statuses[subscription.status] || subscription.status}</p>
            <strong>{trial ? `7 dias grátis até ${new Date(subscription.trial_ends_at!).toLocaleString('pt-BR')}` : paid ? `Período pago até ${new Date(subscription.current_period_end!).toLocaleDateString('pt-BR')}` : 'Sem período pago vigente'}</strong>
          </div><div className="billing-actions">
            {subscription.status !== 'failed' && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('sync', subscription.id)}>{busy === subscription.id ? 'Aguarde…' : 'Atualizar status'}</button>}
            {['pending', 'authorized', 'paused'].includes(subscription.status) && <button className="ghost" disabled={!!busy || !ready} onClick={() => void act('cancel', subscription.id)}>Cancelar renovação</button>}
            {(paid || trial) && <Link className="primary" href={`/${subscription.app_id}`}>Abrir aplicativo</Link>}
          </div></article>;
        })}
      </section>
    </>}
  </>;
}
