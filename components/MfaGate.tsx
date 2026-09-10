'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';

const protectedPrefixes=['/conta','/minhas-informacoes','/assinaturas','/equipe-acessos','/seguranca','/checkout','/zeus','/artemis','/kronos','/athena'];

export function MfaGate({children}:{children:ReactNode}){
  const access=useStoreAccess();
  const pathname=usePathname();
  const router=useRouter();
  const checkedUser=useRef('');
  const [checking,setChecking]=useState(false);

  useEffect(()=>{
    if(!access.ready)return;
    if(!access.user){checkedUser.current='';setChecking(false);return;}
    if(!protectedPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`))){setChecking(false);return;}
    if(checkedUser.current===access.user.id){setChecking(false);return;}
    let active=true;
    setChecking(true);
    void (async()=>{
      const supabase=createStoreClient();
      const {data:factors,error:factorsError}=await supabase.auth.mfa.listFactors();
      if(!active)return;
      const hasVerifiedTotp=!factorsError&&factors.totp.some(item=>item.status==='verified');
      if(!hasVerifiedTotp){checkedUser.current=access.user?.id||'';setChecking(false);return;}
      const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(!active)return;
      if(!aalError&&aal.currentLevel!=='aal2'&&aal.nextLevel==='aal2'){
        setChecking(false);
        router.replace(`/verificar-2fa?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      checkedUser.current=access.user?.id||'';
      setChecking(false);
    })();
    return()=>{active=false;};
  },[access.ready,access.user,pathname,router]);

  if(checking)return null;
  return <>{children}</>;
}
