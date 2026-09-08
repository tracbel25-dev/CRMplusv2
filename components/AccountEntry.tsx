'use client';

import Link from 'next/link';
import { ArrowRight, LogOut, LockKeyhole } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { AppArtwork } from './AppArtwork';

export function AccountEntry(){
  const access=useStoreAccess();
  if(!access.ready)return <div className="entry-loading">Carregando sua conta…</div>;
  if(!access.user)return <div className="entry-empty"><span className="eyebrow">Conta CRM PLUS</span><h1>Entre para ver seus aplicativos.</h1><p>Esta área mostra somente os aplicativos contratados pela conta e liberados para o seu usuário.</p><div className="entry-empty-actions"><Link className="primary" href="/login">Entrar</Link><Link className="ghost" href="/cadastro">Criar conta</Link></div></div>;
  if(access.error)return <div className="entry-empty"><span className="eyebrow">Conta CRM PLUS</span><h1>Não foi possível carregar a conta.</h1><p>{access.error}</p></div>;
  if(!access.account||!access.member)return <div className="entry-empty"><span className="eyebrow">Conta CRM PLUS</span><h1>Conclua os dados da sua conta.</h1><p>Seu usuário está autenticado, mas ainda não há uma empresa vinculada a ele.</p><Link className="primary" href="/cadastro">Completar cadastro</Link></div>;

  const contractedIds=new Set(access.account.apps.filter(item=>['trialing','active'].includes(item.status)).map(item=>item.appId));
  const contracted=apps.filter(app=>contractedIds.has(app.slug as AppId));
  return <>
    <div className="entry-account-head"><div><span className="eyebrow">Conta</span><h1>{access.account.name}</h1><p>{access.member.displayName} · {access.isOwner?'Titular':'Usuário'} · {contracted.length} aplicativo{contracted.length===1?'':'s'} contratado{contracted.length===1?'':'s'}</p></div><button className="ghost small" onClick={()=>void access.logout()}><LogOut size={16}/>Sair</button></div>
    {contracted.length===0?<div className="entry-empty"><span className="eyebrow">Sua Store</span><h2>Nenhum aplicativo contratado ainda.</h2><p>O cadastro não libera produtos automaticamente. Quando uma assinatura for ativada, o aplicativo aparece aqui.</p><Link className="primary" href="/aplicativos">Explorar aplicativos <ArrowRight size={16}/></Link></div>:<div className="entry-grid">{contracted.map(app=>{
      const allowed=access.hasApp(app.slug as AppId);
      return allowed
        ? <Link href={`/${app.slug}`} key={app.slug} className={`entry-app entry-${app.tone}`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h2>{app.name}</h2><span>Abrir aplicativo <ArrowRight size={18}/></span></div></Link>
        : <article key={app.slug} className={`entry-app entry-${app.tone} is-locked`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h2>{app.name}</h2><span><LockKeyhole size={16}/>Sem acesso para este usuário</span></div></article>;
    })}</div>}
    <section className="entry-store-more"><div><span className="eyebrow">CRM PLUS Store</span><h2>Quer adicionar outro aplicativo à conta?</h2><p>A contratação acontece pela Store. Depois da ativação, o titular decide quais usuários podem abrir e configurar cada aplicativo.</p></div><Link className="primary" href="/aplicativos">Explorar Store <ArrowRight size={16}/></Link></section>
  </>;
}
