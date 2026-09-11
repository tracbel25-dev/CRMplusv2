'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Section } from './ui';

export function LocalAccountSettings(){
  const access=useStoreAccess();
  const [error,setError]=useState('');
  if(!access.ready)return <Section title="Conta e acessos"><p className="op-muted">Carregando conta…</p></Section>;
  if(!access.user)return <Section title="Conta e acessos"><p className="op-muted">Entre na CRM PLUS Store para identificar o titular e aplicar permissões de configuração.</p></Section>;
  if(access.error||!access.account||!access.member)return <Section title="Conta e acessos"><p className="op-muted">{access.error||'Não foi possível carregar a conta central.'}</p></Section>;

  const account=access.account;
  const member=access.member;
  const contracted=apps.filter(app=>account.apps.some(item=>item.appId===app.slug&&['trialing','active'].includes(item.status)));
  const changeAccess=async(userId:string,appId:AppId,enabled:boolean,canConfigure:boolean)=>{
    setError('');
    try{await access.setMemberAppAccess(userId,appId,enabled,canConfigure)}catch(reason){setError((reason as Error).message)}
  };
  const changeConfiguration=async(userId:string,appId:AppId,enabled:boolean)=>{
    setError('');
    try{await access.setMemberCanConfigure(userId,appId,enabled)}catch(reason){setError((reason as Error).message)}
  };

  return <Section title="Conta e acessos">
    <div className="op-account-summary"><div><span>Conta</span><strong>{account.name}</strong></div><div><span>Seu acesso</span><strong>{member.displayName}</strong><small>{access.isOwner?'Titular':'Usuário'}</small></div><div><span>Aplicativos contratados</span><strong>{contracted.length}</strong></div><div><span>Usuários ativos</span><strong>{account.members.length}</strong></div></div>
    <p className="op-muted">Acesso e configuração são permissões diferentes. O titular pode liberar um aplicativo para alguém sem permitir que essa pessoa altere campos, opções, módulos ou ações.</p>
    {access.isOwner?<div className="op-access-list">{account.members.map(accountMember=><div className="op-access-member" key={accountMember.userId}>
      <div className="op-grow">
        <strong>{accountMember.displayName}{accountMember.role==='owner'&&<Badge>Titular</Badge>}</strong>
        {accountMember.role==='owner'?<small>O titular possui acesso e configuração dos aplicativos ativos da conta.</small>:contracted.length===0?<small>Nenhum aplicativo ativo para distribuir.</small>:<div className="op-access-apps detailed">{contracted.map(app=>{
          const appId=app.slug as AppId;
          const row=accountMember.apps.find(item=>item.appId===appId);
          const enabled=!!row;
          const canConfigure=!!row?.canConfigure;
          return <div className="op-access-app-card" key={appId}><strong>{app.name}</strong><label><input type="checkbox" checked={enabled} onChange={event=>void changeAccess(accountMember.userId,appId,event.target.checked,canConfigure)}/><span>Acessar</span></label><label><input type="checkbox" checked={canConfigure} disabled={!enabled} onChange={event=>void changeConfiguration(accountMember.userId,appId,event.target.checked)}/><span>Configurar</span></label></div>;
        })}</div>}
      </div>
    </div>)}</div>:<p className="op-muted">Você pode configurar este aplicativo porque recebeu essa permissão, mas somente o titular administra os acessos de outras pessoas.</p>}
    {error&&<p className="op-error-text" role="alert">{error}</p>}
    {access.isOwner&&<div className="op-config-runtime-note"><strong>Equipe e acessos</strong><small>Adicione pessoas, remova usuários e escolha quais aplicativos cada integrante pode abrir ou configurar.</small><div className="op-actions"><Link className="op-button secondary" href="/equipe-acessos">Gerenciar equipe e acessos</Link></div></div>}
  </Section>;
}
