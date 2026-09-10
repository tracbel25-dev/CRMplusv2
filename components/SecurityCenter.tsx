'use client';

import Link from 'next/link';
import { KeyRound, MailCheck, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';

type EnrollState={id:string;qrCode:string;secret:string};
type FactorState={id:string;friendlyName:string};

export function SecurityCenter(){
  const access=useStoreAccess();
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [nonce,setNonce]=useState('');
  const [needsNonce,setNeedsNonce]=useState(false);
  const [passwordLoading,setPasswordLoading]=useState(false);
  const [passwordMessage,setPasswordMessage]=useState('');
  const [passwordError,setPasswordError]=useState('');
  const [factor,setFactor]=useState<FactorState|null>(null);
  const [enrollment,setEnrollment]=useState<EnrollState|null>(null);
  const [mfaCode,setMfaCode]=useState('');
  const [mfaLoading,setMfaLoading]=useState(false);
  const [mfaMessage,setMfaMessage]=useState('');
  const [mfaError,setMfaError]=useState('');

  const loadFactors=useCallback(async()=>{
    if(!access.user)return;
    const supabase=createStoreClient();
    const {data,error}=await supabase.auth.mfa.listFactors();
    if(error){setMfaError(error.message);return;}
    const verified=data.totp.find(item=>item.status==='verified');
    setFactor(verified?{id:verified.id,friendlyName:verified.friendly_name||'Aplicativo autenticador'}:null);
  },[access.user]);

  useEffect(()=>{void loadFactors();},[loadFactors]);

  if(!access.ready)return <div className="entry-loading">Carregando segurança…</div>;
  if(!access.user)return <section className="account-details-empty"><h1>Entre para acessar a segurança da conta.</h1><Link className="primary" href="/login?redirect=%2Fseguranca">Entrar</Link></section>;

  const changePassword=async(event:FormEvent)=>{
    event.preventDefault();
    setPasswordError('');setPasswordMessage('');
    if(newPassword.length<8){setPasswordError('Use uma senha com pelo menos 8 caracteres.');return;}
    if(newPassword!==confirmPassword){setPasswordError('As novas senhas não são iguais.');return;}
    if(!currentPassword){setPasswordError('Informe sua senha atual.');return;}
    setPasswordLoading(true);
    try{
      const supabase=createStoreClient();
      const payload={password:newPassword,currentPassword,...(nonce.trim()?{nonce:nonce.trim()}:{})};
      const {error}=await supabase.auth.updateUser(payload);
      if(error){
        const text=error.message.toLowerCase();
        if(!needsNonce&&(text.includes('reauth')||text.includes('nonce'))){
          const {error:reauthError}=await supabase.auth.reauthenticate();
          if(reauthError)throw reauthError;
          setNeedsNonce(true);
          setPasswordMessage('Enviamos um código de confirmação para o seu e-mail. Informe o código abaixo para concluir a troca.');
          return;
        }
        throw error;
      }
      setCurrentPassword('');setNewPassword('');setConfirmPassword('');setNonce('');setNeedsNonce(false);
      setPasswordMessage('Senha alterada com sucesso.');
    }catch(reason){setPasswordError((reason as Error).message||'Não foi possível alterar a senha.');}
    finally{setPasswordLoading(false);}
  };

  const sendReauthentication=async()=>{
    setPasswordError('');setPasswordMessage('');setPasswordLoading(true);
    try{
      const supabase=createStoreClient();
      const {error}=await supabase.auth.reauthenticate();
      if(error)throw error;
      setNeedsNonce(true);
      setPasswordMessage('Código de confirmação enviado para o seu e-mail.');
    }catch(reason){setPasswordError((reason as Error).message||'Não foi possível enviar o código.');}
    finally{setPasswordLoading(false);}
  };

  const startMfa=async()=>{
    setMfaError('');setMfaMessage('');setMfaLoading(true);
    try{
      const supabase=createStoreClient();
      const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'CRM PLUS Store'});
      if(error)throw error;
      setEnrollment({id:data.id,qrCode:data.totp.qr_code,secret:data.totp.secret});
      setMfaMessage('Escaneie o QR Code em um aplicativo autenticador e informe o código de 6 dígitos para concluir.');
    }catch(reason){setMfaError((reason as Error).message||'Não foi possível iniciar a autenticação em dois fatores.');}
    finally{setMfaLoading(false);}
  };

  const verifyMfa=async(event:FormEvent)=>{
    event.preventDefault();
    if(!enrollment)return;
    setMfaError('');setMfaMessage('');
    if(!/^\d{6}$/.test(mfaCode.trim())){setMfaError('Informe o código de 6 dígitos do aplicativo autenticador.');return;}
    setMfaLoading(true);
    try{
      const supabase=createStoreClient();
      const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:enrollment.id,code:mfaCode.trim()});
      if(error)throw error;
      setEnrollment(null);setMfaCode('');
      await loadFactors();
      setMfaMessage('Autenticação em dois fatores ativada. Você receberá também um aviso de segurança por e-mail quando a confirmação por e-mail estiver habilitada no projeto.');
    }catch(reason){setMfaError((reason as Error).message||'Código inválido.');}
    finally{setMfaLoading(false);}
  };

  const removeMfa=async()=>{
    if(!factor)return;
    setMfaError('');setMfaMessage('');setMfaLoading(true);
    try{
      const supabase=createStoreClient();
      const {error}=await supabase.auth.mfa.unenroll({factorId:factor.id});
      if(error)throw error;
      setFactor(null);
      setMfaMessage('Autenticação em dois fatores removida.');
    }catch(reason){setMfaError((reason as Error).message||'Não foi possível remover a autenticação em dois fatores.');}
    finally{setMfaLoading(false);}
  };

  return <>
    <section className="account-details-intro"><div><span className="account-kicker">Segurança</span><h1>Senha e autenticação</h1><p>Gerencie sua senha e proteja sua conta com uma segunda etapa de verificação.</p></div></section>

    <div className="security-grid">
      <section className="security-card">
        <div className="account-details-heading"><KeyRound size={19}/><div><h2>Trocar senha</h2><p>Use sua senha atual. Quando o Supabase exigir confirmação adicional, o código será enviado por e-mail.</p></div></div>
        <form className="security-form" onSubmit={changePassword}>
          <label><span>Senha atual</span><input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" required/></label>
          <label><span>Nova senha</span><input type="password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" required/></label>
          <label><span>Confirmar nova senha</span><input type="password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required/></label>
          {needsNonce&&<label><span>Código recebido por e-mail</span><input inputMode="numeric" maxLength={6} value={nonce} onChange={e=>setNonce(e.target.value.replace(/\D/g,''))} placeholder="000000" autoComplete="one-time-code" required/></label>}
          {passwordError&&<div className="account-form-feedback is-error" role="alert">{passwordError}</div>}
          {passwordMessage&&<div className="account-form-feedback is-success" role="status">{passwordMessage}</div>}
          <div className="security-actions"><button className="primary" type="submit" disabled={passwordLoading}>{passwordLoading?'Aguarde…':'Alterar senha'}</button><button className="ghost" type="button" onClick={()=>void sendReauthentication()} disabled={passwordLoading}><MailCheck size={15}/> Enviar código por e-mail</button></div>
        </form>
      </section>

      <section className="security-card">
        <div className="account-details-heading"><ShieldCheck size={19}/><div><h2>Autenticação em dois fatores</h2><p>O segundo fator usa um aplicativo autenticador. O e-mail serve para avisos e confirmações de segurança.</p></div></div>
        {factor?<div className="security-enabled"><div><Smartphone size={18}/><span><strong>2FA ativa</strong><small>{factor.friendlyName}</small></span></div><button className="ghost" type="button" onClick={()=>void removeMfa()} disabled={mfaLoading}><Trash2 size={15}/> Remover</button></div>:!enrollment?<button className="primary" type="button" onClick={()=>void startMfa()} disabled={mfaLoading}>{mfaLoading?'Preparando…':'Ativar autenticação em dois fatores'}</button>:<form className="mfa-enroll" onSubmit={verifyMfa}><div className="mfa-qr"><img src={enrollment.qrCode} alt="QR Code para configurar autenticação em dois fatores"/></div><div className="mfa-secret"><span>Chave manual</span><code>{enrollment.secret}</code></div><label><span>Código de 6 dígitos</span><input inputMode="numeric" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))} placeholder="000000" autoComplete="one-time-code" required/></label><button className="primary" type="submit" disabled={mfaLoading}>{mfaLoading?'Confirmando…':'Confirmar e ativar'}</button></form>}
        {mfaError&&<div className="account-form-feedback is-error" role="alert">{mfaError}</div>}
        {mfaMessage&&<div className="account-form-feedback is-success" role="status">{mfaMessage}</div>}
      </section>
    </div>
  </>;
}
