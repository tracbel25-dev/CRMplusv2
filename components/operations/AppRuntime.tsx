'use client';

import Link from 'next/link';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowUpRight, BarChart3, BookOpen, Box, CalendarDays, ChefHat,
  CircleHelp, FileText, History, Home, Inbox, Menu, MessageSquareText, Moon,
  PanelLeftClose, PanelLeftOpen, Settings2, ShoppingBag, Sun, Target, Users,
  UtensilsCrossed, Wallet, Wrench, X
} from 'lucide-react';
import { AppId } from '@/lib/operations/model';
import { navigation } from '@/lib/operations/navigation';
import { useWorkspace } from '@/lib/operations/storage';
import { useOperationPreferences } from '@/lib/operations/configuration';

const Zeus = dynamic(() => import('./Zeus').then(module => module.Zeus));
const Artemis = dynamic(() => import('./Artemis').then(module => module.Artemis));
const Research = dynamic(() => import('./Athena').then(module => module.Research));
const Budgets = dynamic(() => import('./Athena').then(module => module.Budgets));
const Kronos = dynamic(() => import('./Kronos').then(module => module.Kronos));

import { AppSettings } from './Settings';
import { ErrorContext } from './errors';

const icons = {
  home: Home,
  calendar: CalendarDays,
  wrench: Wrench,
  users: Users,
  history: History,
  bag: ShoppingBag,
  utensils: UtensilsCrossed,
  chef: ChefHat,
  book: BookOpen,
  wallet: Wallet,
  box: Box,
  chart: BarChart3,
  message: MessageSquareText,
  inbox: Inbox,
  target: Target,
  file: FileText
};

export function AppRuntime({ app, page }: { app: AppId; page: string }) {
  const w = useWorkspace(app);
  const operation = useOperationPreferences(app);
  const config = navigation[app];
  const [mobile, setMobile] = useState(false);
  const [help, setHelp] = useState(false);

  const nav = config.sections.filter(section => {
    if (app === 'zeus' && section.path === 'agendamentos' && !w.data.settings.scheduleEnabled) return false;
    return operation.actionVisible(`module:${section.path}`);
  });

  const pageLabel = page === 'configuracoes'
    ? 'Configurações'
    : nav.find(section => section.path === page)?.label || 'Área do aplicativo';

  return <ErrorContext.Provider value={w.error}>
    <div className={`op-app app-${app} theme-${w.data.settings.theme} ${w.data.settings.collapsed ? 'is-collapsed' : ''} ${mobile ? 'mobile-nav-open' : ''}`}>
      <a className="op-skip" href="#op-main">Pular para o conteúdo</a>
      {mobile && <button className="op-nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobile(false)} />}

      <aside className="op-sidebar">
        <Link className="op-brand" href={`/${app}`} aria-label={`${config.name} — início`}>
          <span className="op-brand-symbol">{config.short}</span>
          <div><strong>{config.name}</strong><small>{config.subtitle}</small></div>
        </Link>
        <span className="op-nav-label">Sua operação</span>
        <nav aria-label={`Navegação ${config.name}`}>
          {nav.map(item => {
            const Icon = icons[item.icon as keyof typeof icons];
            const label = app === 'zeus' && item.path === 'clientes'
              ? `Clientes e ${w.data.settings.assetLabel.toLowerCase()}s`
              : item.label;
            return <Link
              key={item.path}
              href={`/${app}/${item.path}`}
              title={label}
              onClick={() => setMobile(false)}
              className={page === item.path ? 'active' : ''}
              aria-current={page === item.path ? 'page' : undefined}
            >
              <Icon size={20} /><span>{label}</span>
            </Link>;
          })}
        </nav>

        <div className="op-sidebar-bottom">
          <Link href={`/${app}/configuracoes`} title="Configurações" className={page === 'configuracoes' ? 'active' : ''} aria-current={page === 'configuracoes' ? 'page' : undefined}>
            <Settings2 size={20} /><span>Configurações</span>
          </Link>
          <button onClick={() => w.mutate(data => { data.settings.collapsed = !data.settings.collapsed; }, '')} aria-label={w.data.settings.collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {w.data.settings.collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            <span>Recolher menu</span>
          </button>
        </div>
        <Link className="op-sidebar-credit" href="/" aria-label="Ir para a home da CRM PLUS">CRM PLUS <span>Store</span></Link>
      </aside>

      <div className="op-workspace">
        <header className="op-header">
          <button className="op-icon op-mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Abrir navegação"><Menu size={22} /></button>
          <div className="op-breadcrumb"><span>{config.name}</span><i>/</i><strong>{pageLabel}</strong></div>
          <div className="op-header-tools">
            <span className="op-business-name">{w.data.settings.business}</span>
            <button className="op-icon" onClick={() => setHelp(!help)} aria-label="Sobre os dados deste aplicativo" aria-expanded={help}><CircleHelp size={19} /></button>
            <button className="op-icon" onClick={() => w.mutate(data => { data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light'; }, '')} aria-label={w.data.settings.theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}>
              {w.data.settings.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <Link className="op-user" href={`/${app}/configuracoes`} aria-label="Perfil e configurações">
              {w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}
            </Link>
          </div>
        </header>

        {help && <div className="op-help">
          <strong>Configuração por aplicativo.</strong>
          <span>Campos, nomes, módulos e ações podem ser adaptados em Configurações. Os registros operacionais ainda ficam neste navegador enquanto a persistência de conta não está conectada ao projeto Supabase correto.</span>
          <button className="op-icon" aria-label="Fechar informação" onClick={() => setHelp(false)}><X size={18} /></button>
        </div>}

        <main id="op-main" className="op-main">
          {!w.ready
            ? <div className="op-loading" role="status">Abrindo {config.name}…</div>
            : page === 'configuracoes'
              ? <AppSettings key={app} w={w} app={app} />
              : app === 'zeus'
                ? <Zeus key={page} w={w} page={page} />
                : app === 'artemis'
                  ? <Artemis key={page} w={w} page={page} />
                  : app === 'kronos'
                    ? <Kronos key={page} w={w} page={page} />
                    : app === 'athena-pesquisa'
                      ? <Research key={page} w={w} page={page} />
                      : <Budgets key={page} w={w} page={page} />}
        </main>

        <footer className="op-local-status">
          <span>Dados operacionais salvos neste navegador</span>
          <Link href={`/${app}/configuracoes`}>Configurar aplicativo <ArrowUpRight size={13} /></Link>
        </footer>
      </div>

      {w.error && <div className="op-alert" role="alert"><span>{w.error}</span><button className="op-icon" onClick={() => w.setError('')} aria-label="Fechar erro"><X size={18} /></button></div>}
      {w.notice && <div className="op-toast" role="status">{w.notice}</div>}
    </div>
  </ErrorContext.Provider>;
}
