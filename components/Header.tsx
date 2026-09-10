'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createStoreClient } from '@/lib/supabase/storeClient';

export function Header(){
  const [open,setOpen]=useState(false);
  const [authenticated,setAuthenticated]=useState(false);
  const [authChecked,setAuthChecked]=useState(false);

  useEffect(()=>{
    let active=true;
    let supabase;
    try {
      supabase=createStoreClient();
    } catch {
      setAuthChecked(true);
      return;
    }

    void supabase.auth.getSession().then(({data})=>{
      if(!active) return;
      setAuthenticated(!!data.session?.user);
      setAuthChecked(true);
    });

    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(!active) return;
      setAuthenticated(!!session?.user);
      setAuthChecked(true);
    });

    return ()=>{
      active=false;
      data.subscription.unsubscribe();
    };
  },[]);

  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/inicio" aria-label="CRM PLUS Store — início"><span>CRM PLUS</span><small>Store</small></Link>
    <button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Abrir menu">{open?<X/>:<Menu/>}</button>
    <nav className={open?'nav nav-open':'nav'}><Link href="/inicio">Início</Link><Link href="/aplicativos">Aplicativos</Link><Link href="/suporte">Suporte</Link><Link href="/planos">Planos</Link></nav>
    <div className="header-actions">
      {authChecked && (authenticated
        ? <Link className="primary small" href="/entrar">Minha conta</Link>
        : <><Link className="text-action" href="/login">Entrar</Link><Link className="primary small" href="/cadastro">Criar conta</Link></>)}
    </div>
  </div></header>;
}
