'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apps } from '@/lib/catalog';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { billingRequest } from '@/lib/billing';

type Plan={id:string;app_id:string;billing_interval:string;amount_cents:number;currency:string};
type Subscription={id:string;app_id:string;plan_id:string|null;status:string;amount_cents:number;frequency:number;current_period_end:string|null;trial_requested:boolean;trial_ends_at:string|null};
type BillingList={subscriptions:Subscription[];checkoutSubscriptions?:Subscription[];ready:boolean;trialEligibleApps?:string[]};

const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cycles:Record<string,string>={monthly:'Mensal',semiannual:'Semestral',annual:'Anual'};

export function Subscriptions({initialApp,initialPlan,returned=false}:{initialApp?:string;initialPlan?:string;returned?:boolean}){
  const access=useStoreAccess();
  const accountId=access.account?.id;
  const autoCheckoutStarted=useRef(false);
  const [selected,setSelected]=useState(apps.some(item=>item.slug===initialApp)?initialApp!:apps[0].slug);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [trialEligibleApps,setTrialEligibleApps]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState<boolean|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState(returned?'Conferindo seu retorno do Mercado Pago…':'');
  const [skipTrial,setSkipTrial]=useState(false);
  const [continuationFailedPlan,setContinuationFailedPlan]=useState('');

  const load=useCallback(async()=>{
    if(!accountId)return;
    const [catalogResult,billingResult]=await Promise.allSettled([
      createStoreClient().from('plans').select('id,app_id,billing_interval,amount_cents,currency').eq('active',true).order('amount_cents'),
      billingRequest<BillingList>({action:'list',accountId}),
    ]);
    const problems:string[]=[];
    if(catalogResult.status==='fulfilled'&&!catalogResult.value.error)setPlans(catalogResult.value.data||[]);
    else problems.push('Não foi possível carregar os planos.');
    if(billingResult.status==='fulfilled'){
      setSubscriptions(billingResult.value.checkoutSubscriptions||billingResult.value.subscriptions||[]);
      setTrialEligibleApps(billingResult.value.trialEligibleApps||[]);
      setReady(billingResult.value.ready);
    }else{
      setReady(null);
      problems.push('Não foi possível consultar a cobrança.');
    }
    setError(problems.join(' '));
  },[accountId]);

  useEffect(()=>{
    if(!accountId)return;
    setLoading(true);
    void load().catch(reason=>setError((reason as Error).message)).finally(()=>setLoading(false));
  },[accountId,load]);

  useEffect(()=>{
    setSkipTrial(false);
    setContinuationFailedPlan('');
  },[selected]);

  const entitlement=access.account?.apps.find(item=>item.appId===selected);
  const canOpen=access.hasApp(selected as Parameters<typeof access.hasApp>[0]);
  const currentSubscription=subscriptions.find(item=>item.app_id===selected&&['creating','pending','authorized','paused'].includes(item.status));
  const trialEligible=trialEligibleApps.includes(selected);
  const usingTrial=trialEligible&&!skipTrial;
  const expiredAccess=!!entitlement&&(!entitlement.currentPeriodEnd||Date.parse(entitlement.currentPeriodEnd)<=Date.now())&&!canOpen;
  const providerStillOpen=!!currentSubscription&&['authorized','paused'].includes(currentSubscription.status)&&!canOpen;
  const flow:'trial'|'activate'|'reactivate'=usingTrial?'trial':expiredAccess&&entitlement?.status!=='trialing'?'reactivate':'activate';
  const selectedAppName=apps.find(item=>item.slug===selected)?.name||selected;
  const actionLabel=flow==='trial'?'Testar grátis por 7 dias':flow==='reactivate'?`Reativar ${selectedAppName}`:`Ativar ${selectedAppName}`;

  const openCheckout=useCallback(async(planId:string,automatic=false)=>{
    if(!accountId||busy)return;
    const targetPlan=plans.find(plan=>plan.id===planId);
    if(!targetPlan){
      setError('O plano selecionado não está mais disponível.');
      if(automatic)setContinuationFailedPlan(planId);
      return;
    }
    const useTrial=trialEligibleApps.includes(targetPlan.app_id)&&!(targetPlan.app_id===selected&&skipTrial);
    setBusy(planId);
    setError('');
    setContinuationFailedPlan('');
    setNotice(automatic?'Conta confirmada. Abrindo o Mercado Pago…':'Abrindo o Mercado Pago…');
    try{
      const result=await billingRequest<{url?:string}>({action:'checkout',accountId,planId,skipTrial:!useTrial});
      if(!result.url)throw new Error('O Mercado Pago não retornou o link para continuar.');
      const url=new URL(result.url);
      if(url.protocol!=='https:'||!['www.mercadopago.com.br','mercadopago.com.br'].includes(url.hostname))throw new Error('Link de pagamento inválido.');
      if(automatic)window.location.replace(url.href); else window.location.assign(url.href);
    }catch(reason){
      setNotice('');
      setError((reason as Error).message||'Não foi possível abrir o Mercado Pago.');
      if(automatic)setContinuationFailedPlan(planId);
    }finally{setBusy('');}
  },[accountId,busy,plans,selected,skipTrial,trialEligibleApps]);

  const syncExisting=useCallback(async()=>{
    if(!accountId||!currentSubscription||busy)return;
    const key=currentSubscription.id+'sync';
    setBusy(key);setError('');setNotice('Conferindo sua assinatura com o Mercado Pago…');
    try{
      await billingRequest({action:'sync',accountId,subscriptionId:currentSubscription.id});
      await load();
      await access.refresh();
      setNotice('Status conferido. Se a cobrança pós-teste foi aprovada, o acesso já foi liberado.');
    }catch(reason){
      setNotice('');
      setError((reason as Error).message||'Não foi possível conferir a assinatura.');
    }finally{setBusy('');}
  },[accountId,currentSubscription,busy,load,access.refresh]);

  useEffect(()=>{
    if(!initialPlan||autoCheckoutStarted.current||!accountId||loading||ready!==true)return;
    const targetPlan=plans.find(plan=>plan.id===initialPlan);
    if(!targetPlan)return;
    const targetAccess=access.account?.apps.find(item=>item.appId===targetPlan.app_id);
    const accessStillValid=!!targetAccess&&['active','trialing'].includes(targetAccess.status)&&(!targetAccess.currentPeriodEnd||Date.parse(targetAccess.currentPeriodEnd)>Date.now());
    const openProvider=subscriptions.find(item=>item.app_id===targetPlan.app_id&&['authorized','paused'].includes(item.status));
    if(accessStillValid||targetAccess?.status==='suspended'||openProvider)return;
    autoCheckoutStarted.current=true;
    if(selected!==targetPlan.app_id)setSelected(targetPlan.app_id);
    void openCheckout(initialPlan,true);
  },[initialPlan,accountId,loading,ready,plans,access.account,selected,subscriptions,openCheckout]);

  if(!access.ready)return <p role="status">Carregando sua conta…</p>;
  if(!access.user){
    const destination=`/checkout?app=${selected}${initialPlan?`&plano=${encodeURIComponent(initialPlan)}`:''}`;
    const redirect=encodeURIComponent(destination);
    return <section className="billing-panel checkout-login"><span className="eyebrow">Continue de onde parou</span><h2>Entre para finalizar.</h2><p>Seu aplicativo e seu plano ficam preservados. Depois do login, abrimos o Mercado Pago automaticamente.</p><div className="billing-actions"><Link className="primary" href={`/login?redirect=${redirect}`}>Entrar</Link><Link className="ghost" href={`/cadastro?app=${selected}&redirect=${redirect}`}>Criar conta</Link></div></section>;
  }
  if(access.error||!access.account)return <section className="billing-panel"><h2>Não foi possível carregar sua conta.</h2><p>{access.error||'Conclua o cadastro da sua empresa para continuar.'}</p><Link className="ghost" href="/conta">Ir para minha conta</Link></section>;

  return <>
    <div className="billing-account"><div><span>Conta</span><strong>{access.account.name}</strong></div><div className="billing-actions"><Link href="/conta">Minha conta</Link><Link href="/assinaturas">Assinaturas</Link></div></div>
    {error&&<div className="billing-error" role="alert"><p>{error}</p><div className="billing-actions">{continuationFailedPlan&&<button className="primary" disabled={!!busy||ready!==true} onClick={()=>void openCheckout(continuationFailedPlan,true)}>Tentar abrir Mercado Pago</button>}<button className="ghost" disabled={loading} onClick={()=>{setLoading(true);void load().finally(()=>setLoading(false));}}>Atualizar</button></div></div>}
    {notice&&<p className="billing-notice" role="status">{notice}</p>}
    {loading?<p role="status">Carregando planos…</p>:<section className="billing-panel checkout-panel">
      <div className="checkout-step"><span>1</span><div><small>Aplicativo</small><strong>{selectedAppName}</strong></div></div>
      <label htmlFor="billing-app">Escolha seu aplicativo</label>
      <select id="billing-app" value={selected} onChange={event=>setSelected(event.target.value)}>{apps.map(app=><option value={app.slug} key={app.slug}>{app.name} — {app.category}</option>)}</select>

      <div className="billing-access-summary" role="status">
        <span className="eyebrow">Seu acesso</span>
        <h2>{canOpen?entitlement?.status==='trialing'?'Teste grátis já ativo':'Aplicativo já liberado':entitlement?.status==='suspended'?'Acesso suspenso':currentSubscription?.status==='pending'?'Autorização pendente':currentSubscription?.status==='authorized'&&expiredAccess?'Teste encerrado — aguardando a primeira cobrança':currentSubscription?.status==='authorized'?'Cobrança em processamento':currentSubscription?.status==='paused'?'Assinatura pausada':flow==='trial'?'Você pode testar por 7 dias':flow==='reactivate'?'Seu acesso expirou — reative quando quiser':'Ative seu aplicativo'}</h2>
        <p>{canOpen?'Você já possui acesso a este aplicativo.':currentSubscription?.status==='pending'?'Existe uma autorização pendente no Mercado Pago. Continue para concluir.':currentSubscription?.status==='authorized'?'A autorização já existe no Mercado Pago. Vamos conferir a cobrança antes de criar qualquer nova assinatura.':currentSubscription?.status==='paused'?'A assinatura existente está pausada. Gerencie essa assinatura antes de iniciar outra.':flow==='trial'?'Você pode autorizar 7 dias grátis no Mercado Pago ou optar por ativar com cobrança normal.':flow==='reactivate'?'Como este aplicativo já teve um período de acesso, a próxima contratação é uma reativação sem novo teste grátis.':'Escolha o ciclo e autorize a assinatura no Mercado Pago.'}</p>
        {canOpen&&<Link className="primary" href={`/${selected}`}>Abrir aplicativo</Link>}
        {!canOpen&&currentSubscription?.status==='pending'&&currentSubscription.plan_id&&<button className="primary" disabled={!!busy||ready!==true} onClick={()=>void openCheckout(currentSubscription.plan_id!)}>Continuar no Mercado Pago</button>}
        {!canOpen&&currentSubscription?.status==='authorized'&&<button className="primary" disabled={!!busy||ready!==true} onClick={()=>void syncExisting()}>{busy===currentSubscription.id+'sync'?'Conferindo…':'Conferir cobrança'}</button>}
        {!canOpen&&currentSubscription?.status==='paused'&&<Link className="primary" href="/assinaturas">Gerenciar assinatura</Link>}
      </div>

      {trialEligible&&<div className="billing-trial-identity" id="teste-gratis"><div className="billing-trial-heading"><span>7 DIAS GRÁTIS</span><h3>Teste autorizado pelo Mercado Pago</h3><p>O período grátis começa somente depois que você autorizar a assinatura no Mercado Pago. A primeira cobrança acontece após os 7 dias.</p></div>{!skipTrial?<><p className="billing-trial-status">A validação contra repetição usa a identidade do pagador e o meio de pagamento devolvidos pelo Mercado Pago.</p><button className="text-action billing-skip-trial" type="button" onClick={()=>setSkipTrial(true)}>Ativar agora sem teste grátis</button></>:<div className="billing-no-trial"><strong>Ativação imediata</strong><p>A cobrança começa conforme o ciclo escolhido.</p><button className="ghost" type="button" onClick={()=>setSkipTrial(false)}>Usar 7 dias grátis</button></div>}</div>}

      {!trialEligible&&!canOpen&&!providerStillOpen&&<div className="billing-no-trial"><strong>{flow==='reactivate'?'Reativação':'Ativação'}</strong><p>{flow==='reactivate'?'Seu período anterior terminou. Escolha um plano para voltar a usar o aplicativo.':'O teste grátis não está disponível para esta conta. Escolha um plano para ativar o aplicativo.'}</p></div>}

      <div className="checkout-step checkout-step-plan"><span>2</span><div><small>Plano</small><strong>Escolha o ciclo de cobrança</strong></div></div>
      <div className="billing-plans">{plans.filter(plan=>plan.app_id===selected).map(plan=><article key={plan.id} className={initialPlan===plan.id?'is-selected':undefined}>
        <h2>{cycles[plan.billing_interval]}{initialPlan===plan.id?' · Selecionado':''}</h2><strong>{money(plan.amount_cents)}</strong><p>{usingTrial?'7 dias grátis. Depois, ':''}{plan.billing_interval==='monthly'?'cobrança mensal':plan.billing_interval==='semiannual'?'cobrança a cada 6 meses':'cobrança a cada 12 meses'} com renovação automática.</p><button className="primary" disabled={!!busy||ready!==true||canOpen||entitlement?.status==='suspended'||providerStillOpen} onClick={()=>void openCheckout(plan.id)}>{busy===plan.id?'Abrindo Mercado Pago…':canOpen?'Acesso já liberado':providerStillOpen?'Assinatura já existente':actionLabel}</button>
      </article>)}</div>
      <p className="billing-caption">Fluxo: escolher aplicativo → ver preços → testar, ativar ou reativar conforme o histórico real da conta → autorizar no Mercado Pago → liberar acesso.</p>
    </section>}
  </>;
}
