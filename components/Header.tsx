'use client';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Header(){
  const [open,setOpen]=useState(false);
  return <header className="site-header"><div className="header-inner">
    <Link className="brand" href="/inicio" aria-label="CRM PLUS Store — início"><span>CRM PLUS</span><small>Store</small></Link>
    <button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Abrir menu">{open?<X/>:<Menu/>}</button>
    <nav className={open?'nav nav-open':'nav'}><Link href="/inicio">Início</Link><Link href="/aplicativos">Aplicativos</Link><Link href="/suporte">Suporte</Link><Link href="/planos">Planos</Link></nav>
    <div className="header-actions"><Link className="text-action" href="/login">Entrar</Link><Link className="primary small" href="/cadastro">Criar conta</Link></div>
  </div></header>;
}
