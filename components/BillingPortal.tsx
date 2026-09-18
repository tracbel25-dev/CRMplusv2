'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { billingRequest } from '@/lib/billing';
import { createStoreClient } from '@/lib/supabase/storeClient';

type Subscription = {
  id: string;
  app_id: string;
  plan_id: string | null;
  status: string;
  amount_cents: number;
  frequency: number;
  current_period_end: string | null;
  trial_requested: boolean;
  trial_ends_at: string | null;
  created_at: string;
};

type Payment = {
  id: string;
  subscription_id: string;
  status: string;
  amount_cents: number;
  paid_at: string | null;
  period_end: string | null;
};

type TrialRequest = {
  id: string;
  app_id: string;
  plan_id: string | null;
  status: 'requested'|'validating'|'validation_pending'|'activated'|'blocked';
  requested_at: string;
  updated_at: string;
  activated_at: string | null;
};

type PlanInfo = { id:string; plan_code:string|null; amount_cents:number; seats:number };

type BillingList = {
  subscriptions: Subscription[];
  attempts?: Subscription[];
  checkoutSubscriptions?: Subscription[];
  payments?: Payment[];
  trialRequests?: TrialRequest[];
  ready: boolean;
};

const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('pt-BR'):'—';
const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const cycle=(frequency:number)=>frequency===1?'Mensal':frequency===6?'Semestral':frequency===12?'Anual':`A cada ${frequency} meses`;
const paymentStatus:Record<string,string>={approved:'Pago',pending:'Pendente',in_process:'Em processamento',rejected:'Recusado',refunded:'Estornado',cancelled:'Cancelado',charged_back:'Contestado'};
const attemptStatus:Record<string,string>={creating:'Preparando contratação',pending:'Pagamento pendente',authorized:'Autorizada',paused:'Pausada',failed:'Não concluída',cancelled:'Cancelada'};
const serviceEnd=(subscription:Subscription)=>subscription.current_period_end||subscription.trial_ends_at;

