'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useStoreAccess } from '@/lib/account/storeAccess';

export function Header(){
  const [open,setOpen]=useState(false);
  const access=useStoreAccess();
  const authenticated=!!access.user;
  const authChecked=access.ready;

  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/" aria-label="CRM PLUS Store — início"><span>CRM PLUS</span><small>Store</small></Link>
    <button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Abrir menu">{open?<X/>:<Menu/>}</button>
    <nav className={open?'nav nav-open':'nav'}><Link href="/">Início</Link><Link href="/aplicativos">Aplicativos</Link><Link href="/suporte">Suporte</Link><Link href="/planos">Planos</Link></nav>
    <div className="header-actions">
      {authChecked && (authenticated
        ? <Link className="primary small" href="/conta">Minha conta</Link>
        : <><Link className="text-action" href="/login">Entrar</Link><Link className="primary small" href="/cadastro">Criar conta</Link></>)}
    </div>
  </div></header>;
}
