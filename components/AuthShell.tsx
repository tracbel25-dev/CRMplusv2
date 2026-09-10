'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apps } from '@/lib/catalog';
import { precheckSignupIdentity } from '@/lib/antifraud';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';

export function AuthShell({mode,app,redirectTo}:{mode:'login'|'signup';app?:AppId;redirectTo?:string}){
  const signup=mode==='signup';
  const router=useRouter();
  const initialApp=useMemo<AppId>(()=>app||'zeus',[app]);
  const [selectedApp,setSelectedApp]=useState<AppId>(initialApp);
  const [name,setName]=useState('');
  const [business,setBusiness]=useState('');
  const [cpf,setCpf]=useState('');
  const [birthDate,setBirthDate]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [checkingSession,setCheckingSession]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [pendingConfirmation,setPendingConfirmation]=useState(false);
  const requestedDestination=redirectTo&&redirectTo.startsWith('/')&&!redirectTo.startsWith('//')&&!redirectTo.includes('\\')?redirectTo:'/conta';

  const continueAfterAuth=useCallback(async()=>{
    const supabase=createStoreClient();
    const {data:factors,error:factorsError}=await supabase.auth.mfa.listFactors();
    const hasVerifiedTotp=!factorsError&&factors.totp.some(item=>item.status==='verified');
    if(hasVerifiedTotp){
      const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aalError)throw aalError;
      if(aal.currentLevel!=='aal2'&&aal.nextLevel==='aal2'){
        router.replace(`/verificar-2fa?redirect=${encodeURIComponent(requestedDestination)}`);
        router.refresh();
        return;
      }
    }
    router.replace(requestedDestination);
    router.refresh();
  },[requestedDestination,router]);

  useEffect(()=>{
    let active=true;
    const supabase=createStoreClient();

    void supabase.auth.getSession().then(async({data})=>{
      if(!active)return;
      if(data.session?.user){
        try{await continueAfterAuth();}catch{router.replace(requestedDestination);router.refresh();}
        return;
      }
      setCheckingSession(false);
    }).catch(()=>{if(active)setCheckingSession(false);});

    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!active||!session?.user)return;
      void continueAfterAuth().catch(()=>{router.replace(requestedDestination);router.refresh();});
    });

    return()=>{active=false;data.subscription.unsubscribe();};
  },[continueAfterAuth,requestedDestination,router]);

  const resendConfirmation=async()=>{
    const normalized=email.trim().toLowerCase();
    if(!normalized){setError('Informe o e-mail usado no cadastro.');return;}
    setError('');setMessage('');setLoading(true);
    try{
      const supabase=createStoreClient();
      const {error:resendError}=await supabase.auth.resend({type:'signup',email:normalized,options:{emailRedirectTo:`${window.location.origin}/auth/confirm`}});
      if(resendError)throw resendError;
      setMessage('Novo e-mail de confirmação enviado. Confira também a caixa de spam.');
    }catch(reason){setError((reason as Error).message||'Não foi possível reenviar a confirmação.');}
    finally{setLoading(false);}
  };

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError('');setMessage('');setPendingConfirmation(false);
    if(password.length<8){setError('Use uma senha com pelo menos 8 caracteres.');return;}
    setLoading(true);
    try{
      const supabase=createStoreClient();
      if(signup){
        if(!name.trim()||!business.trim())throw new Error('Informe seu nome e o nome do negócio.');
        const identity=await precheckSignupIdentity({cpf,name:name.trim(),birthDate,email:email.trim().toLowerCase()});
        const {data, error:signUpError}=await supabase.auth.signUp({
          email:email.trim().toLowerCase(),
          password,
          options:{
            data:{
              name:name.trim(),
              business:business.trim(),
              requested_app:selectedApp,
              signup_redirect:requestedDestination,
              identity_reservation:identity.reservationToken,
            },
            emailRedirectTo:`${window.location.origin}/auth/confirm`
          }
        });
        if(signUpError)throw signUpError;
        if(data.session){
          const {data:createdAccount,error:accountError}=await supabase.rpc('create_account',{account_name:business.trim()});
          if(accountError)throw accountError;
          const accountId=typeof createdAccount==='string'?createdAccount:'';
          if(!accountId)throw new Error('Não foi possível concluir o vínculo da empresa.');
          const {error:identityError}=await supabase.rpc('finalize_signup_identity',{
            reservation_token:identity.reservationToken,
            target_account:accountId,
          });
          if(identityError)throw new Error('Não foi possível concluir a validação do cadastro.');
          await supabase.auth.updateUser({data:{signup_redirect:null,identity_reservation:null}});
          await continueAfterAuth();
        }else{
          setPendingConfirmation(true);
          setMessage(identity.verification==='official'
            ?'Dados validados. Enviamos um e-mail para confirmar seu endereço e ativar a conta.'
            :'CPF validado. Enviamos um e-mail para confirmar seu endereço e ativar a conta.');
        }
      }else{
        const {error:loginError}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
        if(loginError)throw loginError;
        await continueAfterAuth();
      }
    }catch(reason){
      const text=(reason as {message?:string}).message||'Não foi possível concluir o acesso.';
      setError(text==='Invalid login credentials'?'E-mail ou senha incorretos.':text);
    }finally{setLoading(false);}
  };

  if(checkingSession)return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">Acesso</span><h1>Carregando sua conta…</h1><p>Verificando sua sessão.</p></section></main>;

  return <main className="auth-shell">
    <Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link>
    <section className="auth-card">
      <span className="eyebrow">{signup?'Criar conta':'Acesso'}</span>
      <h1>{signup?'Crie sua conta CRM PLUS.':'Entre na sua conta.'}</h1>
      <p>{signup?'A conta centraliza sua assinatura, os aplicativos contratados e quem pode acessar ou configurar cada um.':app?`Depois do acesso, você pode seguir para o ${apps.find(item=>item.slug===app)?.name||'aplicativo'} ou abrir sua área do cliente.`:'Acesse sua área do cliente, aplicativos e assinaturas.'}</p>
      <form onSubmit={submit}>
        {signup&&<>
          <label>Seu nome<input type="text" value={name} onChange={event=>setName(event.target.value)} placeholder="Nome completo do titular" autoComplete="name" required/></label>
          <div className="auth-inline-fields">
            <label>CPF<input type="text" inputMode="numeric" value={cpf} onChange={event=>setCpf(event.target.value.replace(/[^0-9.-]/g,''))} placeholder="000.000.000-00" autoComplete="off" maxLength={14} required/></label>
            <label>Data de nascimento<input type="date" value={birthDate} onChange={event=>setBirthDate(event.target.value)} autoComplete="bday" required/></label>
          </div>
          <small className="auth-privacy-note">CPF e data de nascimento são usados para validar o titular e impedir cadastros/testes duplicados. O registro antifraude guarda identificadores criptográficos, não o CPF em texto puro.</small>
          <label>Nome do negócio<input type="text" value={business} onChange={event=>setBusiness(event.target.value)} placeholder="Nome da empresa" autoComplete="organization" required/></label>
        </>}
        {signup&&<label>Aplicativo de interesse<select value={selectedApp} onChange={event=>setSelectedApp(event.target.value as AppId)}>{apps.map(item=><option key={item.slug} value={item.slug}>{item.name} — {item.category}</option>)}</select><small>Isso não libera o aplicativo. A liberação acontece pela contratação da Store.</small></label>}
        <label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" required/></label>
        <label>Senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" autoComplete={signup?'new-password':'current-password'} minLength={8} required/></label>
        {error&&<p className="auth-error" role="alert">{error}</p>}
        {message&&<p className="auth-success" role="status">{message}</p>}
        <button type="submit" className="primary" disabled={loading}>{loading?'Aguarde…':signup?'Criar conta':'Entrar'}</button>
        {signup&&pendingConfirmation&&<button type="button" className="ghost" disabled={loading} onClick={()=>void resendConfirmation()}>Reenviar e-mail de confirmação</button>}
      </form>
      {!signup&&<small><Link href="/recuperar-senha">Esqueci minha senha</Link></small>}
      <small>{signup?<>Já possui conta? <Link href={`/login?redirect=${encodeURIComponent(requestedDestination)}${app?`&app=${app}`:''}`}>Entrar</Link></>:<>Ainda não possui conta? <Link href={`/cadastro?redirect=${encodeURIComponent(requestedDestination)}${app?`&app=${app}`:''}`}>Criar conta</Link></>}</small>
    </section>
  </main>;
}
