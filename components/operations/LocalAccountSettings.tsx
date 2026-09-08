'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useLocalAccess, type LocalPermission } from '@/lib/account/localAccess';
import { Badge, Button, Section } from './ui';

export function LocalAccountSettings(){
  const access=useLocalAccess();
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [selected,setSelected]=useState<AppId[]>([]);
  const [newCanConfigure,setNewCanConfigure]=useState(false);
  const [error,setError]=useState('');
  const subscribed=useMemo(()=>apps.filter(app=>access.account?.subscriptions.includes(app.slug as AppId)),[access.account]);

  if(!access.ready)return <Section title="Conta e acessos"><p className="op-muted">Carregando conta…</p></Section>;
  if(!access.account||!access.member)return <Section title="Conta e acessos"><p className="op-muted">A conta central ainda não está conectada neste navegador. Os aplicativos continuam acessíveis sem login nesta fase.</p></Section>;

  const account=access.account;
  const member=access.member;
  const toggle=(app:AppId)=>setSelected(current=>current.includes(app)?current.filter(item=>item!==app):[...current,app]);
  const add=()=>{
    setError('');
    try{
      const permissions:LocalPermission[]=newCanConfigure?['manage_configuration']:[];
      access.addMember(name,email,selected,permissions);
      setName('');setEmail('');setSelected([]);setNewCanConfigure(false);
    }catch(reason){setError((reason as Error).message)}
  };
  const changeMemberApp=(memberId:string,app:AppId,checked:boolean)=>{
    setError('');
    const target=account.members.find(item=>item.id===memberId);
    if(!target)return;
    const next=checked?Array.from(new Set([...target.apps,app])):target.apps.filter(item=>item!==app);
    try{access.updateMemberApps(memberId,next)}catch(reason){setError((reason as Error).message)}
  };
  const changePermission=(memberId:string,permission:LocalPermission,checked:boolean)=>{
    setError('');
    try{access.updateMemberPermission(memberId,permission,checked)}catch(reason){setError((reason as Error).message)}
  };

  return <Section title="Conta e acessos">
    <div className="op-account-summary"><div><span>Conta</span><strong>{account.business}</strong></div><div><span>Seu acesso</span><strong>{member.name}</strong><small>{access.isOwner?'Titular':access.canManageConfiguration?'Configuração liberada':'Usuário'}</small></div><div><span>Aplicativos da conta</span><strong>{subscribed.length}</strong></div><div><span>Usuários</span><strong>{account.members.length} / 4</strong></div></div>
    <p className="op-muted">O titular controla duas coisas separadas: quais aplicativos cada pessoa pode acessar e se ela pode alterar as configurações da operação. Abrir o aplicativo não concede automaticamente permissão para configurá-lo.</p>
    <div className="op-access-list">{account.members.map(accountMember=><div className="op-access-member" key={accountMember.id}>
      <div className="op-grow">
        <strong>{accountMember.name}{accountMember.id===account.ownerMemberId&&<Badge>Titular</Badge>}{accountMember.id!==account.ownerMemberId&&accountMember.permissions?.includes('manage_configuration')&&<Badge>Configurações</Badge>}</strong>
        <span>{accountMember.email}</span>
        {access.isOwner&&accountMember.id!==account.ownerMemberId
          ? <>
              <div className="op-access-apps compact">{subscribed.map(app=><label key={app.slug}><input type="checkbox" checked={accountMember.apps.includes(app.slug as AppId)} onChange={event=>changeMemberApp(accountMember.id,app.slug as AppId,event.target.checked)}/><span>{app.name}</span></label>)}</div>
              <label className="op-access-permission"><input type="checkbox" checked={!!accountMember.permissions?.includes('manage_configuration')} onChange={event=>changePermission(accountMember.id,'manage_configuration',event.target.checked)}/><span><strong>Pode configurar os aplicativos liberados</strong><small>Permite alterar nomes de campos, opções, módulos e ações.</small></span></label>
            </>
          : <small>{accountMember.apps.map(app=>apps.find(item=>item.slug===app)?.name||app).join(' · ')}</small>}
      </div>
      {access.isOwner&&accountMember.id!==account.ownerMemberId&&<button type="button" className="op-icon" aria-label={`Remover acesso de ${accountMember.name}`} onClick={()=>{setError('');try{access.removeMember(accountMember.id)}catch(reason){setError((reason as Error).message)}}}><Trash2 size={16}/></button>}
    </div>)}</div>
    {error&&<p className="op-error-text" role="alert">{error}</p>}
    {access.isOwner&&account.members.length<4&&<div className="op-access-add">
      <div className="op-fields"><label className="op-field"><span>Nome do usuário</span><input value={name} onChange={event=>setName(event.target.value)} placeholder="Nome da pessoa"/></label><label className="op-field"><span>E-mail do usuário</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="pessoa@empresa.com.br"/></label></div>
      <div><span className="op-field-caption">Aplicativos liberados</span><div className="op-access-apps">{subscribed.map(app=><label key={app.slug}><input type="checkbox" checked={selected.includes(app.slug as AppId)} onChange={()=>toggle(app.slug as AppId)}/><span>{app.name}<small>{app.category}</small></span></label>)}</div></div>
      <label className="op-access-permission"><input type="checkbox" checked={newCanConfigure} onChange={event=>setNewCanConfigure(event.target.checked)}/><span><strong>Liberar Configurações</strong><small>Essa pessoa poderá adaptar campos, opções, módulos e ações dos aplicativos que ela já pode acessar.</small></span></label>
      <Button variant="secondary" onClick={add}><Plus size={16}/>Adicionar acesso</Button>
    </div>}
    {!access.isOwner&&<p className="op-muted">Somente o titular pode conceder ou remover permissões. Quem recebeu acesso de configuração pode alterar a operação, mas não administrar outros usuários.</p>}
  </Section>;
}
