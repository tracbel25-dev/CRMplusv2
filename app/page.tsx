'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStoreAccess } from '@/lib/account/storeAccess';

export default function Home(){
  const access=useStoreAccess();
  const router=useRouter();

  useEffect(()=>{
    if(!access.ready)return;
    router.replace(access.user?'/conta':'/inicio');
  },[access.ready,access.user,router]);

  return <main aria-live="polite" style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#050505',color:'#9b9b96',fontFamily:'Inter,Arial,sans-serif',fontSize:13}}>Abrindo CRM PLUS…</main>;
}
