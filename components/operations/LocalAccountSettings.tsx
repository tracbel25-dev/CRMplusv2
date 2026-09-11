'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronUp, Save, Trash2, UserPlus } from 'lucide-react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { Badge, Button, Section } from './ui';

const TEAM_LIMIT=4;

type PermissionKey =
  | 'dashboard_view'|'appointments_view'|'appointments_manage'|'jobs_view'|'jobs_create'|'jobs_edit'|'jobs_advance'
  | 'quotes_view'|'quotes_manage'|'quotes_share'|'billing_view'|'billing_manage'|'billing_collect'|'reports_export'
  | 'attachments_manage'|'ai_use'|'settings_fields'|'settings_operation'|'settings_access'|'customers_manage';

type DetailMember={userId:string;displayName:string;role:string;jobTitle:string;enabled:boolean;canConfigure:boolean;permissions:Record<PermissionKey,boolean>};

const GROUPS:{title:string;items:{key:PermissionKey;label:string;help:string}[]}[]=[
  {title:'Visualização',items:[
    {key:'dashboard_view',label:'Ver dashboard',help:'Acessa indicadores e relatórios gerenciais.'},
    {key:'appointments_view',label:'Ver agendamentos',help:'Consulta a agenda da oficina.'},
    {key:'jobs_view',label:'Ver atendimentos e OS',help:'Consulta ordens de serviço e histórico.'},
    {key:'quotes_view',label:'Ver orçamentos',help:'Consulta valores, itens e situação dos orçamentos.'},
    {key:'billing_view',label:'Ver faturamento',help:'Consulta valores pendentes, pagos e baixados.'},
  ]},
  {title:'Operação',items:[
    {key:'appointments_manage',label:'Gerenciar agendamentos',help:'Cria, altera e cancela agendamentos.'},
    {key:'jobs_create',label:'Criar atendimento',help:'Pode abrir novas OS.'},
    {key:'jobs_edit',label:'Editar atendimento',help:'Altera dados da OS enquanto ela estiver aberta.'},
    {key:'jobs_advance',label:'Avançar etapas da OS',help:'Move a OS entre diagnóstico, orçamento, execução e entrega.'},
    {key:'attachments_manage',label:'Fotos e anexos',help:'Adiciona ou remove arquivos da OS.'},
    {key:'ai_use',label:'Usar assistência de IA',help:'Pode pedir sugestões da IA nas etapas do processo.'},
  ]},
  {title:'Orçamentos',items:[
    {key:'quotes_manage',label:'Criar e editar orçamento',help:'Inclui serviços, peças, desconto e observações.'},
    {key:'quotes_share',label:'Compartilhar orçamento',help:'Gera link e envia proposta ao cliente.'},
  ]},
  {title:'Faturamento',items:[
    {key:'billing_manage',label:'Gerenciar faturamento',help:'Altera situação e dados do faturamento.'},
    {key:'billing_collect',label:'Cobrar cliente',help:'Pode gerar cobrança e registrar recebimento.'},
  ]},
  {title:'Administração',items:[
    {key:'reports_export',label:'Exportar relatórios e PDF',help:'Baixa documentos e relatórios.'},
    {key:'customers_manage',label:'Gerenciar clientes e veículos',help:'Cadastra e altera clientes e itens atendidos.'},
    {key:'settings_fields',label:'Configurar campos',help:'Renomeia, mostra, oculta e cria campos.'},
    {key:'settings_operation',label:'Configurar operação',help:'Altera etapas, módulos e regras do aplicativo.'},
    {key:'settings_access',label:'Gerenciar acessos',help:'Pode administrar permissões de outras pessoas.'},
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

  if(!access.ready)return <Section title="Acessos"><p className="op-muted">Carregando acessos…</p></Section>;
  if(!access.user)return <Section title="Acessos"><p className="op-muted">Entre na sua conta para gerenciar acessos.</p></Section>;
  if(access.error||!access.account||!access.member)return <Section title="Acessos"><p className="op-muted">{access.error||'Não foi possível carregar a conta.'}</p></Section>;

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
      setMessage('Convite enviado com as permissões definidas.');
      await access.refresh();await load();
    }catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  const remove=async(member:DetailMember)=>{
    if(!window.confirm(`Remover ${member.displayName} da equipe?`))return;
    setBusy(`${member.userId}:remove`);clear();
    try{await access.removeMember(member.userId);setMessage(`${member.displayName} foi removido da equipe.`);await load();}
    catch(reason){setError((reason as Error).message);}finally{setBusy('');}
  };

  return <Section title={`Equipe e acessos · ${appName}`}>
    <div className="op-account-summary">
      <div><span>Conta</span><strong>{account.name}</strong></div>
      <div><span>Seu acesso</span><strong>{access.member.displayName}</strong><small>{access.isOwner?'Titular':'Usuário'}</small></div>
      <div><span>Pessoas</span><strong>{account.members.length}/{TEAM_LIMIT}</strong></div>
      <div><span>Aplicativo</span><strong>{appName}</strong><small>{appActive?'Ativo':'Inativo'}</small></div>
    </div>
    <p className="op-muted">Defina cargo e exatamente o que cada pessoa pode consultar, alterar, aprovar ou administrar dentro deste aplicativo.</p>

    {access.isOwner&&<div className="op-form-footer" style={{justifyContent:'flex-start'}}><Button variant="secondary" disabled={teamFull||!appActive} onClick={()=>{clear();setInviteOpen(value=>!value);}}><UserPlus size={16}/>{inviteOpen?'Fechar':'Adicionar pessoa'}</Button></div>}

    {access.isOwner&&inviteOpen&&!teamFull&&<div className="op-config-runtime-note" style={{marginTop:16}}>
      <strong>Novo acesso ao {appName}</strong>
      <div className="op-fields" style={{marginTop:12}}>
        <label className="op-field"><span>Nome</span><input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Nome da pessoa"/></label>
        <label className="op-field"><span>E-mail</span><input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="pessoa@empresa.com.br"/></label>
        <label className="op-field"><span>Cargo / função</span><input value={inviteTitle} onChange={e=>setInviteTitle(e.target.value)} placeholder="Ex.: Técnico, Consultor, Financeiro"/></label>
        <label className="op-field"><span>Perfil inicial</span><select value={invitePreset} onChange={e=>{setInvitePreset(e.target.value);if(presets[e.target.value])setInvitePermissions({...presets[e.target.value]});}}>{Object.keys(presets).map(name=><option key={name}>{name}</option>)}<option>Personalizado</option></select></label>
      </div>
      <PermissionGrid value={invitePermissions} onChange={next=>{setInvitePermissions(next);setInvitePreset('Personalizado');}}/>
      <div className="op-form-footer"><Button variant="secondary" onClick={()=>setInviteOpen(false)}>Cancelar</Button><Button disabled={busy==='invite'} onClick={()=>void invite()}>{busy==='invite'?'Enviando…':'Enviar convite'}</Button></div>
    </div>}

    {error&&<p className="op-error-text" role="alert">{error}</p>}
    {message&&<p className="op-muted" role="status">{message}</p>}

    <div className="op-access-list" style={{marginTop:16}}>{members.map(member=>{
      const owner=member.role==='owner';
      const expanded=open===member.userId;
      return <div className="op-access-member" key={member.userId} style={{display:'block'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div className="op-grow"><strong>{member.displayName}{owner&&<Badge>Titular</Badge>}</strong><small>{owner?'Acesso total.':member.jobTitle||'Cargo não informado'}</small></div>
          {!owner&&<label className="op-module-choice" style={{margin:0,padding:'8px 12px'}}><input type="checkbox" checked={member.enabled} disabled={!!busy} onChange={e=>void toggleAccess(member,e.target.checked)}/><span><strong>Acessar</strong></span></label>}
          <button type="button" className="op-icon" aria-label={expanded?'Fechar detalhes':'Abrir detalhes'} onClick={()=>setOpen(expanded?'':member.userId)}>{expanded?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button>
          {access.isOwner&&!owner&&<button className="op-icon" type="button" disabled={!!busy} aria-label={`Remover ${member.displayName}`} onClick={()=>void remove(member)}><Trash2 size={17}/></button>}
        </div>
        {expanded&&<div style={{marginTop:16,paddingTop:16,borderTop:'1px solid var(--op-line)'}}>
          <label className="op-field" style={{maxWidth:420}}><span>Cargo / função</span><input value={member.jobTitle} disabled={owner} onChange={e=>updateLocal(member.userId,{jobTitle:e.target.value})} placeholder="Ex.: Técnico, Consultor, Financeiro"/></label>
          {owner?<p className="op-muted">O titular possui todas as permissões e não pode ser limitado.</p>:<PermissionGrid value={member.permissions} disabled={!member.enabled} onChange={permissions=>updateLocal(member.userId,{permissions})}/>} 
          {!owner&&<div className="op-form-footer"><Button disabled={!member.enabled||busy===`${member.userId}:save`} onClick={()=>void saveMember(member)}><Save size={16}/>{busy===`${member.userId}:save`?'Salvando…':'Salvar permissões'}</Button></div>}
        </div>}
      </div>;
    })}</div>
    {!access.isOwner&&<p className="op-muted">Somente o titular pode alterar cargos e permissões da equipe.</p>}
  </Section>;
}

function PermissionGrid({value,onChange,disabled=false}:{value:Record<PermissionKey,boolean>;onChange?:(value:Record<PermissionKey,boolean>)=>void;disabled?:boolean}){
  const toggle=(key:PermissionKey,checked:boolean)=>onChange?.({...value,[key]:checked});
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12,marginTop:16}}>{GROUPS.map(group=><div key={group.title} style={{border:'1px solid var(--op-line)',borderRadius:12,padding:14,background:'var(--op-paper)'}}><strong>{group.title}</strong><div style={{display:'grid',gap:10,marginTop:12}}>{group.items.map(item=><label key={item.key} style={{display:'grid',gridTemplateColumns:'20px 1fr',gap:9,alignItems:'start',opacity:disabled?.6:1}}><input type="checkbox" checked={!!value[item.key]} disabled={disabled} onChange={e=>toggle(item.key,e.target.checked)}/><span><strong style={{display:'block',fontSize:14}}>{item.label}</strong><small className="op-muted">{item.help}</small></span></label>)}</div></div>)}</div>;
}
