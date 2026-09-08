'use client';

import Link from 'next/link';
import { ArrowRight, LogOut, LockKeyhole } from 'lucide-react';
import { apps } from '@/lib/catalog';
import { useLocalAccess } from '@/lib/account/localAccess';
import { AppArtwork } from './AppArtwork';

export function AccountEntry(){
  const access=useLocalAccess();
  if(!access.ready)return <div className="entry-loading">Carregando sua conta…</div>;
  if(!access.account||!access.member)return <div className="entry-empty"><span className="eyebrow">Conta CRM PLUS</span><h1>Entre para ver seus aplicativos.</h1><p>Depois do acesso, esta tela mostra apenas os aplicativos contratados e liberados para o seu usuário.</p><div className="entry-empty-actions"><Link className="primary" href="/login">Entrar</Link><Link className="ghost" href="/cadastro">Criar conta</Link></div></div>;

  const subscribed=apps.filter(app=>access.account!.subscriptions.includes(app.slug as any));
  return <>
    <div className="entry-account-head"><div><span className="eyebrow">Conta</span><h1>{access.account.business}</h1><p>{access.member.name} · {access.isOwner?'Titular':'Usuário'} · {access.member.apps.length} acesso{access.member.apps.length===1?'':'s'} liberado{access.member.apps.length===1?'':'s'}</p></div><button className="ghost small" onClick={access.logout}><LogOut size={16}/>Sair</button></div>
    <div className="entry-grid">{subscribed.map(app=>{
      const allowed=access.hasApp(app.slug as any);
      return allowed
        ? <Link href={`/${app.slug}`} key={app.slug} className={`entry-app entry-${app.tone}`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h2>{app.name}</h2><span>Abrir aplicativo <ArrowRight size={18}/></span></div></Link>
        : <article key={app.slug} className={`entry-app entry-${app.tone} is-locked`}><div className="entry-art"><AppArtwork tone={app.tone} compact/></div><div><small>{app.category}</small><h2>{app.name}</h2><span><LockKeyhole size={16}/>Sem acesso para este usuário</span></div></article>;
    })}</div>
    <section className="entry-store-more"><div><span className="eyebrow">Outros produtos</span><h2>Quer adicionar outro aplicativo à conta?</h2><p>A contratação continua acontecendo pela Store. Depois, o titular decide quais usuários recebem acesso.</p></div><Link className="primary" href="/aplicativos">Explorar Store <ArrowRight size={16}/></Link></section>
  </>;
}
