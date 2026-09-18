'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStoreAccess } from '@/lib/account/storeAccess';

const baseItems = [
  { href: '/conta', label: 'Visão geral' },
  { href: '/minhas-informacoes', label: 'Minhas informações' },
  { href: '/assinaturas', label: 'Assinaturas e cobrança' },
];

const isActiveApp=(status:string,end:string|null)=>['trialing','active'].includes(status)&&((status==='active'&&!end)||!!end&&Date.parse(end)>Date.now());

export function AccountNav() {
  const pathname = usePathname();
  const access=useStoreAccess();
  const showTeam=!!access.account&&(
    access.account.members.length>1||
    access.account.apps.some(item=>isActiveApp(item.status,item.currentPeriodEnd)&&item.seats>1)
  );
  const items=showTeam?[...baseItems,{href:'/equipe-acessos',label:'Equipe e acessos'}]:baseItems;
  return <nav className="account-nav" aria-label="Área do cliente">
    {items.map(item => {
      const active=pathname===item.href||(item.href==='/minhas-informacoes'&&pathname==='/seguranca');
      return <Link key={item.href} href={item.href} className={active?'is-active':undefined}>{item.label}</Link>;
    })}
  </nav>;
}
