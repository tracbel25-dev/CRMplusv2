'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronUp, Save, Trash2, UserPlus } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Button } from './ui';
import { SettingsSection } from './SettingsSection';

const TEAM_LIMIT=4;

type PermissionKey =
  | 'dashboard_view'|'appointments_view'|'appointments_manage'|'jobs_view'|'jobs_create'|'jobs_edit'|'jobs_advance'
  | 'quotes_view'|'quotes_manage'|'quotes_share'|'billing_view'|'billing_manage'|'billing_collect'|'reports_export'
  | 'attachments_manage'|'ai_use'|'settings_fields'|'settings_operation'|'settings_access'|'customers_manage';

type DetailMember={userId:string;displayName:string;role:string;jobTitle:string;enabled:boolean;canConfigure:boolean;permissions:Record<PermissionKey,boolean>};

const GROUPS:{title:string;items:{key:PermissionKey;label:string;help:string}[]}[]=[
  {title:'Visualização',items:[
    {key:'dashboard_view',label:'Ver dashboard',help:'Indicadores e relatórios da oficina.'},
    {key:'appointments_view',label:'Ver agendamentos',help:'Consulta a agenda.'},
    {key:'jobs_view',label:'Ver atendimentos e OS',help:'Consulta OS abertas e histórico.'},
    {key:'quotes_view',label:'Ver orçamentos',help:'Consulta valores, itens e situação.'},
    {key:'billing_view',label:'Ver faturamento',help:'Consulta pendências, recebidos e baixas.'},
  ]},
  {title:'Operação',items:[
    {key:'appointments_manage',label:'Gerenciar agendamentos',help:'Cria, altera e cancela agendamentos.'},
    {key:'jobs_create',label:'Criar atendimento',help:'Abre novas OS.'},
    {key:'jobs_edit',label:'Editar atendimento',help:'Altera dados da OS.'},
    {key:'jobs_advance',label:'Avançar etapas da OS',help:'Move a OS entre as etapas do processo.'},
    {key:'attachments_manage',label:'Fotos e anexos',help:'Adiciona ou remove arquivos da OS.'},
    {key:'ai_use',label:'Usar assistência de IA',help:'Usa sugestões de IA nas etapas.'},
  ]},
  {title:'Orçamentos',items:[
    {key:'quotes_manage',label:'Criar e editar orçamento',help:'Inclui serviços, peças, desconto e observações.'},
    {key:'quotes_share',label:'Compartilhar orçamento',help:'Gera link e envia proposta ao cliente.'},
  ]},
  {title:'Faturamento',items:[
    {key:'billing_manage',label:'Gerenciar faturamento',help:'Altera situação e dados do faturamento.'},
    {key:'billing_collect',label:'Cobrar cliente',help:'Gera cobrança e registra recebimento.'},
  ]},
  {title:'Administração',items:[
    {key:'reports_export',label:'Exportar relatórios e PDF',help:'Baixa documentos e relatórios.'},
    {key:'customers_manage',label:'Gerenciar clientes e veículos',help:'Cadastra e altera clientes e veículos.'},
    {key:'settings_fields',label:'Configurar personalização',help:'Renomeia, mostra, oculta e cria campos.'},
    {key:'settings_operation',label:'Configurar fluxo do processo',help:'Altera etapas, módulos e regras.'},
    {key:'settings_access',label:'Gerenciar acessos',help:'Administra cargos e permissões de outras pessoas.'},
  ]},
];

const ALL_KEYS=GROUPS.flatMap(group=>group.items.map(item=>item.key));
const blankPermissions=()=>Object.fromEntries(ALL_KEYS.map(key=>[key,false])) as Record<PermissionKey,boolean>;
const presets:Record<string,Record<PermissionKey,boolean>>={
  'Somente consulta':{...blankPermissions(),dashboard_view:true,appointments_view:true,jobs_view:true,quotes_view:true},
  'Técnico':{...blankPermissions(),appointments_view:true,jobs_view:true,jobs_edit:true,jobs_advance:true,attachments_manage:true,ai_use:true,reports_export:true},
  'Atendimento':{...blankPermissions(),dashboard_view:true,appointments_view:true,appointments_manage:true,jobs_view:true,jobs_create:true,jobs_edit:true,quotes_view:true,quotes_manage:true,quotes_share:true,attachments_manage:true,ai_use:true,reports_export:true},
  'Financeiro':{...blankPermissions(),dashboard_view:true,jobs_view:true,quotes_view:true,billing_view:true,billing_manage:true,billing_collect:true,reports_export:true},
  'Gestor':Object.fromEntries(ALL_KEYS.map(key=>[key,key!=='settings_access'])) as Record<PermissionKey,boolean>,
};

