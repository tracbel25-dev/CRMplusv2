'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientMessage } from '@/lib/clientMessage';
import { createRecoveryClient, createStoreClient } from '@/lib/supabase/storeClient';

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
      setMessage('Se esse e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Confira também Spam e Lixo eletrônico.');
    }catch(reason){setError(clientMessage(reason,'Não foi possível enviar o link agora. Tente novamente.'));}finally{setLoading(false)}
  };
  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">Recuperar acesso</span><h1>Esqueceu a senha?</h1><p>Informe o e-mail da sua conta CRM PLUS. Enviaremos um link para criar uma nova senha. Se não aparecer na caixa de entrada, confira Spam ou Lixo eletrônico.</p><form onSubmit={submit}><label>E-mail<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}<button className="primary" type="submit" disabled={loading}>{loading?'Enviando…':'Enviar link de recuperação'}</button></form><small><Link href="/login">Voltar para entrar</Link></small></section></main>;
}

export function NewPasswordForm(){
  const router=useRouter();
  const recoveryRef=useRef<SupabaseClient|null>(null);
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [ready,setReady]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(false);
  const [completed,setCompleted]=useState(false);
  const [hadExistingSession,setHadExistingSession]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    const recovery=createRecoveryClient();
    recoveryRef.current=recovery;

    const finishAuthorization=async(sessionAvailable:boolean)=>{
      if(!active)return;
      if(!sessionAvailable){setAuthorized(false);setReady(true);return;}
      setAuthorized(true);
      if(typeof window!=='undefined'){
        window.history.replaceState({},'',window.location.pathname);
      }
      try{
        const persistent=createStoreClient();
        const {data}=await persistent.auth.getSession();
        if(active)setHadExistingSession(!!data.session);
      }catch{
        if(active)setHadExistingSession(false);
      }
      if(active)setReady(true);
    };

    const {data:listener}=recovery.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'||session){
        void finishAuthorization(!!session);
      }
    });

    void recovery.auth.getSession()
      .then(({data})=>finishAuthorization(!!data.session))
      .catch(()=>finishAuthorization(false));

    return()=>{active=false;listener.subscription.unsubscribe();recoveryRef.current=null;};
  },[]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');
    if(password.length<8){setError('Use uma senha com pelo menos 8 caracteres.');return}
    if(password!==confirm){setError('As senhas não são iguais.');return}
    const recovery=recoveryRef.current;
    if(!recovery){setError('Este link não está mais disponível. Solicite outro link.');return}
    setLoading(true);
    try{
      const {error:updateError}=await recovery.auth.updateUser({password});
      if(updateError)throw updateError;
      await recovery.auth.signOut({scope:'local'}).catch(()=>{});
      setCompleted(true);
    }catch(reason){setError(clientMessage(reason,'Não foi possível salvar a nova senha. Tente novamente.'));}finally{setLoading(false)}
  };

  const switchAccount=async()=>{
    setLoading(true);setError('');
    try{
      const persistent=createStoreClient();
      await persistent.auth.signOut({scope:'local'});
      router.replace('/login');
      router.refresh();
    }catch(reason){
      setError(clientMessage(reason,'Não foi possível encerrar a conta atual.'));
      setLoading(false);
    }
  };

  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">Segurança</span><h1>{completed?'Senha atualizada.':'Crie uma nova senha.'}</h1>{!ready?<p>Aguarde um momento…</p>:completed?<><p>{hadExistingSession?'A senha foi alterada sem trocar a conta que já estava aberta neste navegador.':'A senha foi alterada com sucesso. Agora você pode entrar normalmente.'}</p><div className="auth-recovery-actions">{hadExistingSession?<><Link className="primary" href="/conta">Voltar para minha conta</Link><button className="ghost" type="button" onClick={()=>void switchAccount()} disabled={loading}>{loading?'Aguarde…':'Sair e entrar com outra conta'}</button></>:<Link className="primary" href="/login">Entrar</Link>}</div>{error&&<p className="auth-error" role="alert">{error}</p>}</>:!authorized?<><p>Este link não está mais válido ou já foi utilizado.</p><Link className="primary" href="/recuperar-senha">Solicitar outro link</Link></>:<form onSubmit={submit}><label>Nova senha<input type="password" minLength={8} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="new-password" required/></label><label>Confirmar nova senha<input type="password" minLength={8} value={confirm} onChange={event=>setConfirm(event.target.value)} autoComplete="new-password" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={loading}>{loading?'Salvando…':'Salvar nova senha'}</button></form>}</section></main>;
}
