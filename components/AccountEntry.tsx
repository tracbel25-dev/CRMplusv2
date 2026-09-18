'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Building2, CreditCard, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { apps } from '@/lib/catalog';
import { clientMessage } from '@/lib/clientMessage';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { AppArtwork } from './AppArtwork';
import { AccountNav } from './AccountNav';

const validAccess = (status: string, end: string | null) => ['trialing', 'active'].includes(status) && (!end || Date.parse(end) > Date.now());

export function AccountEntry(){
  const access=useStoreAccess();
  if(!access.ready)return <div className="entry-loading">Carregando sua conta…</div>;
  if(!access.user)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Entre para acessar sua conta.</h1><p>Gerencie aplicativos, assinaturas e os dados da sua conta em um único lugar.</p><div className="entry-empty-actions"><Link className="primary" href="/login?redirect=%2Fconta">Entrar</Link><Link className="ghost" href="/cadastro?redirect=%2Fconta">Criar conta</Link></div></div>;
  if(access.error)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Não foi possível carregar a conta.</h1><p>{clientMessage(access.error,'Tente novamente em alguns instantes.')}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></div>;
  if(!access.account||!access.member)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Conclua os dados da sua conta.</h1><p>Seu cadastro existe, mas ainda precisa ser concluído.</p><Link className="primary" href="/minhas-informacoes">Completar cadastro</Link></div>;

  const activeRows=access.account.apps.filter(item=>validAccess(item.status,item.currentPeriodEnd));
  const contractedIds=new Set(activeRows.map(item=>item.appId));
  const contracted=apps.filter(app=>contractedIds.has(app.slug as AppId));
  const trials=activeRows.filter(item=>item.status==='trialing').length;
  const firstName=String(access.member.displayName||'Cliente').trim().split(/\s+/)[0]||'Cliente';
  const isPJ=access.account.personType==='pj';
  const missingData=[
    ...(access.identityStatus?.registered===true?[]:['CPF do titular']),
    ...(isPJ&&access.account.cnpj?[]:isPJ?['CNPJ da empresa']:[]),
  ];

  return <>
    <AccountNav/>

    {missingData.length>0&&<section className="account-data-alert">
      <AlertTriangle size={18}/>
      <div><strong>Cadastro com pendências</strong><p>Complete {missingData.join(' e ')} para manter os dados da conta consistentes.</p></div>
      <Link className="ghost small" href="/minhas-informacoes">Atualizar informações</Link>
    </section>}

    <section className="account-hero">
      <div className="account-hero-copy"><span className="account-kicker">Área do cliente</span><h1>Olá, {firstName}.</h1><p>Central da conta <strong>{access.account.name}</strong>.</p></div>
      <div className="account-status"><ShieldCheck size={18}/><div><small>Status do cadastro</small><strong>{access.account.status==='active'?'Concluído':access.account.status==='suspended'?'Suspenso':'Encerrado'}</strong></div></div>
    </section>

    {contracted.length>0&&<section className="account-metrics" aria-label="Resumo da conta">
      <article><span>Aplicativos ativos</span><strong>{contracted.length}</strong><p>Produtos liberados para esta conta.</p></article>
      <article><span>Testes ativos</span><strong>{trials}</strong><p>Períodos gratuitos vigentes.</p></article>
      <article><span>Perfil</span><strong>{access.isOwner?'Titular':'Usuário'}</strong><p>{access.isOwner?'Responsável pela conta e cobrança.':'Acesso definido pelo titular.'}</p></article>
    </section>}

    <div className="account-dashboard-grid">
      <section className="account-products">
        <div className="account-section-heading"><div><span className="account-kicker">Produtos</span><h2>{contracted.length?'Seus aplicativos':'Comece por um aplicativo'}</h2><p>{contracted.length?'Abra somente os aplicativos ativos e liberados para o seu usuário.':'Escolha um plano ou teste disponível para liberar o primeiro aplicativo.'}</p></div><Link className="account-link" href="/aplicativos">{contracted.length?'Adicionar aplicativo':'Explorar aplicativos'} <ArrowRight size={15}/></Link></div>
        {contracted.length===0?<div className="account-empty-product"><h3>Nenhum plano ativo.</h3><p>Você ainda não possui aplicativo liberado nesta conta.</p><Link className="primary" href="/planos">Ver planos <ArrowRight size={16}/></Link></div>:<div className="entry-grid">{contracted.map(app=>{
          const allowed=access.hasApp(app.slug as AppId);
          return allowed
            ? <Link href={`/${app.slug}`} key={app.slug} className={`entry-app entry-${app.tone}`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h3>{app.name}</h3><span>Abrir aplicativo <ArrowRight size={17}/></span></div></Link>
            : <article key={app.slug} className={`entry-app entry-${app.tone} is-locked`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h3>{app.name}</h3><span>Sem acesso para este usuário</span></div></article>;
        })}</div>}
      </section>

      <aside className="account-profile-card">
        <span className="account-kicker">Conta</span><h2>Dados principais</h2>
        <dl>
          <div><dt><Building2 size={15}/> {isPJ?'Empresa':'Negócio'}</dt><dd>{access.account.name}</dd></div>
          <div><dt><Mail size={15}/> E-mail</dt><dd>{access.user.email||'—'}</dd></div>
          <div><dt><ShieldCheck size={15}/> Perfil</dt><dd>{access.isOwner?'Titular':'Usuário'}</dd></div>
        </dl>
        <Link className="account-profile-action" href="/assinaturas"><CreditCard size={16}/><span><strong>Assinaturas e cobrança</strong><small>Planos, renovações e pagamentos</small></span><ArrowRight size={16}/></Link>
        <button className="account-profile-action is-button" onClick={()=>void access.logout()}><LogOut size={16}/><span><strong>Sair da conta</strong><small>Sair deste dispositivo</small></span></button>
      </aside>
    </div>
  </>;
}
