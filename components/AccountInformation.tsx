'use client';

import Link from 'next/link';
import { AlertTriangle, Building2, IdCard, KeyRound, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { clientMessage } from '@/lib/clientMessage';
import { createStoreClient } from '@/lib/supabase/storeClient';

function formatCnpj(value:string){
  const digits=value.replace(/\D/g,'').slice(0,14);
  return digits
    .replace(/^(\d{2})(\d)/,'$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
    .replace(/\.(\d{3})(\d)/,'.$1/$2')
    .replace(/(\d{4})(\d)/,'$1-$2');
}

function validCnpj(value:string){
  const digits=value.replace(/\D/g,'');
  if(digits.length!==14||/^(\d)\1{13}$/.test(digits))return false;
  const digit=(length:number)=>{
    const numbers=digits.slice(0,length);
    let factor=length-7;
    let total=0;
    for(const current of numbers){
      total+=Number(current)*factor--;
      if(factor<2)factor=9;
    }
    const result=11-(total%11);
    return result>9?0:result;
  };
  return digit(12)===Number(digits[12])&&digit(13)===Number(digits[13]);
}

export function AccountInformation(){
  const access=useStoreAccess();
  const [displayName,setDisplayName]=useState('');
  const [phone,setPhone]=useState('');
  const [companyName,setCompanyName]=useState('');
  const [cnpj,setCnpj]=useState('');
  const [loadingProfile,setLoadingProfile]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!access.ready||!access.user)return;
    setDisplayName(access.member?.displayName||String(access.user.user_metadata?.name||''));
    setCompanyName(access.account?.name||'');
    setCnpj(formatCnpj(String(access.account?.cnpj||'')));
    let active=true;
    const supabase=createStoreClient();
    const userId=access.user.id;
    setLoadingProfile(true);
    void (async()=>{
      try{
        const result=await supabase.from('profiles').select('phone').eq('user_id',userId).maybeSingle();
        if(active)setPhone(String(result.data?.phone||''));
      }catch{
        // Mantém o campo editável mesmo se a consulta do telefone falhar.
      }finally{
        if(active)setLoadingProfile(false);
      }
    })();
    return()=>{active=false;};
  },[access.ready,access.user,access.member?.displayName,access.account?.id,access.account?.name,access.account?.cnpj]);

  if(!access.ready)return <div className="entry-loading">Carregando suas informações…</div>;
  if(!access.user)return <section className="account-details-empty"><h1>Entre para acessar suas informações.</h1><Link className="primary" href="/login?redirect=%2Fminhas-informacoes">Entrar</Link></section>;
  if(access.error)return <section className="account-details-empty"><h1>Não foi possível carregar sua conta.</h1><p>{clientMessage(access.error,'Tente novamente em alguns instantes.')}</p><button className="ghost" onClick={()=>void access.refresh()}>Tentar novamente</button></section>;
  if(!access.account||!access.member)return <section className="account-details-empty"><h1>Conta incompleta.</h1><p>Finalize os dados da conta antes de editar estas informações.</p></section>;

  const currentUser=access.user;
  const currentAccount=access.account;
  const isPJ=currentAccount.personType==='pj';
  const cpfRegistered=access.identityStatus?.registered===true;
  const pendingItems=[
    ...(!cpfRegistered?['CPF do titular']:[]),
    ...(isPJ&&!currentAccount.cnpj?['CNPJ da empresa']:[]),
  ];

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setMessage('');
    setError('');
    const cleanName=displayName.trim();
    const cleanPhone=phone.trim();
    const cleanCompany=companyName.trim();
    const cleanCnpj=cnpj.replace(/\D/g,'');
    if(!cleanName){setError('Informe seu nome.');return;}
    if(access.isOwner&&!cleanCompany){setError(isPJ?'Informe o nome da empresa.':'Informe o nome do negócio.');return;}
    if(access.isOwner&&isPJ&&!cleanCnpj){setError('Informe o CNPJ da empresa.');return;}
    if(access.isOwner&&isPJ&&!validCnpj(cleanCnpj)){setError('Informe um CNPJ válido.');return;}
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

      if(access.isOwner){
        const update=isPJ
          ? {name:cleanCompany,cnpj:cleanCnpj,updated_at:new Date().toISOString()}
          : {name:cleanCompany,updated_at:new Date().toISOString()};
        const {error:accountError}=await supabase.from('accounts').update(update).eq('id',currentAccount.id);
        if(accountError)throw accountError;
      }

      await access.refresh();
      if(isPJ)setCnpj(formatCnpj(cleanCnpj));
      setMessage('Informações atualizadas.');
    }catch(reason){
      setError(clientMessage(reason,'Não foi possível salvar suas informações.'));
    }finally{setSaving(false);}
  };

  return <>
    <section className="account-details-intro">
      <div><span className="account-kicker">Conta</span><h1>Minhas informações</h1><p>Dados pessoais e informações principais vinculadas à sua conta CRM PLUS.</p></div>
    </section>

    {pendingItems.length>0&&<div className="account-data-pending" role="status"><AlertTriangle size={18}/><div><strong>Dados pendentes</strong><p>Precisamos completar: {pendingItems.join(' e ')}.</p></div></div>}

    <form className="account-details-grid" onSubmit={submit}>
      <section className="account-details-card">
        <div className="account-details-heading"><UserRound size={19}/><div><h2>Informações pessoais</h2><p>Dados usados para identificar você dentro da conta.</p></div></div>
        <label><span>Nome</span><input value={displayName} onChange={event=>setDisplayName(event.target.value)} autoComplete="name" required/></label>
        <label><span>CPF</span><div className="account-input-icon is-readonly"><IdCard size={16}/><input value={cpfRegistered?(access.identityStatus?.verified?'CPF validado':'CPF cadastrado'):'CPF pendente'} readOnly aria-readonly="true"/></div><small>{cpfRegistered?'CPF vinculado ao titular da conta.':'CPF não localizado no cadastro. Entre em contato com o suporte para regularizar.'}</small></label>
        <label><span>Telefone</span><div className="account-input-icon"><Phone size={16}/><input value={phone} onChange={event=>setPhone(event.target.value)} placeholder="(00) 00000-0000" autoComplete="tel" disabled={loadingProfile}/></div></label>
        <label><span>E-mail</span><div className="account-input-icon is-readonly"><Mail size={16}/><input value={currentUser.email||''} readOnly aria-readonly="true"/></div><small>Este é o e-mail usado para entrar na sua conta.</small></label>
      </section>

      <div className="account-details-side">
        <section className="account-details-card">
          <div className="account-details-heading"><Building2 size={19}/><div><h2>{isPJ?'Empresa':'Conta profissional'}</h2><p>{isPJ?'Dados principais da empresa desta conta.':'Dados principais do negócio vinculado à sua conta.'}</p></div></div>
          <label><span>{isPJ?'Nome da empresa':'Nome do negócio'}</span><input value={companyName} onChange={event=>setCompanyName(event.target.value)} disabled={!access.isOwner} required={access.isOwner}/>{!access.isOwner&&<small>Somente o titular pode alterar este dado.</small>}</label>
          {isPJ&&<label><span>CNPJ</span><div className={!access.isOwner?'account-input-icon is-readonly':'account-input-icon'}><Building2 size={16}/><input value={cnpj} onChange={event=>setCnpj(formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" maxLength={18} disabled={!access.isOwner} required={access.isOwner}/></div><small>{access.isOwner?'CNPJ usado para identificar a empresa.':'Somente o titular pode alterar o CNPJ.'}</small></label>}
          <div className="account-readout"><ShieldCheck size={17}/><div><span>Tipo de conta</span><strong>{isPJ?'Pessoa jurídica':'Pessoa física'}</strong></div></div>
          <div className="account-readout"><ShieldCheck size={17}/><div><span>Seu perfil</span><strong>{access.isOwner?'Titular':'Usuário'}</strong></div></div>
          <div className="account-readout"><Building2 size={17}/><div><span>Status do cadastro</span><strong>{currentAccount.status==='active'?'Concluído':currentAccount.status==='suspended'?'Suspenso':'Encerrado'}</strong></div></div>
        </section>

        <section className="account-security-card">
          <div><KeyRound size={18}/><span><strong>Senha e segurança</strong><small>Troque sua senha, recupere acesso e gerencie a verificação em duas etapas.</small></span></div>
          <Link className="ghost small" href="/seguranca">Gerenciar segurança</Link>
        </section>
      </div>

      {(error||message)&&<div className={`account-form-feedback ${error?'is-error':'is-success'}`} role={error?'alert':'status'}>{error||message}</div>}
      <div className="account-form-actions"><span>Revise os dados antes de salvar.</span><button className="primary" type="submit" disabled={saving}><Save size={16}/>{saving?'Salvando…':'Salvar alterações'}</button></div>
    </form>
  </>;
}