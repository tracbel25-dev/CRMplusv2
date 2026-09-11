'use client';

import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Button, Section } from './ui';

const TEAM_LIMIT = 4;

export function LocalAccountSettings(){
  const access = useStoreAccess();
  const pathname = usePathname();
  const appId = useMemo<AppId>(() => {
    const slug = pathname.split('/').filter(Boolean)[0] as AppId;
    return slug || 'zeus';
  }, [pathname]);
  const app = apps.find(item => item.slug === appId);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [pending,setPending] = useState('');
  const [inviteOpen,setInviteOpen] = useState(false);
  const [inviteName,setInviteName] = useState('');
  const [inviteEmail,setInviteEmail] = useState('');
  const [inviteCanConfigure,setInviteCanConfigure] = useState(false);

  if(!access.ready)return <Section title="Acessos"><p className="op-muted">Carregando acessos…</p></Section>;
  if(!access.user)return <Section title="Acessos"><p className="op-muted">Entre na sua conta para gerenciar os acessos deste aplicativo.</p></Section>;
  if(access.error||!access.account||!access.member)return <Section title="Acessos"><p className="op-muted">{access.error||'Não foi possível carregar a conta.'}</p></Section>;

  const account = access.account;
  const member = access.member;
  const appActive = account.apps.some(item => item.appId === appId && ['trialing','active'].includes(item.status));
  const teamFull = account.members.length >= TEAM_LIMIT;
  const appName = app?.name || appId;

  const clearFeedback = () => { setError(''); setMessage(''); };

  const changeAccess = async(userId:string,enabled:boolean,canConfigure:boolean) => {
    const key=`${userId}:access`;
    setPending(key); clearFeedback();
    try{
      await access.setMemberAppAccess(userId,appId,enabled,enabled&&canConfigure);
      setMessage('Acesso atualizado.');
    }catch(reason){ setError((reason as Error).message); }
    finally{ setPending(''); }
  };

  const changeConfiguration = async(userId:string,enabled:boolean) => {
    const key=`${userId}:configure`;
    setPending(key); clearFeedback();
    try{
      await access.setMemberCanConfigure(userId,appId,enabled);
      setMessage('Permissão atualizada.');
    }catch(reason){ setError((reason as Error).message); }
    finally{ setPending(''); }
  };

  const invite = async() => {
    clearFeedback();
    if(teamFull){ setError('Esta conta já possui 4 pessoas. Remova alguém antes de adicionar outra.'); return; }
    if(!inviteName.trim() || !inviteEmail.trim()){ setError('Informe nome e e-mail.'); return; }
    setPending('invite');
    try{
      const result = await access.inviteMember(inviteName.trim(),inviteEmail.trim(),[{appId,canConfigure:inviteCanConfigure}]);
      setInviteName(''); setInviteEmail(''); setInviteCanConfigure(false); setInviteOpen(false);
      setMessage(result.mode==='existing' ? `${appName} liberado para essa pessoa.` : 'Convite enviado por e-mail.');
    }catch(reason){ setError((reason as Error).message); }
    finally{ setPending(''); }
  };

  const remove = async(userId:string,name:string) => {
    if(!window.confirm(`Remover ${name} da equipe?`)) return;
    setPending(`${userId}:remove`); clearFeedback();
    try{ await access.removeMember(userId); setMessage(`${name} foi removido da equipe.`); }
    catch(reason){ setError((reason as Error).message); }
    finally{ setPending(''); }
  };

  return <Section title={`Acessos do ${appName}`}>
    <div className="op-account-summary">
      <div><span>Conta</span><strong>{account.name}</strong></div>
      <div><span>Seu acesso</span><strong>{member.displayName}</strong><small>{access.isOwner?'Titular':'Usuário'}</small></div>
      <div><span>Pessoas na conta</span><strong>{account.members.length}/{TEAM_LIMIT}</strong></div>
      <div><span>Aplicativo</span><strong>{appName}</strong><small>{appActive?'Ativo':'Inativo'}</small></div>
    </div>

    <p className="op-muted">Gerencie aqui quem pode entrar neste aplicativo e quem também pode alterar suas configurações.</p>

    {access.isOwner && <div className="op-form-footer" style={{justifyContent:'flex-start'}}>
      <Button variant="secondary" disabled={teamFull || !appActive} onClick={()=>{ clearFeedback(); setInviteOpen(value=>!value); }}>
        <UserPlus size={16}/>{inviteOpen?'Fechar':'Adicionar pessoa'}
      </Button>
    </div>}

    {access.isOwner && inviteOpen && !teamFull && <div className="op-config-runtime-note">
      <strong>Adicionar pessoa ao {appName}</strong>
      <div className="op-fields" style={{marginTop:12}}>
        <label className="op-field"><span>Nome</span><input value={inviteName} onChange={event=>setInviteName(event.target.value)} placeholder="Nome da pessoa" /></label>
        <label className="op-field"><span>E-mail</span><input type="email" value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)} placeholder="pessoa@empresa.com.br" /></label>
      </div>
      <label className="op-module-choice" style={{marginTop:12}}><input type="checkbox" checked={inviteCanConfigure} onChange={event=>setInviteCanConfigure(event.target.checked)} /><span><strong>Pode configurar o {appName}</strong><small>Permite alterar campos, opções e etapas deste aplicativo.</small></span></label>
      <div className="op-form-footer"><Button variant="secondary" onClick={()=>setInviteOpen(false)}>Cancelar</Button><Button disabled={pending==='invite'} onClick={()=>void invite()}>{pending==='invite'?'Adicionando…':'Adicionar'}</Button></div>
    </div>}

    {error && <p className="op-error-text" role="alert">{error}</p>}
    {message && <p className="op-muted" role="status">{message}</p>}

    <div className="op-access-list">
      {account.members.map(accountMember=>{
        const owner = accountMember.role==='owner';
        const row = accountMember.apps.find(item=>item.appId===appId);
        const enabled = owner || !!row;
        const canConfigure = owner || !!row?.canConfigure;
        const canEdit = access.isOwner && !owner && appActive;
        const busy = pending.startsWith(accountMember.userId);
        return <div className="op-access-member" key={accountMember.userId}>
          <div className="op-grow">
            <strong>{accountMember.displayName}{owner&&<Badge>Titular</Badge>}</strong>
            <small>{owner?'Acesso total aos aplicativos ativos.':enabled?`Acesso ao ${appName} liberado.`:`Sem acesso ao ${appName}.`}</small>
          </div>
          <div className="op-access-apps detailed">
            <div className="op-access-app-card">
              <label><input type="checkbox" checked={enabled} disabled={!canEdit||busy} onChange={event=>void changeAccess(accountMember.userId,event.target.checked,canConfigure)}/><span>Acessar</span></label>
              <label><input type="checkbox" checked={canConfigure} disabled={!canEdit||!enabled||busy} onChange={event=>void changeConfiguration(accountMember.userId,event.target.checked)}/><span>Configurar</span></label>
            </div>
          </div>
          {access.isOwner&&!owner&&<button className="op-icon" type="button" disabled={pending===`${accountMember.userId}:remove`} aria-label={`Remover ${accountMember.displayName}`} onClick={()=>void remove(accountMember.userId,accountMember.displayName)}><Trash2 size={17}/></button>}
        </div>;
      })}
    </div>

    {!access.isOwner && <p className="op-muted">Você pode consultar seus acessos. Somente o titular altera os acessos da equipe.</p>}
  </Section>;
}
