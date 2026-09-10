'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CreditCard, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { AppArtwork } from './AppArtwork';
import { AccountNav } from './AccountNav';

const validAccess = (status: string, end: string | null) => ['trialing', 'active'].includes(status) && (!end || Date.parse(end) > Date.now());

export function AccountEntry(){
  const access=useStoreAccess();
  if(!access.ready)return <div className="entry-loading">Carregando sua conta…</div>;
  if(!access.user)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Entre para acessar sua conta.</h1><p>Gerencie aplicativos, assinaturas e os dados da sua empresa em um único lugar.</p><div className="entry-empty-actions"><Link className="primary" href="/login?redirect=%2Fconta">Entrar</Link><Link className="ghost" href="/cadastro?redirect=%2Fconta">Criar conta</Link></div></div>;
  if(access.error)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Não foi possível carregar a conta.</h1><p>{access.error}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></div>;
  if(!access.account||!access.member)return <div className="entry-empty"><span className="eyebrow">Área do cliente</span><h1>Conclua os dados da sua conta.</h1><p>Seu usuário está autenticado, mas ainda não há uma empresa vinculada a ele.</p><Link className="primary" href="/cadastro?redirect=%2Fconta">Completar cadastro</Link></div>;

  const activeRows=access.account.apps.filter(item=>validAccess(item.status,item.currentPeriodEnd));
  const contractedIds=new Set(activeRows.map(item=>item.appId));
  const contracted=apps.filter(app=>contractedIds.has(app.slug as AppId));
  const trials=activeRows.filter(item=>item.status==='trialing').length;
  const firstName=String(access.member.displayName||'Cliente').trim().split(/\s+/)[0]||'Cliente';

  return <>
    <AccountNav/>
    <section className="account-hero">
      <div className="account-hero-copy"><span className="account-kicker">Área do cliente</span><h1>Olá, {firstName}.</h1><p>Esta é a central da sua conta <strong>{access.account.name}</strong>. A operação dos aplicativos fica separada da gestão comercial e de cobrança.</p></div>
      <div className="account-status"><ShieldCheck size={18}/><div><small>Status da conta</small><strong>{access.account.status==='active'?'Ativa':access.account.status==='suspended'?'Suspensa':'Encerrada'}</strong></div></div>
    </section>

    <section className="account-metrics" aria-label="Resumo da conta">
      <article><span>Aplicativos ativos</span><strong>{contracted.length}</strong><p>Produtos liberados para esta empresa.</p></article>
      <article><span>Testes ativos</span><strong>{trials}</strong><p>Períodos gratuitos ainda vigentes.</p></article>
      <article><span>Perfil</span><strong>{access.isOwner?'Titular':'Usuário'}</strong><p>{access.isOwner?'Responsável pela conta e cobrança.':'Acesso definido pelo titular da conta.'}</p></article>
    </section>

    <div className="account-dashboard-grid">
      <section className="account-products">
        <div className="account-section-heading"><div><span className="account-kicker">Produtos</span><h2>Seus aplicativos</h2><p>Abra somente os aplicativos que estão ativos e liberados para o seu usuário.</p></div><Link className="account-link" href="/aplicativos">Adicionar aplicativo <ArrowRight size={15}/></Link></div>
        {contracted.length===0?<div className="account-empty-product"><h3>Nenhum aplicativo ativo.</h3><p>Quando um teste ou assinatura for autorizado, o aplicativo aparece aqui automaticamente.</p><Link className="primary" href="/aplicativos">Explorar a Store <ArrowRight size={16}/></Link></div>:<div className="entry-grid">{contracted.map(app=>{
          const allowed=access.hasApp(app.slug as AppId);
          return allowed
            ? <Link href={`/${app.slug}`} key={app.slug} className={`entry-app entry-${app.tone}`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h3>{app.name}</h3><span>Abrir aplicativo <ArrowRight size={17}/></span></div></Link>
            : <article key={app.slug} className={`entry-app entry-${app.tone} is-locked`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h3>{app.name}</h3><span>Sem acesso para este usuário</span></div></article>;
        })}</div>}
      </section>

      <aside className="account-profile-card">
        <span className="account-kicker">Conta</span><h2>Dados principais</h2>
        <dl>
          <div><dt><Building2 size={15}/> Empresa</dt><dd>{access.account.name}</dd></div>
          <div><dt><Mail size={15}/> E-mail</dt><dd>{access.user.email||'—'}</dd></div>
          <div><dt><ShieldCheck size={15}/> Perfil</dt><dd>{access.isOwner?'Titular':'Usuário'}</dd></div>
        </dl>
        <Link className="account-profile-action" href="/assinaturas"><CreditCard size={16}/><span><strong>Assinaturas e cobrança</strong><small>Planos, renovações e pagamentos</small></span><ArrowRight size={16}/></Link>
        <button className="account-profile-action is-button" onClick={()=>void access.logout()}><LogOut size={16}/><span><strong>Sair da conta</strong><small>Encerrar esta sessão</small></span></button>
      </aside>
    </div>
  </>;
}
