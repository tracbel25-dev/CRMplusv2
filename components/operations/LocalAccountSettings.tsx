'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useLocalAccess } from '@/lib/account/localAccess';
import { Badge, Button, Section } from './ui';

export function LocalAccountSettings(){
  const access=useLocalAccess();
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [selected,setSelected]=useState<AppId[]>([]);
  const [error,setError]=useState('');
  const subscribed=useMemo(()=>apps.filter(app=>access.account?.subscriptions.includes(app.slug as AppId)),[access.account]);

  if(!access.ready)return <Section title="Conta e acessos"><p className="op-muted">Carregando conta…</p></Section>;
  if(!access.account||!access.member)return <Section title="Conta e acessos"><p className="op-muted">Entre pela Store para vincular este aplicativo a uma conta local de protótipo.</p></Section>;

  const account=access.account;
  const member=access.member;
  const toggle=(app:AppId)=>setSelected(current=>current.includes(app)?current.filter(item=>item!==app):[...current,app]);
  const add=()=>{
    setError('');
    try{access.addMember(name,email,selected);setName('');setEmail('');setSelected([])}catch(reason){setError((reason as Error).message)}
  };
  const changeMemberApp=(memberId:string,app:AppId,checked:boolean)=>{
    setError('');
    const target=account.members.find(item=>item.id===memberId);
    if(!target)return;
    const next=checked?Array.from(new Set([...target.apps,app])):target.apps.filter(item=>item!==app);
    try{access.updateMemberApps(memberId,next)}catch(reason){setError((reason as Error).message)}
  };

  return <Section title="Conta e acessos">
    <div className="op-account-summary"><div><span>Conta</span><strong>{account.business}</strong></div><div><span>Seu acesso</span><strong>{member.name}</strong><small>{access.isOwner?'Titular':'Usuário'}</small></div><div><span>Aplicativos da conta</span><strong>{subscribed.length}</strong></div><div><span>Usuários</span><strong>{account.members.length} / 4</strong></div></div>
    <p className="op-muted">Este é o esboço local da regra de conta. A Store define quais aplicativos pertencem à conta; o titular decide quais desses aplicativos cada usuário pode abrir. Ainda não há autenticação real nem sincronização entre dispositivos.</p>
    <div className="op-access-list">{account.members.map(accountMember=><div className="op-access-member" key={accountMember.id}>
      <div className="op-grow">
        <strong>{accountMember.name}{accountMember.id===account.ownerMemberId&&<Badge>Titular</Badge>}</strong>
        <span>{accountMember.email}</span>
        {access.isOwner&&accountMember.id!==account.ownerMemberId
          ? <div className="op-access-apps compact">{subscribed.map(app=><label key={app.slug}><input type="checkbox" checked={accountMember.apps.includes(app.slug as AppId)} onChange={event=>changeMemberApp(accountMember.id,app.slug as AppId,event.target.checked)}/><span>{app.name}</span></label>)}</div>
          : <small>{accountMember.apps.map(app=>apps.find(item=>item.slug===app)?.name||app).join(' · ')}</small>}
      </div>
      {access.isOwner&&accountMember.id!==account.ownerMemberId&&<button type="button" className="op-icon" aria-label={`Remover acesso de ${accountMember.name}`} onClick={()=>{setError('');try{access.removeMember(accountMember.id)}catch(reason){setError((reason as Error).message)}}}><Trash2 size={16}/></button>}
    </div>)}</div>
    {error&&<p className="op-error-text" role="alert">{error}</p>}
    {access.isOwner&&account.members.length<4&&<div className="op-access-add">
      <div className="op-fields"><label className="op-field"><span>Nome do usuário</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Nome da pessoa"/></label><label className="op-field"><span>E-mail do usuário</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="pessoa@empresa.com.br"/></label></div>
      <div><span className="op-field-caption">Aplicativos liberados</span><div className="op-access-apps">{subscribed.map(app=><label key={app.slug}><input type="checkbox" checked={selected.includes(app.slug as AppId)} onChange={()=>toggle(app.slug as AppId)}/><span>{app.name}<small>{app.category}</small></span></label>)}</div></div>
      <Button variant="secondary" onClick={add}><Plus size={16}/>Adicionar acesso</Button>
    </div>}
    {!access.isOwner&&<p className="op-muted">Somente o titular da conta pode adicionar, remover ou alterar acessos.</p>}
  </Section>;
}
