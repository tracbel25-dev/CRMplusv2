'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { apps } from '@/lib/catalog';
import { clientMessage } from '@/lib/clientMessage';
import { precheckSignupIdentity, releaseSignupIdentity } from '@/lib/antifraud';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';

type PersonType='pf'|'pj';
const onlyDigits=(value:string)=>value.replace(/\D/g,'');

export function AuthShell({mode,app,redirectTo}:{mode:'login'|'signup';app?:AppId;redirectTo?:string}){
  const signup=mode==='signup';
  const router=useRouter();
  const initialApp=useMemo<AppId>(()=>app||'zeus',[app]);
  const [selectedApp,setSelectedApp]=useState<AppId>(initialApp);
  const [personType,setPersonType]=useState<PersonType>('pf');
  const [name,setName]=useState('');
  const [business,setBusiness]=useState('');
  const [cpf,setCpf]=useState('');
  const [cnpj,setCnpj]=useState('');
  const [birthDate,setBirthDate]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
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
    }catch(reason){setError(clientMessage(reason,'Não foi possível reenviar a confirmação.'));}
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
        const normalizedCnpj=personType==='pj'?onlyDigits(cnpj):'';
        if(personType==='pj'&&normalizedCnpj.length!==14)throw new Error('Informe um CNPJ válido.');
        const identity=await precheckSignupIdentity({
          cpf,
          name:name.trim(),
          birthDate,
          email:email.trim().toLowerCase(),
          personType,
          cnpj:normalizedCnpj||undefined,
        });
        const {data,error:signUpError}=await supabase.auth.signUp({
          email:email.trim().toLowerCase(),
          password,
          options:{
            data:{
              name:name.trim(),
              business:business.trim(),
              account_person_type:personType,
              account_cnpj:normalizedCnpj||null,
              requested_app:selectedApp,
              signup_redirect:requestedDestination,
              identity_reservation:identity.reservationToken,
            },
            emailRedirectTo:`${window.location.origin}/auth/confirm`
          }
        });
        if(signUpError){
          await releaseSignupIdentity(identity.reservationToken).catch(()=>false);
          throw signUpError;
        }
        if(!data.user&&!data.session){
          await releaseSignupIdentity(identity.reservationToken).catch(()=>false);
          throw new Error('Não foi possível criar a conta. Tente novamente.');
        }
        if(data.session){
          const {data:createdAccount,error:accountError}=await supabase.rpc('create_account',{
            account_name:business.trim(),
            account_person_type:personType,
            account_cnpj:normalizedCnpj||null,
          });
          if(accountError)throw new Error(clientMessage(accountError.message,'Não foi possível concluir o cadastro da conta.'));
          const accountId=typeof createdAccount==='string'?createdAccount:'';
          if(!accountId)throw new Error('Não foi possível concluir o vínculo da conta.');
          const {error:identityError}=await supabase.rpc('finalize_signup_identity',{
            reservation_token:identity.reservationToken,
            target_account:accountId,
          });
          if(identityError)throw new Error('Não foi possível concluir a validação do cadastro.');
          await supabase.auth.updateUser({data:{signup_redirect:null,identity_reservation:null,account_person_type:null,account_cnpj:null}});
          await continueAfterAuth();
        }else{
          setPendingConfirmation(true);
          setMessage('Dados validados. Enviamos um e-mail para confirmar seu endereço e ativar a conta.');
        }
      }else{
        const {error:loginError}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
        if(loginError)throw loginError;
        await continueAfterAuth();
      }
    }catch(reason){
      const friendly=clientMessage(reason,'Não foi possível concluir o acesso.');
      setError(friendly==='Já existe uma conta com este e-mail.'?'Já existe uma conta com este e-mail. Entre na conta ou recupere sua senha.':friendly);
    }finally{setLoading(false);}
  };

  if(checkingSession)return <AppLoadingScreen label="Carregando sua conta" />;

  return <main className="auth-shell">
    <Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link>
    <section className="auth-card">
      <span className="eyebrow">{signup?'Criar conta':'Acesso'}</span>
      <h1>{signup?'Crie sua conta CRM PLUS.':'Entre na sua conta.'}</h1>
      <p>{signup?'Sua conta reúne os aplicativos contratados e os acessos da sua equipe.':app?`Depois de entrar, você pode seguir para o ${apps.find(item=>item.slug===app)?.name||'aplicativo'} ou abrir sua área do cliente.`:'Acesse sua área do cliente, aplicativos e assinaturas.'}</p>
      <form onSubmit={submit}>
        {signup&&<>
          <div className="auth-person-type" aria-label="Tipo de cadastro">
            <span>Tipo de cadastro</span>
            <div className="auth-person-options">
              <button type="button" className={personType==='pf'?'is-active':''} onClick={()=>{setPersonType('pf');setCnpj('');}}>Pessoa física</button>
              <button type="button" className={personType==='pj'?'is-active':''} onClick={()=>setPersonType('pj')}>Pessoa jurídica</button>
            </div>
          </div>
          <label>Seu nome<input type="text" value={name} onChange={event=>setName(event.target.value)} placeholder="Nome completo do titular" autoComplete="name" required/></label>
          <div className="auth-inline-fields">
            <label>CPF do titular<input type="text" inputMode="numeric" value={cpf} onChange={event=>setCpf(event.target.value.replace(/[^0-9.-]/g,''))} placeholder="000.000.000-00" autoComplete="off" maxLength={14} required/></label>
            <label>Data de nascimento<input type="date" value={birthDate} onChange={event=>setBirthDate(event.target.value)} autoComplete="bday" required/></label>
          </div>
          <small className="auth-privacy-note">O CPF identifica o titular da conta. Ele é necessário tanto para pessoa física quanto para o responsável por uma pessoa jurídica.</small>
          <label>Nome do negócio<input type="text" value={business} onChange={event=>setBusiness(event.target.value)} placeholder={personType==='pj'?'Nome da empresa':'Seu negócio ou nome profissional'} autoComplete="organization" required/></label>
          {personType==='pj'&&<label>CNPJ<input type="text" inputMode="numeric" value={cnpj} onChange={event=>setCnpj(event.target.value.replace(/[^0-9./-]/g,''))} placeholder="00.000.000/0000-00" autoComplete="off" maxLength={18} required/><small>O CNPJ será vinculado à conta da empresa e não poderá ser usado em outra conta.</small></label>}
        </>}
        {signup&&<label>Aplicativo de interesse<select value={selectedApp} onChange={event=>setSelectedApp(event.target.value as AppId)}>{apps.map(item=><option key={item.slug} value={item.slug}>{item.name} — {item.category}</option>)}</select><small>Você poderá contratar ou testar o aplicativo depois de criar a conta.</small></label>}
        <label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" required/></label>
        <label>Senha<div className="auth-password-field"><input type={showPassword?'text':'password'} value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" autoComplete={signup?'new-password':'current-password'} minLength={8} required/><button type="button" className="auth-password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Ocultar senha':'Visualizar senha'} title={showPassword?'Ocultar senha':'Visualizar senha'}>{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>
        {loading&&signup&&<p className="auth-validation-status" role="status">Aguarde, estamos validando seus dados…</p>}
        {error&&<p className="auth-error" role="alert">{error}</p>}
        {message&&<p className="auth-success" role="status">{message}</p>}
        <button type="submit" className="primary" disabled={loading}>{loading?(signup?'Validando dados…':'Aguarde…'):signup?'Criar conta':'Entrar'}</button>
        {signup&&pendingConfirmation&&<button type="button" className="ghost" disabled={loading} onClick={()=>void resendConfirmation()}>Reenviar e-mail de confirmação</button>}
      </form>
      {!signup&&<small><Link href="/recuperar-senha">Esqueci minha senha</Link></small>}
      <small>{signup?<>Já possui conta? <Link href={`/login?redirect=${encodeURIComponent(requestedDestination)}${app?`&app=${app}`:''}`}>Entrar</Link></>:<>Ainda não possui conta? <Link href={`/cadastro?redirect=${encodeURIComponent(requestedDestination)}${app?`&app=${app}`:''}`}>Criar conta</Link></>}</small>
    </section>
  </main>;
}
