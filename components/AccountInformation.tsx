'use client';

import Link from 'next/link';
import { Building2, IdCard, KeyRound, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';

type IdentitySummary={registered?:boolean;masked?:string|null;verified?:boolean};

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
  const [cpfDisplay,setCpfDisplay]=useState('Carregando…');
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
    const accountId=access.account?.id;
    setLoadingProfile(true);
    void (async()=>{
      try{
        const [profileResult,accountResult,identityResult]=await Promise.all([
          supabase.from('profiles').select('phone').eq('user_id',userId).maybeSingle(),
          accountId?supabase.from('accounts').select('cnpj').eq('id',accountId).maybeSingle():Promise.resolve({data:null,error:null}),
          supabase.rpc('current_identity_summary')
        ]);
        if(!active)return;
        setPhone(String(profileResult.data?.phone||''));
        if(accountResult.data&&'cnpj' in accountResult.data)setCnpj(formatCnpj(String(accountResult.data.cnpj||'')));
        const identity=(identityResult.data||null) as IdentitySummary|null;
        if(identity?.registered){
          setCpfDisplay(identity.masked||`${identity.verified?'CPF validado':'CPF cadastrado'} (protegido)`);
        }else{
          setCpfDisplay('CPF não localizado');
        }
      }catch{
        if(active)setCpfDisplay('CPF cadastrado (protegido)');
      }finally{
        if(active)setLoadingProfile(false);
      }
    })();
    return()=>{active=false;};
  },[access.ready,access.user,access.member?.displayName,access.account?.id,access.account?.name]);

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
    const cleanCnpj=cnpj.replace(/\D/g,'');
    if(!cleanName){setError('Informe seu nome.');return;}
    if(access.isOwner&&!cleanCompany){setError('Informe o nome da empresa.');return;}
    if(access.isOwner&&cleanCnpj&&!validCnpj(cleanCnpj)){setError('Informe um CNPJ válido.');return;}
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
        const {error:accountError}=await supabase.from('accounts').update({
          name:cleanCompany,
          cnpj:cleanCnpj||null,
          updated_at:new Date().toISOString()
        }).eq('id',currentAccount.id);
        if(accountError)throw accountError;
      }

      await access.refresh();
      setCnpj(formatCnpj(cleanCnpj));
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
        <label><span>CPF</span><div className="account-input-icon is-readonly"><IdCard size={16}/><input value={cpfDisplay} readOnly aria-readonly="true"/></div><small>O CPF usado na validação fica protegido e não é armazenado em texto aberto.</small></label>
        <label><span>Telefone</span><div className="account-input-icon"><Phone size={16}/><input value={phone} onChange={event=>setPhone(event.target.value)} placeholder="(00) 00000-0000" autoComplete="tel" disabled={loadingProfile}/></div></label>
        <label><span>E-mail</span><div className="account-input-icon is-readonly"><Mail size={16}/><input value={currentUser.email||''} readOnly aria-readonly="true"/></div><small>O e-mail de acesso é controlado pela autenticação da conta.</small></label>
      </section>

      <section className="account-details-card">
        <div className="account-details-heading"><Building2 size={19}/><div><h2>Empresa</h2><p>Identificação da empresa central desta conta.</p></div></div>
        <label><span>Nome da empresa</span><input value={companyName} onChange={event=>setCompanyName(event.target.value)} disabled={!access.isOwner} required={access.isOwner}/>{!access.isOwner&&<small>Somente o titular pode alterar os dados da empresa.</small>}</label>
        <label><span>CNPJ</span><div className={!access.isOwner?'account-input-icon is-readonly':'account-input-icon'}><Building2 size={16}/><input value={cnpj} onChange={event=>setCnpj(formatCnpj(event.target.value))} placeholder="00.000.000/0000-00" inputMode="numeric" maxLength={18} disabled={!access.isOwner}/></div><small>{access.isOwner?'Informe o CNPJ da empresa. A validação também acontece no banco.':'Somente o titular pode alterar o CNPJ.'}</small></label>
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
