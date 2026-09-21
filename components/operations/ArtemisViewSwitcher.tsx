'use client';

import Link from 'next/link';
import { ChefHat, ChevronDown, Settings2, ShoppingBag } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import type { Workspace } from '@/lib/operations/storage';

const views = [
  { id:'atendimento', label:'Atendimento', href:'/artemis/atendimento', permission:'artemis_service', icon:ShoppingBag },
  { id:'cozinha', label:'Cozinha', href:'/artemis/cozinha', permission:'artemis_kitchen', icon:ChefHat },
  { id:'gestao', label:'Gestão', href:'/artemis/gestao', permission:'artemis_manage', icon:Settings2 },
] as const;

function currentView(page:string){
  if (['atendimento','pedidos','mesas','caixa'].includes(page)) return 'atendimento';
  if (page === 'cozinha') return 'cozinha';
  if (['gestao','cardapio','estoque','clientes','relatorios','configuracoes','cardapio-digital'].includes(page)) return 'gestao';
  return 'inicio';
}

export function ArtemisViewSwitcher({ w, page }: { w: Workspace; page: string }) {
  const access = useStoreAccess();
  const service = access.hasPermission('artemis','artemis_service');
  const kitchen = access.hasPermission('artemis','artemis_kitchen');
  const operationalMember = service || kitchen;
  const canTemporarilySwitch = !access.isOwner && operationalMember && w.data.settings.staffViewSwitchEnabled;
  const allowed = views.filter(view => {
    if (view.permission === 'artemis_manage') return access.hasPermission('artemis','artemis_manage');
    if (view.permission === 'artemis_service') return service || canTemporarilySwitch;
    return kitchen || canTemporarilySwitch;
  });
  if (allowed.length < 2) return null;

  const activeId = currentView(page);
  const active = allowed.find(view => view.id === activeId);
  return <details className="artemis-view-switcher">
    <summary aria-label="Trocar visão">
      <span>{active?.label || 'Trocar visão'}</span><ChevronDown size={15}/>
    </summary>
    <div className="artemis-view-switcher-menu">
      <small>Trocar visão</small>
      {allowed.map(view => {
        const Icon = view.icon;
        const temporary = canTemporarilySwitch && !access.hasPermission('artemis', view.permission);
        return <Link href={view.href} key={view.id} aria-current={view.id === activeId ? 'page' : undefined}>
          <Icon size={17}/><span><strong>{view.label}</strong>{temporary && <small>Cobertura temporária</small>}</span>
        </Link>;
      })}
    </div>
    <style jsx global>{`
      .artemis-view-switcher{position:relative}
      .artemis-view-switcher>summary{list-style:none;display:flex;align-items:center;gap:6px;min-height:38px;padding:0 11px;border:1px solid var(--op-line);border-radius:10px;background:var(--op-paper);color:var(--op-ink);font-size:12px;font-weight:800;cursor:pointer}
      .artemis-view-switcher>summary::-webkit-details-marker{display:none}
      .artemis-view-switcher[open]>summary{border-color:var(--op-accent)}
      .artemis-view-switcher-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:10000;width:240px;padding:9px;display:grid;gap:5px;border:1px solid var(--op-line);border-radius:13px;background:var(--op-paper);box-shadow:0 18px 50px rgba(0,0,0,.18)}
      .artemis-view-switcher-menu>small{padding:4px 6px;color:var(--op-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
      .artemis-view-switcher-menu>a{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:center;padding:10px;border-radius:9px;color:var(--op-ink);text-decoration:none}
      .artemis-view-switcher-menu>a:hover,.artemis-view-switcher-menu>a[aria-current="page"]{background:var(--op-soft)}
      .artemis-view-switcher-menu>a>span{display:grid;gap:1px}
      .artemis-view-switcher-menu>a small{color:var(--op-muted);font-size:10px}
      @media(max-width:700px){.artemis-view-switcher>summary span{display:none}.artemis-view-switcher>summary{width:38px;padding:0;justify-content:center}.artemis-view-switcher-menu{position:fixed;top:70px;right:12px}}
    `}</style>
  </details>;
}
