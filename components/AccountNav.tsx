'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/conta', label: 'Visão geral' },
  { href: '/minhas-informacoes', label: 'Minhas informações' },
  { href: '/assinaturas', label: 'Assinaturas e cobrança' },
  { href: '/equipe-acessos', label: 'Equipe e acessos' },
];

export function AccountNav() {
  const pathname = usePathname();
  return <nav className="account-nav" aria-label="Área do cliente">
    {items.map(item => {
      const active=pathname===item.href||(item.href==='/minhas-informacoes'&&pathname==='/seguranca');
      return <Link key={item.href} href={item.href} className={active?'is-active':undefined}>{item.label}</Link>;
    })}
  </nav>;
}