export function BillingPortal({returned=false}:{returned?:boolean}){
  const access=useStoreAccess();
  const accountId=access.account?.id;
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [attempts,setAttempts]=useState<Subscription[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [trialRequests,setTrialRequests]=useState<TrialRequest[]>([]);
  const [plans,setPlans]=useState<PlanInfo[]>([]);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState<boolean|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState(returned?'Retorno recebido. Conferindo sua assinatura…':'');

  const load=useCallback(async()=>{
    if(!accountId)return;
    const result=await billingRequest<BillingList>({action:'list',accountId});
    setSubscriptions(result.subscriptions||[]);
    setAttempts(result.attempts||result.checkoutSubscriptions||[]);
    setPayments(result.payments||[]);
    const nextTrials=result.trialRequests||[];
    setTrialRequests(nextTrials);
    setReady(result.ready);
    const planIds=Array.from(new Set([
      ...(result.subscriptions||[]).map(item=>item.plan_id),
      ...(result.attempts||result.checkoutSubscriptions||[]).map(item=>item.plan_id),
      ...nextTrials.map(item=>item.plan_id),
      ...(access.account?.apps||[]).map(item=>item.planId),
    ].filter((value):value is string=>!!value)));
    if(planIds.length){
      const supabase=createStoreClient();
      const {data}=await supabase.from('plans').select('id,plan_code,amount_cents,seats').in('id',planIds);
      setPlans((data||[]) as PlanInfo[]);
    }else setPlans([]);
  },[accountId,access.account?.apps]);

  useEffect(()=>{
    if(!accountId)return;
    setLoading(true);
    void load().catch(reason=>setError((reason as Error).message||'Não foi possível carregar suas assinaturas.')).finally(()=>setLoading(false));
  },[accountId,load]);

  useEffect(()=>{
    if(!returned||!accountId)return;
    let count=0;
    const timer=window.setInterval(()=>{
      count+=1;
      void load().then(()=>access.refresh()).catch(()=>{});
      if(count>=8)window.clearInterval(timer);
    },4000);
    return()=>window.clearInterval(timer);
  },[returned,accountId,load,access.refresh]);

  const appAccess=useMemo(()=>new Map((access.account?.apps||[]).map(item=>[item.appId,item])),[access.account]);
  const planById=useMemo(()=>new Map(plans.map(item=>[item.id,item])),[plans]);
  const planLabel=(planId:string|null)=>{const code=planId?planById.get(planId)?.plan_code:null;return code?code.charAt(0).toUpperCase()+code.slice(1):null;};
  const paidSubscriptionIds=useMemo(()=>new Set(payments.filter(item=>item.status==='approved').map(item=>item.subscription_id)),[payments]);
  const activatedSubscriptions=useMemo(()=>subscriptions.filter(item=>!!item.trial_ends_at||!!item.current_period_end||paidSubscriptionIds.has(item.id)),[subscriptions,paidSubscriptionIds]);
  const current=useMemo(()=>activatedSubscriptions.filter(item=>{
    const end=serviceEnd(item);
    return !!end&&Date.parse(end)>Date.now();
  }),[activatedSubscriptions]);
  const history=useMemo(()=>activatedSubscriptions.filter(item=>{
    const end=serviceEnd(item);
    return !!end&&Date.parse(end)<=Date.now();
  }),[activatedSubscriptions]);
  const openAttempts=useMemo(()=>attempts.filter(item=>['creating','pending'].includes(item.status)),[attempts]);
  const closedAttempts=useMemo(()=>attempts.filter(item=>['failed','cancelled'].includes(item.status)),[attempts]);
  const pendingTrialRequests=useMemo(()=>trialRequests.filter(item=>['requested','validating','validation_pending'].includes(item.status)),[trialRequests]);
  const activeApps=access.account?.apps.filter(item=>['active','trialing'].includes(item.status)&&(!item.currentPeriodEnd||Date.parse(item.currentPeriodEnd)>Date.now()))||[];
  const currentAppIds=new Set(current.map(item=>item.app_id));
  const directActiveApps=activeApps.filter(item=>!currentAppIds.has(item.appId));
  const trialCount=activeApps.filter(item=>item.status==='trialing').length;
  const nextEvent=activeApps.map(item=>item.currentPeriodEnd).filter((value):value is string=>!!value&&Date.parse(value)>Date.now()).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null;

  async function act(action:'sync'|'cancel',subscription:Subscription){
    if(!accountId||busy)return;
    const cancellingPending=action==='cancel'&&['creating','pending'].includes(subscription.status);
    if(action==='cancel'&&!window.confirm(cancellingPending?'Cancelar esta tentativa de contratação?':'Cancelar as próximas cobranças desta assinatura? O acesso já liberado permanece até o fim do período vigente.'))return;
    setBusy(subscription.id+action);
    setError('');
    setNotice('');
    try{
      await billingRequest({action,accountId,subscriptionId:subscription.id});
      await load();
      await access.refresh();
      setNotice(action==='cancel'?(cancellingPending?'Tentativa cancelada.':'Renovação cancelada. O período já liberado continua disponível até vencer.'):'Status atualizado.');
    }catch(reason){setError((reason as Error).message||'Não foi possível atualizar a assinatura.');}
    finally{setBusy('');}
  }

  if(!access.ready||loading)return <div className="billing-portal-loading">Carregando sua central de cobrança…</div>;
  if(!access.user)return <section className="billing-portal-empty"><span className="account-kicker">Área protegida</span><h2>Entre para gerenciar suas assinaturas.</h2><p>A cobrança pertence à sua conta CRM PLUS.</p><Link className="primary" href="/login?redirect=%2Fassinaturas">Entrar</Link></section>;
  if(access.error||!access.account)return <section className="billing-portal-empty"><h2>Não foi possível carregar sua conta.</h2><p>{access.error||'Conta não encontrada.'}</p><Link className="ghost" href="/conta">Voltar para minha conta</Link></section>;

  return <>
    {error&&<div className="billing-portal-message is-error"><p>{error}</p><button className="ghost" onClick={()=>{setLoading(true);void load().finally(()=>setLoading(false));}}>Tentar novamente</button></div>}
    {notice&&<div className="billing-portal-message"><CheckCircle2 size={17}/><span>{notice}</span></div>}

    {(current.length>0||openAttempts.length>0||pendingTrialRequests.length>0||activeApps.length>0)&&<section className="billing-overview" aria-label="Resumo de cobrança">
      <article><div className="billing-overview-icon"><ShieldCheck size={18}/></div><div><span>Aplicativos com acesso</span><strong>{activeApps.length}</strong><small>Assinatura ou teste vigente</small></div></article>
      <article><div className="billing-overview-icon"><Clock3 size={18}/></div><div><span>Testes ativos</span><strong>{trialCount}</strong><small>{trialCount?'Períodos gratuitos em andamento':'Nenhum teste em andamento'}</small></div></article>
      <article><div className="billing-overview-icon"><CreditCard size={18}/></div><div><span>{pendingTrialRequests.length?'Teste em validação':openAttempts.length?'Contratação pendente':'Próximo evento'}</span><strong className="is-date">{pendingTrialRequests.length?`${pendingTrialRequests.length} solicitação${pendingTrialRequests.length>1?'ões':''}`:openAttempts.length?`${openAttempts.length} pendente${openAttempts.length>1?'s':''}`:nextEvent?date(nextEvent):'Sem cobrança prevista'}</strong><small>{pendingTrialRequests.length?'Aguardando confirmação':openAttempts.length?'Aguardando conclusão':'Renovação ou fim do período atual'}</small></div></article>
    </section>}

    {pendingTrialRequests.length>0&&<section className="billing-management-card billing-pending-section">
      <div className="account-section-heading"><div><span className="account-kicker">Testes</span><h2>Solicitações em validação</h2><p>Solicitações recebidas que ainda precisam ser confirmadas.</p></div></div>
      <div className="billing-attempt-list">{pendingTrialRequests.map(item=>{
        const app=apps.find(row=>row.slug===item.app_id);
        const label=item.status==='validation_pending'?'Validação pendente':item.status==='validating'?'Validando solicitação':'Teste solicitado';
        return <article className="billing-attempt" key={item.id}>
          <Clock3 size={18}/>
          <div><span className="billing-status is-waiting">{label}</span><h3>{app?.name||item.app_id}</h3><p>Solicitado em {dateTime(item.requested_at)}</p></div>
          <div className="billing-attempt-actions">{item.plan_id&&<Link className="primary small" href={`/checkout?app=${encodeURIComponent(item.app_id)}&plano=${encodeURIComponent(item.plan_id)}`}>Confirmar teste <ArrowRight size={14}/></Link>}</div>
        </article>;
      })}</div>
    </section>}

    {openAttempts.length>0&&<section className="billing-management-card billing-pending-section">
      <div className="account-section-heading"><div><span className="account-kicker">Pendências</span><h2>Contratações pendentes</h2><p>Existe contratação iniciada que ainda não liberou o aplicativo.</p></div></div>
      <div className="billing-attempt-list">{openAttempts.map(item=>{
        const app=apps.find(row=>row.slug===item.app_id);
        return <article className="billing-attempt" key={item.id}>
          <AlertTriangle size={18}/>
          <div><span className="billing-status is-waiting">{attemptStatus[item.status]||'Pendente'}</span><h3>{app?.name||item.app_id}</h3><p>{money(item.amount_cents)} · {cycle(item.frequency)} · iniciada em {dateTime(item.created_at)}</p></div>
          <div className="billing-attempt-actions">
            {item.plan_id&&<Link className="primary small" href={`/checkout?app=${encodeURIComponent(item.app_id)}&plano=${encodeURIComponent(item.plan_id)}`}>Continuar <ArrowRight size={14}/></Link>}
            {item.status==='pending'&&<button className="ghost small" disabled={!!busy||ready!==true} onClick={()=>void act('cancel',item)}>Cancelar</button>}
          </div>
        </article>;
      })}</div>
    </section>}

    <section className="billing-management-card">
      <div className="account-section-heading"><div><span className="account-kicker">Assinaturas</span><h2>Planos ativos</h2><p>Somente acessos efetivamente liberados aparecem como ativos.</p></div><Link className="primary small" href="/planos">Ver planos <ArrowRight size={15}/></Link></div>
      {ready===false&&<div className="billing-portal-message is-warning">A integração de cobrança está temporariamente indisponível.</div>}
      {current.length===0&&activeApps.length===0?<div className="billing-portal-empty is-inline"><h3>Nenhum plano ativo.</h3><p>{pendingTrialRequests.length?'Seu teste foi solicitado e ainda está em validação.':openAttempts.length?'Conclua a pendência acima para liberar o acesso.':'Escolha um plano ou teste disponível para começar.'}</p>{pendingTrialRequests.length===0&&openAttempts.length===0&&<Link className="primary" href="/planos">Ver planos</Link>}</div>:<div className="billing-current-list">{current.map(subscription=>{
        const app=apps.find(item=>item.slug===subscription.app_id);
        const entitlement=appAccess.get(subscription.app_id as AppId);
        const hasAccess=access.hasApp(subscription.app_id as AppId);
        const end=serviceEnd(subscription);
        const trialActive=entitlement?.status==='trialing'&&!!entitlement.currentPeriodEnd&&Date.parse(entitlement.currentPeriodEnd)>Date.now();
        const remaining=subscription.status==='cancelled';
        const label=trialActive?'Teste grátis ativo':subscription.status==='authorized'?'Ativa':subscription.status==='paused'?'Pausada':remaining?'Renovação cancelada':'Ativa';
        const tone=trialActive||subscription.status==='authorized'?'is-good':subscription.status==='paused'||remaining?'is-neutral':'';
        return <article className="billing-product" key={subscription.id}>
          <div className="billing-product-main"><div className="billing-product-title"><div><span className={`billing-status ${tone}`}>{label}</span><h3>{app?.name||subscription.app_id}</h3><p>{app?.category||'Aplicativo CRM PLUS'}{planLabel(subscription.plan_id)?` · Plano ${planLabel(subscription.plan_id)}`:''}</p></div><div className="billing-price"><strong>{money(subscription.amount_cents)}</strong><span>{cycle(subscription.frequency)}</span></div></div>
          <div className="billing-product-meta"><div><span>Período</span><strong>{trialActive?`Teste até ${date(entitlement?.currentPeriodEnd||subscription.trial_ends_at)}`:`Até ${date(end)}`}</strong></div><div><span>Renovação</span><strong>{remaining?'Desativada':subscription.status==='paused'?'Pausada':'Automática'}</strong></div></div></div>
          <div className="billing-product-actions">
            {subscription.status!=='creating'&&subscription.status!=='cancelled'&&<button className="ghost" disabled={!!busy||ready!==true} onClick={()=>void act('sync',subscription)}>{busy===subscription.id+'sync'?<><RefreshCw size={14}/> Atualizando…</>:'Atualizar status'}</button>}
            {['authorized','paused'].includes(subscription.status)&&<button className="text-danger" disabled={!!busy||ready!==true} onClick={()=>void act('cancel',subscription)}>Cancelar renovação</button>}
            {hasAccess&&<Link className="ghost" href={`/${subscription.app_id}`}>Abrir aplicativo <ArrowRight size={14}/></Link>}
          </div>
        </article>;
      })}
      {directActiveApps.map(entitlement=>{
        const app=apps.find(item=>item.slug===entitlement.appId);
        const trialActive=entitlement.status==='trialing';
        const trialRequest=trialRequests.find(item=>item.app_id===entitlement.appId&&item.status==='activated');
        const directPlanId=entitlement.planId||trialRequest?.plan_id||null;
        const directPlan=directPlanId?planById.get(directPlanId):undefined;
        const directPlanName=planLabel(directPlanId);
        return <article className="billing-product" key={`direct-${entitlement.appId}`}>
          <div className="billing-product-main">
            <div className="billing-product-title">
              <div><span className="billing-status is-good">{trialActive?'Teste grátis ativo':'Acesso ativo'}</span><h3>{app?.name||entitlement.appId}</h3><p>{app?.category||'Aplicativo CRM PLUS'}{directPlanName?` · Plano ${directPlanName}`:''}</p></div>
              <div className="billing-price"><strong>{directPlanName?`Plano ${directPlanName}`:trialActive?'7 dias':'Ativo'}</strong><span>{directPlan?`${money(directPlan.amount_cents)}/mês após o teste · ${directPlan.seats} ${directPlan.seats===1?'acesso':'acessos'}`:trialActive?'Sem cobrança durante o teste':'Acesso liberado'}</span></div>
            </div>
            <div className="billing-product-meta">
              <div><span>Período</span><strong>{trialActive?`Teste até ${date(entitlement.currentPeriodEnd)}`:entitlement.currentPeriodEnd?`Até ${date(entitlement.currentPeriodEnd)}`:'Ativo'}</strong></div>
              <div><span>Próximo passo</span><strong>{trialActive?'Assinar após o teste':'Nenhuma ação necessária'}</strong></div>
            </div>
          </div>
          <div className="billing-product-actions"><Link className="ghost" href={`/${entitlement.appId}`}>Abrir aplicativo <ArrowRight size={14}/></Link></div>
        </article>;
      })}</div>}
    </section>

    <section className="billing-management-card">
      <div className="account-section-heading"><div><span className="account-kicker">Pagamentos</span><h2>Histórico financeiro</h2><p>Pagamentos confirmados vinculados às suas assinaturas.</p></div></div>
      {payments.length===0?<p className="billing-muted">Nenhum pagamento confirmado ainda.</p>:<div className="billing-payments">{payments.slice(0,12).map(payment=>{
        const subscription=attempts.find(item=>item.id===payment.subscription_id)||subscriptions.find(item=>item.id===payment.subscription_id);
        const app=apps.find(item=>item.slug===subscription?.app_id);
        return <div className="billing-payment-row" key={payment.id}><div><strong>{app?.name||'CRM PLUS'}</strong><span>{payment.paid_at?date(payment.paid_at):'Aguardando processamento'}</span></div><div><strong>{money(payment.amount_cents)}</strong><span>{paymentStatus[payment.status]||payment.status}</span></div></div>;
      })}</div>}
    </section>

    {(closedAttempts.length>0||history.length>0)&&<section className="billing-history"><details open><summary>Histórico de contratações <span>{closedAttempts.length+history.length}</span></summary><div>
      {closedAttempts.slice(0,12).map(item=><div className="billing-history-row" key={item.id}><span>{apps.find(app=>app.slug===item.app_id)?.name||item.app_id}</span><span>{attemptStatus[item.status]||item.status}</span><span>{money(item.amount_cents)}</span><span>{dateTime(item.created_at)}</span></div>)}
      {history.slice(0,12).map(subscription=>{const end=serviceEnd(subscription);return <div className="billing-history-row" key={subscription.id}><span>{apps.find(item=>item.slug===subscription.app_id)?.name||subscription.app_id}</span><span>Período encerrado</span><span>{money(subscription.amount_cents)}</span><span>{date(end||subscription.created_at)}</span></div>;})}
    </div></details></section>}
  </>;
}
