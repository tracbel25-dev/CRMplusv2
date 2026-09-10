'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/conta', label: 'Visão geral' },
  { href: '/assinaturas', label: 'Assinaturas e cobrança' },
  { href: '/aplicativos', label: 'Aplicativos' },
  { href: '/suporte', label: 'Suporte' },
];

export function AccountNav() {
  const pathname = usePathname();
  return <nav className="account-nav" aria-label="Área do cliente">
    {items.map(item => <Link key={item.href} href={item.href} className={pathname === item.href ? 'is-active' : undefined}>{item.label}</Link>)}
  </nav>;
}
