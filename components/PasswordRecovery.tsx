'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStoreClient } from '@/lib/supabase/storeClient';

export function PasswordRecoveryRequest(){
  const [email,setEmail]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');setMessage('');setLoading(true);
    try{
      const supabase=createStoreClient();
      const {error:resetError}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/nova-senha`});
      if(resetError)throw resetError;
      setMessage('Se esse e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
    }catch(reason){setError((reason as Error).message)}finally{setLoading(false)}
  };
  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">Recuperar acesso</span><h1>Esqueceu a senha?</h1><p>Informe o e-mail da sua conta CRM PLUS. Enviaremos o link de recuperação pelo Supabase Auth.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}<button className="primary" type="submit" disabled={loading}>{loading?'Enviando…':'Enviar link de recuperação'}</button></form><small><Link href="/login">Voltar para entrar</Link></small></section></main>;
}

export function NewPasswordForm(){
  const router=useRouter();
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [ready,setReady]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    const supabase=createStoreClient();
    void supabase.auth.getSession().then(({data})=>{setAuthorized(!!data.session);setReady(true)});
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'||session){setAuthorized(true);setReady(true)}
    });
    return()=>data.subscription.unsubscribe();
  },[]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');
    if(password.length<8){setError('Use uma senha com pelo menos 8 caracteres.');return}
    if(password!==confirm){setError('As senhas não são iguais.');return}
    setLoading(true);
    try{
      const supabase=createStoreClient();
      const {error:updateError}=await supabase.auth.updateUser({password});
      if(updateError)throw updateError;
      router.push('/entrar');router.refresh();
    }catch(reason){setError((reason as Error).message)}finally{setLoading(false)}
  };

  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">Segurança</span><h1>Crie uma nova senha.</h1>{!ready?<p>Validando o link de recuperação…</p>:!authorized?<><p>Este link não possui uma sessão de recuperação válida.</p><Link className="primary" href="/recuperar-senha">Solicitar outro link</Link></>:<form onSubmit={submit}><label>Nova senha<input type="password" minLength={8} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" required/></label><label>Confirmar nova senha<input type="password" minLength={8} value={confirm} onChange={event=>setConfirm(event.target.value)} autoComplete="new-password" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={loading}>{loading?'Salvando…':'Salvar nova senha'}</button></form>}</section></main>;
}
