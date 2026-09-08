'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { createStoreClient } from '@/lib/supabase/storeClient';

export function AuthShell({mode,app,redirectTo}:{mode:'login'|'signup';app?:AppId;redirectTo?:string}){
  const signup=mode==='signup';
  const router=useRouter();
  const initialApp=useMemo<AppId>(()=>app||'zeus',[app]);
  const [selectedApp,setSelectedApp]=useState<AppId>(initialApp);
  const [name,setName]=useState('');
  const [business,setBusiness]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const requestedDestination=redirectTo&&redirectTo.startsWith('/')?redirectTo:'/entrar';

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError('');
    setMessage('');
    if(password.length<8){setError('Use uma senha com pelo menos 8 caracteres.');return;}
    setLoading(true);
    try{
      const supabase=createStoreClient();
      if(signup){
        if(!name.trim()||!business.trim())throw new Error('Informe seu nome e o nome do negócio.');
        const {data, error:signUpError}=await supabase.auth.signUp({
          email:email.trim().toLowerCase(),
          password,
          options:{
            data:{name:name.trim(),business:business.trim(),requested_app:selectedApp},
            emailRedirectTo:`${window.location.origin}/entrar`
          }
        });
        if(signUpError)throw signUpError;
        if(data.session){
          const {error:accountError}=await supabase.rpc('create_account',{account_name:business.trim()});
          if(accountError)throw accountError;
          router.push('/entrar');
          router.refresh();
        }else{
          setMessage('Conta criada. Confira seu e-mail para confirmar o acesso e concluir o cadastro.');
        }
      }else{
        const {error:loginError}=await supabase.auth.signInWithPassword({
          email:email.trim().toLowerCase(),
          password
        });
        if(loginError)throw loginError;
        router.push(requestedDestination);
        router.refresh();
      }
    }catch(reason){
      const text=(reason as {message?:string}).message||'Não foi possível concluir o acesso.';
      setError(text==='Invalid login credentials'?'E-mail ou senha incorretos.':text);
    }finally{setLoading(false)}
  };

  return <main className="auth-shell">
    <Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link>
    <section className="auth-card">
      <span className="eyebrow">{signup?'Criar conta':'Acesso'}</span>
      <h1>{signup?'Crie sua conta CRM PLUS.':'Entre na sua conta.'}</h1>
      <p>{signup?'A conta centraliza sua assinatura, os aplicativos contratados e quem pode acessar ou configurar cada um.':app?`Depois do acesso, você pode seguir para o ${apps.find(item=>item.slug===app)?.name||'aplicativo'} ou abrir seus aplicativos pela Store.`:'Veja os aplicativos contratados e liberados para o seu usuário.'}</p>
      <form onSubmit={submit}>
        {signup&&<><label>Seu nome<input type="text" value={name} onChange={event=>setName(event.target.value)} placeholder="Nome do titular" autoComplete="name" required/></label><label>Nome do negócio<input type="text" value={business} onChange={event=>setBusiness(event.target.value)} placeholder="Nome da empresa" autoComplete="organization" required/></label></>}
        {signup&&<label>Aplicativo de interesse<select value={selectedApp} onChange={event=>setSelectedApp(event.target.value as AppId)}>{apps.map(item=><option key={item.slug} value={item.slug}>{item.name} — {item.category}</option>)}</select><small>Isso não libera o aplicativo. A liberação acontece pela contratação da Store.</small></label>}
        <label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@empresa.com.br" autoComplete="email" required/></label>
        <label>Senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" autoComplete={signup?'new-password':'current-password'} minLength={8} required/></label>
        {error&&<p className="auth-error" role="alert">{error}</p>}
        {message&&<p className="auth-success" role="status">{message}</p>}
        <button type="submit" className="primary" disabled={loading}>{loading?'Aguarde…':signup?'Criar conta':'Entrar'}</button>
      </form>
      {!signup&&<small><Link href="/recuperar-senha">Esqueci minha senha</Link></small>}
      <small>{signup?<>Já possui conta? <Link href={`/login${app?`?app=${app}`:''}`}>Entrar</Link></>:<>Ainda não possui conta? <Link href={`/cadastro${app?`?app=${app}`:''}`}>Criar conta</Link></>}</small>
    </section>
  </main>;
}
