'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { billingRequest } from '@/lib/billing';

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

type BillingList = {
  subscriptions: Subscription[];
  payments?: Payment[];
  ready: boolean;
};

const money=(cents:number)=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('pt-BR'):'—';
const cycle=(frequency:number)=>frequency===1?'Mensal':frequency===6?'Semestral':frequency===12?'Anual':`A cada ${frequency} meses`;
const paymentStatus:Record<string,string>={approved:'Pago',pending:'Pendente',in_process:'Em processamento',rejected:'Recusado',refunded:'Estornado',cancelled:'Cancelado',charged_back:'Contestado'};
const serviceEnd=(subscription:Subscription)=>subscription.current_period_end||subscription.trial_ends_at;

export function BillingPortal({returned=false}:{returned?:boolean}){
  const access=useStoreAccess();
  const accountId=access.account?.id;
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [payments,setPayments]=useState<Payment[]>([]);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState<boolean|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState(returned?'Retorno recebido. Conferindo sua assinatura no Mercado Pago…':'');

  const load=useCallback(async()=>{
    if(!accountId)return;
    const result=await billingRequest<BillingList>({action:'list',accountId});
    setSubscriptions(result.subscriptions||[]);
    setPayments(result.payments||[]);
    setReady(result.ready);
  },[accountId]);

  useEffect(()=>{
    if(!accountId)return;
    setLoading(true);
    void load().catch(reason=>setError((reason as Error).message||'Não foi possível carregar suas assinaturas.')).finally(()=>setLoading(false));
  },[accountId,load]);

  useEffect(()=>{
    if(!returned||!accountId)return;
    let attempts=0;
    const timer=window.setInterval(()=>{
      attempts+=1;
      void load().then(()=>access.refresh()).catch(()=>{});
      if(attempts>=8)window.clearInterval(timer);
    },4000);
    return()=>window.clearInterval(timer);
  },[returned,accountId,load,access.refresh]);

  const appAccess=useMemo(()=>new Map((access.account?.apps||[]).map(item=>[item.appId,item])),[access.account]);
  const paidSubscriptionIds=useMemo(()=>new Set(payments.filter(item=>item.status==='approved').map(item=>item.subscription_id)),[payments]);
  const activatedSubscriptions=useMemo(()=>subscriptions.filter(item=>!!item.trial_ends_at||!!item.current_period_end||paidSubscriptionIds.has(item.id)),[subscriptions,paidSubscriptionIds]);
  const current=useMemo(()=>activatedSubscriptions.filter(item=>{
    const end=serviceEnd(item);
    if(item.status==='failed')return false;
    if(item.status!=='cancelled')return true;
    return !!end&&Date.parse(end)>Date.now();
  }),[activatedSubscriptions]);
  const history=useMemo(()=>activatedSubscriptions.filter(item=>{
    if(item.status!=='cancelled')return false;
    const end=serviceEnd(item);
    return !end||Date.parse(end)<=Date.now();
  }),[activatedSubscriptions]);
  const activeApps=access.account?.apps.filter(item=>['active','trialing'].includes(item.status)&&(!item.currentPeriodEnd||Date.parse(item.currentPeriodEnd)>Date.now()))||[];
  const trialCount=activeApps.filter(item=>item.status==='trialing').length;
  const nextEvent=activeApps.map(item=>item.currentPeriodEnd).filter((value):value is string=>!!value&&Date.parse(value)>Date.now()).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]||null;

  async function act(action:'sync'|'cancel',subscription:Subscription){
    if(!accountId||busy)return;
    if(action==='cancel'&&!window.confirm('Cancelar as próximas cobranças desta assinatura? O acesso já liberado permanece até o fim do período vigente.'))return;
    setBusy(subscription.id+action);
    setError('');
    setNotice('');
    try{
      await billingRequest({action,accountId,subscriptionId:subscription.id});
      await load();
      await access.refresh();
      setNotice(action==='cancel'?'Renovação cancelada. O período já liberado continua disponível até vencer.':'Status atualizado com o Mercado Pago.');
    }catch(reason){setError((reason as Error).message||'Não foi possível atualizar a assinatura.');}
    finally{setBusy('');}
  }

  if(!access.ready||loading)return <div className="billing-portal-loading">Carregando sua central de cobrança…</div>;
  if(!access.user)return <section className="billing-portal-empty"><span className="account-kicker">Área protegida</span><h2>Entre para gerenciar suas assinaturas.</h2><p>A cobrança pertence à sua conta CRM PLUS.</p><Link className="primary" href="/login?redirect=%2Fassinaturas">Entrar</Link></section>;
  if(access.error||!access.account)return <section className="billing-portal-empty"><h2>Não foi possível carregar sua conta.</h2><p>{access.error||'Conta não encontrada.'}</p><Link className="ghost" href="/conta">Voltar para minha conta</Link></section>;

  return <>
    {error&&<div className="billing-portal-message is-error"><p>{error}</p><button className="ghost" onClick={()=>{setLoading(true);void load().finally(()=>setLoading(false));}}>Tentar novamente</button></div>}
    {notice&&<div className="billing-portal-message"><CheckCircle2 size={17}/><span>{notice}</span></div>}

    <section className="billing-overview" aria-label="Resumo de cobrança">
      <article><div className="billing-overview-icon"><ShieldCheck size={18}/></div><div><span>Aplicativos com acesso</span><strong>{activeApps.length}</strong><small>Assinatura ou teste vigente</small></div></article>
      <article><div className="billing-overview-icon"><Clock3 size={18}/></div><div><span>Testes ativos</span><strong>{trialCount}</strong><small>{trialCount?'Autorizados pelo Mercado Pago':'Nenhum teste em andamento'}</small></div></article>
      <article><div className="billing-overview-icon"><CreditCard size={18}/></div><div><span>Próximo evento</span><strong className="is-date">{nextEvent?date(nextEvent):'Sem cobrança prevista'}</strong><small>Renovação ou fim do período atual</small></div></article>
    </section>

    <section className="billing-management-card">
      <div className="account-section-heading"><div><span className="account-kicker">Assinaturas</span><h2>Assinaturas da sua empresa</h2><p>Somente testes realmente ativados e períodos efetivamente liberados aparecem aqui. Aberturas e cancelamentos de checkout sem ativação não viram histórico.</p></div><Link className="primary small" href="/aplicativos">Adicionar aplicativo <ArrowRight size={15}/></Link></div>
      {ready===false&&<div className="billing-portal-message is-warning">A integração de cobrança está temporariamente indisponível.</div>}
      {current.length===0?<div className="billing-portal-empty is-inline"><h3>Nenhuma assinatura ativa ou período vigente.</h3><p>Escolha um aplicativo na Store para testar, ativar ou reativar.</p><Link className="primary" href="/aplicativos">Explorar aplicativos</Link></div>:<div className="billing-current-list">{current.map(subscription=>{
        const app=apps.find(item=>item.slug===subscription.app_id);
        const entitlement=appAccess.get(subscription.app_id as AppId);
        const hasAccess=access.hasApp(subscription.app_id as AppId);
        const end=serviceEnd(subscription);
        const trialActive=entitlement?.status==='trialing'&&!!entitlement.currentPeriodEnd&&Date.parse(entitlement.currentPeriodEnd)>Date.now();
        const remaining=subscription.status==='cancelled'&&!!end&&Date.parse(end)>Date.now();
        const label=trialActive?'Teste grátis ativo':subscription.status==='authorized'?'Ativa':subscription.status==='paused'?'Pausada':remaining?'Renovação cancelada':'Ativa';
        const tone=trialActive||subscription.status==='authorized'?'is-good':subscription.status==='paused'||remaining?'is-neutral':'';
        return <article className="billing-product" key={subscription.id}>
          <div className="billing-product-main"><div className="billing-product-title"><div><span className={`billing-status ${tone}`}>{label}</span><h3>{app?.name||subscription.app_id}</h3><p>{app?.category||'Aplicativo CRM PLUS'}</p></div><div className="billing-price"><strong>{money(subscription.amount_cents)}</strong><span>{cycle(subscription.frequency)}</span></div></div>
          <div className="billing-product-meta"><div><span>Período</span><strong>{trialActive?`Teste até ${date(entitlement?.currentPeriodEnd||subscription.trial_ends_at)}`:end?`Até ${date(end)}`:'Sem período vigente'}</strong></div><div><span>Cobrança</span><strong>Mercado Pago</strong></div><div><span>Renovação</span><strong>{remaining?'Desativada':subscription.status==='paused'?'Pausada':'Automática'}</strong></div></div></div>
          <div className="billing-product-actions">
            {subscription.status!=='creating'&&<button className="ghost" disabled={!!busy||ready!==true} onClick={()=>void act('sync',subscription)}>{busy===subscription.id+'sync'?<><RefreshCw size={14}/> Atualizando…</>:'Atualizar status'}</button>}
            {['authorized','paused'].includes(subscription.status)&&<button className="text-danger" disabled={!!busy||ready!==true} onClick={()=>void act('cancel',subscription)}>Cancelar renovação</button>}
            {hasAccess&&<Link className="ghost" href={`/${subscription.app_id}`}>Abrir aplicativo <ArrowRight size={14}/></Link>}
          </div>
        </article>;
      })}</div>}
    </section>

    <section className="billing-management-card">
      <div className="account-section-heading"><div><span className="account-kicker">Pagamentos</span><h2>Histórico financeiro</h2><p>Cobranças confirmadas pelo Mercado Pago vinculadas às suas assinaturas.</p></div></div>
      {payments.length===0?<p className="billing-muted">Nenhum pagamento recorrente registrado ainda.</p>:<div className="billing-payments">{payments.slice(0,12).map(payment=>{
        const subscription=subscriptions.find(item=>item.id===payment.subscription_id);
        const app=apps.find(item=>item.slug===subscription?.app_id);
        return <div className="billing-payment-row" key={payment.id}><div><strong>{app?.name||'CRM PLUS'}</strong><span>{payment.paid_at?date(payment.paid_at):'Aguardando processamento'}</span></div><div><strong>{money(payment.amount_cents)}</strong><span>{paymentStatus[payment.status]||payment.status}</span></div></div>;
      })}</div>}
    </section>

    {history.length>0&&<section className="billing-history"><details><summary>Assinaturas encerradas <span>{history.length}</span></summary><div>{history.slice(0,12).map(subscription=><div className="billing-history-row" key={subscription.id}><span>{apps.find(item=>item.slug===subscription.app_id)?.name||subscription.app_id}</span><span>{cycle(subscription.frequency)}</span><span>{money(subscription.amount_cents)}</span><span>Encerrada em {date(serviceEnd(subscription)||subscription.created_at)}</span></div>)}</div></details></section>}
  </>;
}
