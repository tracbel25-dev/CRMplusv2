'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStoreClient } from '@/lib/supabase/storeClient';

function safeDestination(value?:string){
  return value&&value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/conta';
}

export function MfaChallenge({redirectTo}:{redirectTo?:string}){
  const router=useRouter();
  const destination=safeDestination(redirectTo);
  const [factorId,setFactorId]=useState('');
  const [code,setCode]=useState('');
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    void (async()=>{
      const supabase=createStoreClient();
      const {data:sessionData}=await supabase.auth.getSession();
      if(!active)return;
      if(!sessionData.session){
        router.replace(`/login?redirect=${encodeURIComponent(destination)}`);
        return;
      }
      const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aalError){setError(aalError.message);setReady(true);return;}
      if(aal.currentLevel==='aal2'){
        router.replace(destination);router.refresh();return;
      }
      const {data,error:factorsError}=await supabase.auth.mfa.listFactors();
      if(factorsError){setError(factorsError.message);setReady(true);return;}
      const verified=data.totp.find(item=>item.status==='verified');
      if(!verified){
        setError('Nenhum aplicativo autenticador confirmado foi encontrado para esta conta.');
        setReady(true);return;
      }
      setFactorId(verified.id);setReady(true);
    })();
    return()=>{active=false;};
  },[destination,router]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();setError('');
    if(!/^\d{6}$/.test(code.trim())){setError('Informe o código de 6 dígitos.');return;}
    if(!factorId){setError('O método de autenticação ainda não foi carregado.');return;}
    setLoading(true);
    try{
      const supabase=createStoreClient();
      const {error:verifyError}=await supabase.auth.mfa.challengeAndVerify({factorId,code:code.trim()});
      if(verifyError)throw verifyError;
      router.replace(destination);router.refresh();
    }catch(reason){setError((reason as Error).message||'Código inválido.');}
    finally{setLoading(false);}
  };

  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><ShieldCheck size={28}/><span className="eyebrow">Verificação em duas etapas</span><h1>Confirme que é você.</h1><p>Abra seu aplicativo autenticador e informe o código de 6 dígitos para continuar.</p>{!ready?<p>Preparando verificação…</p>:<form onSubmit={submit}><label>Código de segurança<input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000" autoComplete="one-time-code" required/></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="primary" type="submit" disabled={loading||!factorId}>{loading?'Confirmando…':'Confirmar acesso'}</button></form>}<small><Link href="/recuperar-senha">Problemas para acessar?</Link></small></section></main>;
}
