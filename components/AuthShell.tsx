'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { apps } from '@/lib/catalog';
import type { AppId } from '@/lib/operations/model';
import { createLocalAccount, loginLocal } from '@/lib/account/localAccess';

export function AuthShell({mode,app,redirectTo}:{mode:'login'|'signup';app?:AppId;redirectTo?:string}){
  const signup=mode==='signup';
  const router=useRouter();
  const initialApp=useMemo<AppId>(()=>app||'zeus',[app]);
  const [selectedApp,setSelectedApp]=useState<AppId>(initialApp);
  const [name,setName]=useState('');
  const [business,setBusiness]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const destination=redirectTo&&redirectTo.startsWith('/')?redirectTo:`/${selectedApp}`;

  const submit=(event:FormEvent)=>{
    event.preventDefault();
    setError('');
    try{
      if(signup){
        createLocalAccount({name,business,email,app:selectedApp});
        router.push(redirectTo&&redirectTo.startsWith('/')?redirectTo:`/${selectedApp}`);
      }else{
        const result=loginLocal(email);
        if(app&&!result.member.apps.includes(app)) router.push('/entrar');
        else router.push(destination);
      }
    }catch(reason){setError((reason as Error).message)}
  };

  return <main className="auth-shell">
    <Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link>
    <section className="auth-card">
      <span className="eyebrow">{signup?'Criar conta':'Acesso'}</span>
      <h1>{signup?'Comece pela sua conta Store.':'Entre na sua conta.'}</h1>
      <p>{signup?'Escolha o primeiro aplicativo da conta. Depois, cada usuário verá apenas os aplicativos liberados para ele.':app?`Você entrará direto no ${apps.find(item=>item.slug===app)?.name||'aplicativo'} e voltará para o destino que tentou acessar.`:'A conta mostra somente os aplicativos contratados e liberados para o seu usuário.'}</p>
      <form onSubmit={submit}>
        {signup&&<><label>Seu nome<input type="text" value={name} onChange={event=>setName(event.target.value)} placeholder="Nome do titular" required/></label><label>Nome do negócio<input type="text" value={business} onChange={event=>setBusiness(event.target.value)} placeholder="Nome da empresa" required/></label></>}
        {signup&&<label>Primeiro aplicativo<select value={selectedApp} onChange={event=>setSelectedApp(event.target.value as AppId)}>{apps.map(item=><option key={item.slug} value={item.slug}>{item.name} — {item.category}</option>)}</select></label>}
        <label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@empresa.com.br" required/></label>
        <label>Senha<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="••••••••" required/></label>
        {error&&<p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="primary">{signup?'Criar conta e abrir aplicativo':'Entrar'}</button>
      </form>
      <small className="auth-prototype-note">Protótipo local: a senha ainda não é validada nem armazenada. O objetivo desta etapa é validar a lógica de conta, aplicativos e permissões antes do Supabase.</small>
      <small>{signup?<>Já possui conta? <Link href={`/login${app?`?app=${app}`:''}`}>Entrar</Link></>:<>Ainda não possui conta? <Link href={`/cadastro${app?`?app=${app}`:''}`}>Criar conta</Link></>}</small>
    </section>
  </main>
}
