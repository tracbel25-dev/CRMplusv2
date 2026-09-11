'use client';

import Link from 'next/link';
import { Settings2, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';

const TEAM_LIMIT=4;
const isActive=(status:string,end:string|null)=>['trialing','active'].includes(status)&&((status==='active'&&!end)||!!end&&Date.parse(end)>Date.now());

type InviteChoice={access:boolean;configure:boolean};

export function TeamAccess(){
  const access=useStoreAccess();
  const [pending,setPending]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [inviteOpen,setInviteOpen]=useState(false);
  const [inviteName,setInviteName]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteApps,setInviteApps]=useState<Record<string,InviteChoice>>({});

  if(!access.ready)return <div className="entry-loading">Carregando equipe e acessos…</div>;
  if(!access.user)return <section className="account-details-empty"><h1>Entre para acessar sua equipe.</h1><Link className="primary" href="/login?redirect=%2Fequipe-acessos">Entrar</Link></section>;
  if(access.error)return <section className="account-details-empty"><h1>Não foi possível carregar os acessos.</h1><p>{access.error}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></section>;
  if(!access.account||!access.member)return <section className="account-details-empty"><h1>Conta incompleta.</h1><p>Finalize o vínculo da empresa antes de gerenciar acessos.</p></section>;

  const account=access.account;
  const contracted=apps.filter(app=>account.apps.some(row=>row.appId===app.slug&&isActive(row.status,row.currentPeriodEnd)));
  const teamFull=account.members.length>=TEAM_LIMIT;

  const clearFeedback=()=>{setError('');setMessage('');};

  const changeAccess=async(userId:string,appId:AppId,enabled:boolean,canConfigure:boolean)=>{
    const key=`${userId}:${appId}:access`;
    setPending(key);clearFeedback();
    try{await access.setMemberAppAccess(userId,appId,enabled,enabled&&canConfigure);setMessage('Acesso atualizado.');}catch(reason){setError((reason as {message?:string}).message||'Não foi possível alterar o acesso.');}finally{setPending('');}
  };

  const changeConfigure=async(userId:string,appId:AppId,enabled:boolean)=>{
    const key=`${userId}:${appId}:configure`;
    setPending(key);clearFeedback();
    try{await access.setMemberCanConfigure(userId,appId,enabled);setMessage('Permissão atualizada.');}catch(reason){setError((reason as {message?:string}).message||'Não foi possível alterar a permissão.');}finally{setPending('');}
  };

  const setInviteAccess=(appId:AppId,enabled:boolean)=>{
    setInviteApps(current=>({...current,[appId]:{access:enabled,configure:enabled?(current[appId]?.configure||false):false}}));
  };

  const setInviteConfigure=(appId:AppId,enabled:boolean)=>{
    setInviteApps(current=>({...current,[appId]:{access:enabled?true:(current[appId]?.access||false),configure:enabled}}));
  };

  const submitInvite=async(event:FormEvent)=>{
    event.preventDefault();clearFeedback();
    if(teamFull){setError('Sua equipe já tem 4 integrantes. Remova alguém antes de adicionar outra pessoa.');return;}
    const selected=contracted.flatMap(app=>{
      const choice=inviteApps[app.slug];
      return choice?.access?[{appId:app.slug as AppId,canConfigure:choice.configure}]:[];
    });
    if(!selected.length){setError('Selecione pelo menos um aplicativo para essa pessoa.');return;}
    setPending('invite');
    try{
      const result=await access.inviteMember(inviteName,inviteEmail,selected);
      setInviteName('');setInviteEmail('');setInviteApps({});setInviteOpen(false);
      setMessage(result.mode==='existing'?'Pessoa adicionada. Ela já pode entrar com a conta que possui.':'Convite enviado por e-mail. A pessoa poderá criar a senha e acessar os aplicativos liberados.');
    }catch(reason){setError((reason as {message?:string}).message||'Não foi possível adicionar essa pessoa.');}
    finally{setPending('');}
  };

  const removeMember=async(userId:string,name:string)=>{
    if(!window.confirm(`Remover ${name} da equipe? O histórico já registrado será preservado.`))return;
    setPending(`${userId}:remove`);clearFeedback();
    try{await access.removeMember(userId);setMessage(`${name} foi removido da equipe.`);}catch(reason){setError((reason as {message?:string}).message||'Não foi possível remover essa pessoa.');}finally{setPending('');}
  };

  return <>
    <section className="account-details-intro team-intro">
      <div><span className="account-kicker">Conta</span><h1>Equipe e acessos</h1><p>Adicione pessoas e escolha quais aplicativos cada uma pode abrir ou configurar.</p></div>
      {access.isOwner&&<div className="team-intro-actions"><span>{account.members.length} de {TEAM_LIMIT} pessoas</span><button className="primary small" type="button" disabled={teamFull} onClick={()=>{clearFeedback();setInviteOpen(value=>!value);}}>{inviteOpen?<><X size={15}/>Fechar</>:<><UserPlus size={15}/>Adicionar pessoa</>}</button></div>}
    </section>

    {!access.isOwner&&<div className="account-permission-note"><ShieldCheck size={18}/><div><strong>Somente o titular altera permissões.</strong><p>Você pode consultar seus próprios acessos, mas as mudanças ficam restritas ao responsável pela conta.</p></div></div>}

    {access.isOwner&&teamFull&&<div className="account-permission-note"><UsersRound size={18}/><div><strong>Equipe completa.</strong><p>Esta empresa pode ter até 4 pessoas: o titular e mais 3 usuários. Remova alguém para abrir uma vaga.</p></div></div>}

    {access.isOwner&&inviteOpen&&!teamFull&&<form className="team-invite-card" onSubmit={submitInvite}>
      <div className="team-invite-heading"><div><span className="account-kicker">Novo acesso</span><h2>Adicionar pessoa</h2><p>Se o e-mail já tiver uma conta CRM PLUS, o acesso será ligado à conta existente. Caso contrário, a pessoa receberá um convite.</p></div></div>
      <div className="team-invite-fields"><label><span>Nome</span><input value={inviteName} onChange={event=>setInviteName(event.target.value)} placeholder="Nome da pessoa" autoComplete="name" required/></label><label><span>E-mail</span><input type="email" value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)} placeholder="pessoa@empresa.com.br" autoComplete="email" required/></label></div>
      <div className="team-invite-permissions"><div className="team-invite-permissions-title"><strong>Aplicativos</strong><small>Marque o que essa pessoa poderá usar. Configurar permite alterar opções do aplicativo.</small></div>{contracted.length===0?<p className="team-empty">Nenhum aplicativo ativo para liberar.</p>:contracted.map(app=>{
        const appId=app.slug as AppId;
        const choice=inviteApps[appId]||{access:false,configure:false};
        return <div className="team-invite-app" key={appId}><div><strong>{app.name}</strong><small>{app.category}</small></div><label className="team-toggle"><input type="checkbox" checked={choice.access} onChange={event=>setInviteAccess(appId,event.target.checked)}/><span>Acesso</span></label><label className="team-toggle"><input type="checkbox" checked={choice.configure} onChange={event=>setInviteConfigure(appId,event.target.checked)}/><span><Settings2 size={14}/> Configurar</span></label></div>;
      })}</div>
      <div className="team-invite-actions"><button className="ghost small" type="button" onClick={()=>setInviteOpen(false)}>Cancelar</button><button className="primary small" type="submit" disabled={pending==='invite'||contracted.length===0}>{pending==='invite'?'Adicionando…':'Adicionar à equipe'}</button></div>
    </form>}

    {error&&<div className="account-form-feedback is-error" role="alert">{error}</div>}
    {message&&<div className="account-form-feedback is-success" role="status">{message}</div>}

    <section className="team-list">
      {account.members.map(member=>{
        const owner=member.role==='owner';
        return <article className="team-card" key={member.userId}>
          <header className="team-card-header"><div className="team-avatar"><UsersRound size={19}/></div><div><h2>{member.displayName}</h2><p>{owner?'Titular da conta':'Usuário da conta'}</p></div><div className="team-card-header-actions"><span className="team-role">{owner?'Titular':'Usuário'}</span>{access.isOwner&&!owner&&<button className="team-remove" type="button" disabled={pending===`${member.userId}:remove`} onClick={()=>void removeMember(member.userId,member.displayName)} aria-label={`Remover ${member.displayName} da equipe`}><Trash2 size={15}/><span>{pending===`${member.userId}:remove`?'Removendo…':'Remover'}</span></button>}</div></header>
          <div className="team-access-table">
            {contracted.length===0?<p className="team-empty">Nenhum aplicativo ativo para configurar.</p>:contracted.map(app=>{
              const appId=app.slug as AppId;
              const memberAccess=member.apps.find(item=>item.appId===appId);
              const enabled=owner||!!memberAccess;
              const canConfigure=owner||!!memberAccess?.canConfigure;
              const canEdit=access.isOwner&&!owner;
              const busy=pending.startsWith(`${member.userId}:${appId}`)||pending===`${member.userId}:remove`;
              return <div className="team-app-row" key={app.slug}>
                <div><strong>{app.name}</strong><small>{app.category}</small></div>
                <label className="team-toggle"><input type="checkbox" checked={enabled} disabled={!canEdit||busy} onChange={event=>void changeAccess(member.userId,appId,event.target.checked,canConfigure)}/><span>Acesso</span></label>
                <label className="team-toggle"><input type="checkbox" checked={canConfigure} disabled={!canEdit||!enabled||busy} onChange={event=>void changeConfigure(member.userId,appId,event.target.checked)}/><span><Settings2 size={14}/> Configurar</span></label>
              </div>;
            })}
          </div>
        </article>;
      })}
    </section>
  </>;
}