const permissionCount=(value:Record<PermissionKey,boolean>)=>ALL_KEYS.filter(key=>value[key]).length;
const samePermissions=(a:Record<PermissionKey,boolean>,b:Record<PermissionKey,boolean>)=>ALL_KEYS.every(key=>!!a[key]===!!b[key]);
const presetFor=(value:Record<PermissionKey,boolean>)=>Object.entries(presets).find(([,preset])=>samePermissions(value,preset))?.[0]||'Personalizado';

async function detailRequest<T>(payload:Record<string,unknown>):Promise<T>{
  const {data}=await createStoreClient().auth.getSession();
  if(!data.session) throw new Error('Sua sessão expirou. Entre novamente.');
  const response=await fetch('/api/team/detail',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({})) as {error?:string}&T;
  if(!response.ok) throw new Error(result.error||'Não foi possível concluir a alteração.');
  return result;
}

export function LocalAccountSettings(){
  const access=useStoreAccess();
  const pathname=usePathname();
  const appId=useMemo<AppId>(()=>(pathname.split('/').filter(Boolean)[0] as AppId)||'zeus',[pathname]);
  const app=apps.find(item=>item.slug===appId);
  const appName=app?.name||appId;
  const [members,setMembers]=useState<DetailMember[]>([]);
  const [open,setOpen]=useState('');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [inviteOpen,setInviteOpen]=useState(false);
  const [inviteName,setInviteName]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteTitle,setInviteTitle]=useState('');
  const [invitePreset,setInvitePreset]=useState('Atendimento');
  const [invitePermissions,setInvitePermissions]=useState<Record<PermissionKey,boolean>>({...presets.Atendimento});

  const load=async()=>{
    if(!access.ready||!access.user||!access.account||!access.isOwner) return;
    try{
      const result=await detailRequest<{members:DetailMember[]}>({action:'list',appId});
      setMembers(result.members||[]);
    }catch(reason){setError((reason as Error).message);}
  };
  useEffect(()=>{void load();},[access.ready,access.account?.id,appId]);

  if(!access.ready)return <SettingsSection title="Equipe e acessos" description="Gerencie pessoas, cargos e permissões do aplicativo."><p className="op-muted">Carregando acessos…</p></SettingsSection>;
  if(!access.user)return <SettingsSection title="Equipe e acessos" description="Gerencie pessoas, cargos e permissões do aplicativo."><p className="op-muted">Entre na sua conta para gerenciar acessos.</p></SettingsSection>;
  if(access.error||!access.account||!access.member)return <SettingsSection title="Equipe e acessos" description="Gerencie pessoas, cargos e permissões do aplicativo."><p className="op-muted">{access.error||'Não foi possível carregar a conta.'}</p></SettingsSection>;

  const account=access.account;
  const appActive=account.apps.some(item=>item.appId===appId&&['trialing','active'].includes(item.status));
  const teamFull=account.members.length>=TEAM_LIMIT;
  const clear=()=>{setError('');setMessage('');};
  const updateLocal=(userId:string,patch:Partial<DetailMember>)=>setMembers(current=>current.map(item=>item.userId===userId?{...item,...patch}:item));

  const saveMember=async(member:DetailMember)=>{
    setBusy(`${member.userId}:save`);clear();
    try{
      await detailRequest({action:'update',appId,targetUserId:member.userId,jobTitle:member.jobTitle,permissions:member.permissions});
      await access.refresh();
      setMessage(`Permissões de ${member.displayName} atualizadas.`);
      await load();
    }catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  const toggleAccess=async(member:DetailMember,enabled:boolean)=>{
    setBusy(`${member.userId}:access`);clear();
    try{
      await access.setMemberAppAccess(member.userId,appId,enabled,false);
      setMessage(enabled?`${appName} liberado para ${member.displayName}.`:`Acesso ao ${appName} removido de ${member.displayName}.`);
      await load();
    }catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  const invite=async()=>{
    clear();
    if(teamFull){setError('Esta conta já possui 4 pessoas.');return;}
    if(!inviteName.trim()||!inviteEmail.trim()){setError('Informe nome e e-mail.');return;}
    setBusy('invite');
    try{
      const canConfigure=invitePermissions.settings_fields||invitePermissions.settings_operation||invitePermissions.settings_access||invitePermissions.customers_manage;
      await access.inviteMember(inviteName.trim(),inviteEmail.trim(),[{appId,canConfigure}]);
      await detailRequest({action:'update',appId,email:inviteEmail.trim(),jobTitle:inviteTitle.trim(),permissions:invitePermissions});
      setInviteName('');setInviteEmail('');setInviteTitle('');setInvitePreset('Atendimento');setInvitePermissions({...presets.Atendimento});setInviteOpen(false);
      setMessage('Convite enviado com cargo e permissões definidos.');
      await access.refresh();await load();
    }catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  const remove=async(member:DetailMember)=>{
    if(!window.confirm(`Remover ${member.displayName} da equipe?`))return;
    setBusy(`${member.userId}:remove`);clear();
    try{await access.removeMember(member.userId);setMessage(`${member.displayName} foi removido da equipe.`);await load();}
    catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  const ownApp=access.member.apps.find(item=>item.appId===appId);
  const ownPermissions=(ownApp?.permissions||blankPermissions()) as Record<PermissionKey,boolean>;

  return <SettingsSection title={`Equipe e acessos · ${appName}`} description="Veja a equipe primeiro; abra somente a pessoa que quiser configurar.">
    <div className="access-overview">
      <div><strong>{account.members.length}/{TEAM_LIMIT} pessoas</strong><span>{appActive?`${appName} ativo`:`${appName} inativo`}</span></div>
      {access.isOwner&&<Button variant="secondary" disabled={teamFull||!appActive} onClick={()=>{clear();setInviteOpen(value=>!value);}}><UserPlus size={16}/>{inviteOpen?'Fechar':'Adicionar pessoa'}</Button>}
    </div>

    {!access.isOwner&&<div className="access-self-card"><div><strong>Seu acesso</strong><small>{permissionCount(ownPermissions)} permissões liberadas</small></div><PermissionGrid value={ownPermissions} disabled/></div>}

    {access.isOwner&&inviteOpen&&!teamFull&&<div className="access-editor access-invite">
      <div className="access-editor-head"><div><span>Novo integrante</span><strong>Defina o acesso antes de enviar o convite</strong></div><Badge>{appName}</Badge></div>
      <div className="op-fields access-fields">
        <label className="op-field"><span>Nome</span><input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Nome da pessoa"/></label>
        <label className="op-field"><span>E-mail</span><input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="pessoa@empresa.com.br"/></label>
        <label className="op-field"><span>Cargo / função</span><input value={inviteTitle} onChange={e=>setInviteTitle(e.target.value)} placeholder="Ex.: Técnico, Consultor, Financeiro"/></label>
        <label className="op-field"><span>Perfil de acesso</span><select value={invitePreset} onChange={e=>{setInvitePreset(e.target.value);if(presets[e.target.value])setInvitePermissions({...presets[e.target.value]});}}>{Object.keys(presets).map(name=><option key={name}>{name}</option>)}<option>Personalizado</option></select></label>
      </div>
      <PermissionGrid value={invitePermissions} onChange={next=>{setInvitePermissions(next);setInvitePreset('Personalizado');}}/>
      <div className="op-form-footer"><Button variant="secondary" onClick={()=>setInviteOpen(false)}>Cancelar</Button><Button disabled={busy==='invite'} onClick={()=>void invite()}>{busy==='invite'?'Enviando…':'Enviar convite'}</Button></div>
    </div>}

    {error&&<p className="op-error-text" role="alert">{error}</p>}
    {message&&<p className="op-success-text" role="status">{message}</p>}

    {access.isOwner&&<div className="access-member-list">{members.map(member=>{
      const owner=member.role==='owner';
      const expanded=!owner&&open===member.userId;
      const count=owner?ALL_KEYS.length:permissionCount(member.permissions);
      const profile=owner?'Titular':presetFor(member.permissions);
      return <article className={`access-member-card${expanded?' is-open':''}`} key={member.userId}>
        <div className="access-member-head">
          <div className="access-person"><strong>{member.displayName}{owner&&<Badge>Titular</Badge>}</strong><span>{owner?'Acesso total':member.jobTitle||'Cargo não informado'}</span><small>{owner?'Todas as áreas liberadas.':`${profile} · ${count} permissões`}</small></div>
          {!owner&&<div className="access-member-actions">
            <label className="access-switch"><input type="checkbox" checked={member.enabled} disabled={!!busy} onChange={e=>void toggleAccess(member,e.target.checked)}/><span>{member.enabled?'Ativo':'Sem acesso'}</span></label>
            <button type="button" className="access-configure-button" onClick={()=>setOpen(expanded?'':member.userId)}>{expanded?'Fechar':'Configurar'}{expanded?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
            <button className="op-icon" type="button" disabled={!!busy} aria-label={`Remover ${member.displayName}`} onClick={()=>void remove(member)}><Trash2 size={17}/></button>
          </div>}
        </div>
        {expanded&&<div className="access-member-body">
          <div className="access-editor-top">
            <label className="op-field"><span>Cargo / função</span><input value={member.jobTitle} onChange={e=>updateLocal(member.userId,{jobTitle:e.target.value})} placeholder="Ex.: Técnico, Consultor, Financeiro"/></label>
            <label className="op-field"><span>Perfil de acesso</span><select value={presetFor(member.permissions)} onChange={e=>{if(presets[e.target.value])updateLocal(member.userId,{permissions:{...presets[e.target.value]}});}}>{Object.keys(presets).map(name=><option key={name}>{name}</option>)}<option>Personalizado</option></select></label>
          </div>
          <PermissionGrid value={member.permissions} disabled={!member.enabled} onChange={permissions=>updateLocal(member.userId,{permissions})}/>
          <div className="op-form-footer"><Button disabled={!member.enabled||busy===`${member.userId}:save`} onClick={()=>void saveMember(member)}><Save size={16}/>{busy===`${member.userId}:save`?'Salvando…':'Salvar alterações'}</Button></div>
        </div>}
      </article>;
    })}</div>}

    <style jsx global>{`
      .access-overview{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:2px 0 14px;border-bottom:1px solid var(--op-line);margin-bottom:14px}.access-overview>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.access-overview span{color:var(--op-muted);font-size:13px}
      .access-editor{border:1px solid var(--op-line);border-radius:12px;background:var(--op-soft);padding:16px;margin-bottom:16px}.access-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.access-editor-head>div{display:grid;gap:3px}.access-editor-head span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--op-muted)}.access-editor-head strong{font-size:17px}
      .access-fields{margin-bottom:4px}.access-member-list{display:grid;gap:8px}.access-member-card{border:1px solid var(--op-line);border-radius:12px;background:var(--op-paper);overflow:hidden}.access-member-card.is-open{border-color:color-mix(in srgb,var(--op-accent) 34%,var(--op-line))}
      .access-member-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 16px}.access-person{display:grid;gap:2px;min-width:0}.access-person>strong{display:flex;align-items:center;gap:8px;font-size:15px}.access-person>span{font-size:13px}.access-person>small{color:var(--op-muted)}
      .access-member-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.access-switch{display:flex;align-items:center;gap:7px;min-height:38px;padding:0 10px;border:1px solid var(--op-line);border-radius:9px;font-size:12px;font-weight:700}.access-configure-button{display:flex;align-items:center;gap:7px;min-height:38px;padding:0 11px;border:1px solid var(--op-line);border-radius:9px;background:var(--op-paper);color:var(--op-ink);font-weight:700}.access-configure-button:hover{border-color:var(--op-accent);background:var(--op-tint)}
      .access-member-body{padding:16px;border-top:1px solid var(--op-line);background:color-mix(in srgb,var(--op-soft) 52%,var(--op-paper))}.access-editor-top{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:820px;margin-bottom:14px}
      .access-permission-tabs{display:flex;gap:7px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:thin}.access-permission-tabs button{display:flex;align-items:center;gap:7px;min-height:36px;padding:0 10px;border:1px solid var(--op-line);border-radius:999px;background:var(--op-paper);color:var(--op-ink);font-weight:750;white-space:nowrap;cursor:pointer}.access-permission-tabs button small{color:var(--op-muted);font-size:11px}.access-permission-tabs button.is-active{border-color:var(--op-accent);background:var(--op-accent);color:#fff}.access-permission-tabs button.is-active small{color:rgba(255,255,255,.8)}
      .access-permission-grid{display:grid;grid-template-columns:1fr;gap:10px}.access-permission-group{border:1px solid var(--op-line);border-radius:11px;background:var(--op-paper);padding:12px}.access-permission-group>strong{display:block;margin-bottom:8px;font-size:14px}.access-permission-items{display:grid;gap:5px}.access-permission-item{display:grid;grid-template-columns:20px minmax(0,1fr);gap:9px;align-items:start;padding:8px;border-radius:8px}.access-permission-item:hover{background:var(--op-soft)}.access-permission-item>span{display:grid;gap:2px}.access-permission-item>span>strong{font-size:13px}.access-permission-item small{color:var(--op-muted);line-height:1.35}.access-self-card{border:1px solid var(--op-line);border-radius:12px;padding:16px}.access-self-card>div{display:grid;gap:3px}.access-self-card>div small{color:var(--op-muted)}.op-success-text{padding:10px 12px;border:1px solid color-mix(in srgb,#198754 30%,var(--op-line));background:color-mix(in srgb,#198754 8%,var(--op-paper));border-radius:10px}
      @media(max-width:900px){.access-editor-top{grid-template-columns:1fr}.access-member-head{align-items:flex-start;flex-direction:column}.access-member-actions{width:100%;justify-content:flex-start}}
      @media(max-width:600px){.access-overview{align-items:flex-start;flex-direction:column}.access-overview>.op-button{width:100%}.access-member-actions{display:grid;grid-template-columns:1fr auto;width:100%}.access-switch,.access-configure-button{justify-content:center}.access-configure-button{grid-column:1/-1}.access-member-body,.access-member-head,.access-editor{padding:14px}.access-permission-tabs{margin-right:-6px}}
    `}</style>
  </SettingsSection>;
}

function PermissionGrid({value,onChange,disabled=false}:{value:Record<PermissionKey,boolean>;onChange?:(value:Record<PermissionKey,boolean>)=>void;disabled?:boolean}){
  const [activeGroup,setActiveGroup]=useState(GROUPS[0].title);
  const group=GROUPS.find(item=>item.title===activeGroup)||GROUPS[0];
  const toggle=(key:PermissionKey,checked:boolean)=>onChange?.({...value,[key]:checked});
  return <>
    <div className="access-permission-tabs" role="tablist" aria-label="Filtrar permissões">
      {GROUPS.map(item=>{
        const enabled=item.items.filter(permission=>value[permission.key]).length;
        const active=item.title===activeGroup;
        return <button type="button" role="tab" aria-selected={active} className={active?'is-active':''} onClick={()=>setActiveGroup(item.title)} key={item.title}><span>{item.title}</span><small>{enabled}/{item.items.length}</small></button>;
      })}
    </div>
    <div className="access-permission-grid"><div className="access-permission-group"><strong>{group.title}</strong><div className="access-permission-items">{group.items.map(item=><label className="access-permission-item" key={item.key} style={{opacity:disabled?.62:1}}><input type="checkbox" checked={!!value[item.key]} disabled={disabled} onChange={e=>toggle(item.key,e.target.checked)}/><span><strong>{item.label}</strong><small>{item.help}</small></span></label>)}</div></div></div>
  </>;
}
