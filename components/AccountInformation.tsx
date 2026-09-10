'use client';

import Link from 'next/link';
import { Building2, KeyRound, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';

export function AccountInformation(){
  const access=useStoreAccess();
  const [displayName,setDisplayName]=useState('');
  const [phone,setPhone]=useState('');
  const [companyName,setCompanyName]=useState('');
  const [loadingProfile,setLoadingProfile]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!access.ready||!access.user)return;
    setDisplayName(access.member?.displayName||String(access.user.user_metadata?.name||''));
    setCompanyName(access.account?.name||'');
    let active=true;
    const supabase=createStoreClient();
    const userId=access.user.id;
    setLoadingProfile(true);
    void (async()=>{
      try{
        const {data}=await supabase.from('profiles').select('phone').eq('user_id',userId).maybeSingle();
        if(active)setPhone(String(data?.phone||''));
      }finally{
        if(active)setLoadingProfile(false);
      }
    })();
    return()=>{active=false;};
  },[access.ready,access.user,access.member?.displayName,access.account?.name]);

  if(!access.ready)return <div className="entry-loading">Carregando suas informações…</div>;
  if(!access.user)return <section className="account-details-empty"><h1>Entre para acessar suas informações.</h1><Link className="primary" href="/login?redirect=%2Fminhas-informacoes">Entrar</Link></section>;
  if(access.error)return <section className="account-details-empty"><h1>Não foi possível carregar sua conta.</h1><p>{access.error}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></section>;
  if(!access.account||!access.member)return <section className="account-details-empty"><h1>Conta incompleta.</h1><p>Finalize o vínculo da empresa antes de editar estas informações.</p></section>;

  const currentUser=access.user;
  const currentAccount=access.account;

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setMessage('');
    setError('');
    const cleanName=displayName.trim();
    const cleanPhone=phone.trim();
    const cleanCompany=companyName.trim();
    if(!cleanName){setError('Informe seu nome.');return;}
    if(access.isOwner&&!cleanCompany){setError('Informe o nome da empresa.');return;}
    setSaving(true);
    try{
      const supabase=createStoreClient();
      const {error:authError}=await supabase.auth.updateUser({data:{name:cleanName}});
      if(authError)throw authError;

      const {error:profileError}=await supabase.from('profiles').upsert({
        user_id:currentUser.id,
        display_name:cleanName,
        phone:cleanPhone||null,
        updated_at:new Date().toISOString()
      },{onConflict:'user_id'});
      if(profileError)throw profileError;

      if(access.isOwner&&cleanCompany!==currentAccount.name){
        const {error:accountError}=await supabase.from('accounts').update({
          name:cleanCompany,
          updated_at:new Date().toISOString()
        }).eq('id',currentAccount.id);
        if(accountError)throw accountError;
      }

      await access.refresh();
      setMessage('Informações atualizadas.');
    }catch(reason){
      setError((reason as {message?:string}).message||'Não foi possível salvar suas informações.');
    }finally{setSaving(false);}
  };

  return <>
    <section className="account-details-intro">
      <div><span className="account-kicker">Conta</span><h1>Minhas informações</h1><p>Dados pessoais e informações principais da empresa vinculada à sua conta CRM PLUS.</p></div>
    </section>

    <form className="account-details-grid" onSubmit={submit}>
      <section className="account-details-card">
        <div className="account-details-heading"><UserRound size={19}/><div><h2>Informações pessoais</h2><p>Dados usados para identificar você dentro da conta.</p></div></div>
        <label><span>Nome</span><input value={displayName} onChange={event=>setDisplayName(event.target.value)} autoComplete="name" required/></label>
        <label><span>Telefone</span><div className="account-input-icon"><Phone size={16}/><input value={phone} onChange={event=>setPhone(event.target.value)} placeholder="(00) 00000-0000" autoComplete="tel" disabled={loadingProfile}/></div></label>
        <label><span>E-mail</span><div className="account-input-icon is-readonly"><Mail size={16}/><input value={currentUser.email||''} readOnly aria-readonly="true"/></div><small>O e-mail de acesso é controlado pela autenticação da conta.</small></label>
      </section>

      <section className="account-details-card">
        <div className="account-details-heading"><Building2 size={19}/><div><h2>Empresa</h2><p>Identificação da empresa central desta conta.</p></div></div>
        <label><span>Nome da empresa</span><input value={companyName} onChange={event=>setCompanyName(event.target.value)} disabled={!access.isOwner} required={access.isOwner}/>{!access.isOwner&&<small>Somente o titular pode alterar o nome da empresa.</small>}</label>
        <div className="account-readout"><ShieldCheck size={17}/><div><span>Seu perfil</span><strong>{access.isOwner?'Titular':'Usuário'}</strong></div></div>
        <div className="account-readout"><Building2 size={17}/><div><span>Status da empresa</span><strong>{currentAccount.status==='active'?'Ativa':currentAccount.status==='suspended'?'Suspensa':'Encerrada'}</strong></div></div>
      </section>

      <section className="account-security-card">
        <div><KeyRound size={18}/><span><strong>Senha e segurança</strong><small>Troque sua senha, recupere acesso e gerencie a autenticação em dois fatores.</small></span></div>
        <Link className="ghost small" href="/seguranca">Gerenciar segurança</Link>
      </section>

      {(error||message)&&<div className={`account-form-feedback ${error?'is-error':'is-success'}`} role={error?'alert':'status'}>{error||message}</div>}
      <div className="account-form-actions"><button className="primary" type="submit" disabled={saving}><Save size={16}/>{saving?'Salvando…':'Salvar alterações'}</button></div>
    </form>
  </>;
}
