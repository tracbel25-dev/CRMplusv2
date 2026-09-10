'use client';

import Link from 'next/link';
import { Settings2, ShieldCheck, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';

const isActive=(status:string,end:string|null)=>['trialing','active'].includes(status)&&(!end||Date.parse(end)>Date.now());

export function TeamAccess(){
  const access=useStoreAccess();
  const [pending,setPending]=useState('');
  const [error,setError]=useState('');

  if(!access.ready)return <div className="entry-loading">Carregando equipe e acessos…</div>;
  if(!access.user)return <section className="account-details-empty"><h1>Entre para acessar sua equipe.</h1><Link className="primary" href="/login?redirect=%2Fequipe-acessos">Entrar</Link></section>;
  if(access.error)return <section className="account-details-empty"><h1>Não foi possível carregar os acessos.</h1><p>{access.error}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></section>;
  if(!access.account||!access.member)return <section className="account-details-empty"><h1>Conta incompleta.</h1><p>Finalize o vínculo da empresa antes de gerenciar acessos.</p></section>;

  const contracted=apps.filter(app=>access.account?.apps.some(row=>row.appId===app.slug&&isActive(row.status,row.currentPeriodEnd)));

  const changeAccess=async(userId:string,appId:AppId,enabled:boolean,canConfigure:boolean)=>{
    const key=`${userId}:${appId}:access`;
    setPending(key);setError('');
    try{await access.setMemberAppAccess(userId,appId,enabled,canConfigure);}catch(reason){setError((reason as {message?:string}).message||'Não foi possível alterar o acesso.');}finally{setPending('');}
  };

  const changeConfigure=async(userId:string,appId:AppId,enabled:boolean)=>{
    const key=`${userId}:${appId}:configure`;
    setPending(key);setError('');
    try{await access.setMemberCanConfigure(userId,appId,enabled);}catch(reason){setError((reason as {message?:string}).message||'Não foi possível alterar a permissão.');}finally{setPending('');}
  };

  return <>
    <section className="account-details-intro">
      <div><span className="account-kicker">Conta</span><h1>Equipe e acessos</h1><p>Veja quem faz parte da empresa e controle quais aplicativos cada usuário pode abrir ou configurar.</p></div>
    </section>

    {!access.isOwner&&<div className="account-permission-note"><ShieldCheck size={18}/><div><strong>Somente o titular altera permissões.</strong><p>Você pode consultar seus próprios acessos, mas as mudanças ficam restritas ao responsável pela conta.</p></div></div>}
    {error&&<div className="account-form-feedback is-error" role="alert">{error}</div>}

    <section className="team-list">
      {access.account.members.map(member=>{
        const owner=member.role==='owner';
        return <article className="team-card" key={member.userId}>
          <header className="team-card-header"><div className="team-avatar"><UsersRound size={19}/></div><div><h2>{member.displayName}</h2><p>{owner?'Titular da conta':'Usuário da conta'}</p></div><span className="team-role">{owner?'Titular':'Usuário'}</span></header>
          <div className="team-access-table">
            {contracted.length===0?<p className="team-empty">Nenhum aplicativo ativo para configurar.</p>:contracted.map(app=>{
              const appId=app.slug as AppId;
              const memberAccess=member.apps.find(item=>item.appId===appId);
              const enabled=owner||!!memberAccess;
              const canConfigure=owner||!!memberAccess?.canConfigure;
              const canEdit=access.isOwner&&!owner;
              return <div className="team-app-row" key={app.slug}>
                <div><strong>{app.name}</strong><small>{app.category}</small></div>
                <label className="team-toggle"><input type="checkbox" checked={enabled} disabled={!canEdit||pending.startsWith(`${member.userId}:${appId}`)} onChange={event=>void changeAccess(member.userId,appId,event.target.checked,canConfigure)}/><span>Acesso</span></label>
                <label className="team-toggle"><input type="checkbox" checked={canConfigure} disabled={!canEdit||!enabled||pending.startsWith(`${member.userId}:${appId}`)} onChange={event=>void changeConfigure(member.userId,appId,event.target.checked)}/><span><Settings2 size={14}/> Configurar</span></label>
              </div>;
            })}
          </div>
        </article>;
      })}
    </section>
  </>;
}
