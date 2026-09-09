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
import { corporateDeveloperLine, corporateUi } from '@/lib/operations/corporate';
import { navigation } from '@/lib/operations/navigation';
import { useWorkspace, WorkspaceContext } from '@/lib/operations/storage';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { AppAsset } from '@/components/AppAsset';
import './lean-operations.css';
import './zeus-enhancements.css';

const Zeus = dynamic(() => import('./Zeus').then(module => module.Zeus));
const LeanZeusJobDetail = dynamic(() => import('./LeanZeusJobDetail').then(module => module.LeanZeusJobDetail));
const ZeusBudgets = dynamic(() => import('./ZeusBudgets').then(module => module.ZeusBudgets));
const ZeusDashboard = dynamic(() => import('./ZeusDashboard').then(module => module.ZeusDashboard));
const LeanBudgetDetail = dynamic(() => import('./LeanBudgetDetail').then(module => module.LeanBudgetDetail));
const LeanArtemisOrderDetail = dynamic(() => import('./LeanArtemisOrderDetail').then(module => module.LeanArtemisOrderDetail));
const ArtemisDirect = dynamic(() => import('./ArtemisDirect').then(module => module.ArtemisDirect));
const Research = dynamic(() => import('./Athena').then(module => module.Research));
const Budgets = dynamic(() => import('./Athena').then(module => module.Budgets));
const Kronos = dynamic(() => import('./Kronos').then(module => module.Kronos));

import { AppSettings } from './Settings';
import { ArtemisSettings } from './ArtemisSettings';
import { ErrorContext } from './errors';
import { ExternalShare } from './ExternalShare';

const icons = {
  home: Home, calendar: CalendarDays, wrench: Wrench, users: Users, history: History,
  bag: ShoppingBag, utensils: UtensilsCrossed, chef: ChefHat, book: BookOpen,
  wallet: Wallet, box: Box, chart: BarChart3, message: MessageSquareText,
  inbox: Inbox, target: Target, file: FileText
};

export function AppRuntime({ app, page, recordId = '' }: { app: AppId; page: string; recordId?: string }) {
  const access = useStoreAccess();
  const workspaceScope = access.ready ? (access.account?.id || 'guest') : undefined;
  const w = useWorkspace(app, workspaceScope);
  const operation = useOperationPreferences(app);
  const config = navigation[app];
  const [mobile, setMobile] = useState(false);
  const [help, setHelp] = useState(false);
  const canConfigure = access.ready && (!access.account || access.canConfigureApp(app));

  const nav = config.sections.filter(section => {
    if (app === 'zeus' && section.path === 'agendamentos' && !w.data.settings.scheduleEnabled) return false;
    if (section.path === 'historico') return false;
    return operation.actionVisible(`module:${section.path}`);
  });

  const legacyArtemisOperation = app === 'artemis' && ['pedidos', 'mesas', 'cozinha'].includes(page);
  const navigationPage = page === 'historico' ? (app === 'zeus' ? 'atendimentos' : app === 'kronos' ? 'oportunidades' : page) : page;
  const pageLabel = page === 'configuracoes'
    ? corporateUi.settingsLabel
    : legacyArtemisOperation
      ? 'Operação'
      : nav.find(section => section.path === navigationPage)?.label || 'Área do aplicativo';

  const settingsBody = app === 'artemis'
    ? <ArtemisSettings w={w} />
    : <AppSettings key={app} w={w} app={app} />;

  const body = !w.ready ? <div className="op-loading" role="status">Abrindo {config.name}…</div>
    : page === 'configuracoes' ? (!access.ready ? <div className="op-loading" role="status">Validando permissão…</div> : canConfigure ? settingsBody : <section className="op-section"><div className="op-section-head"><h2>Configurações restritas</h2></div><p className="op-muted">Esta área é exclusiva do titular de uma conta com este aplicativo ativo ou de um usuário que recebeu permissão de configuração para ele.</p><div className="op-actions"><Link className="op-button secondary" href="/login">Entrar na Store</Link><Link className="op-button secondary" href={`/${app}`}>Voltar ao aplicativo</Link></div></section>)
    : app === 'zeus' && page === 'dashboard' ? <ZeusDashboard w={w} />
    : app === 'zeus' && page === 'orcamentos' ? <ZeusBudgets key={recordId || 'list'} w={w} recordId={recordId} />
    : app === 'zeus' && recordId ? <LeanZeusJobDetail key={recordId} w={w} recordId={recordId} />
    : app === 'athena-orcamentos' && recordId ? <LeanBudgetDetail key={recordId} w={w} recordId={recordId} />
    : app === 'artemis' && recordId ? <LeanArtemisOrderDetail key={recordId} w={w} recordId={recordId} />
    : app === 'zeus' ? <Zeus key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'artemis' ? <ArtemisDirect key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'kronos' ? <Kronos key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'athena-pesquisa' ? <Research key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : <Budgets key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />;

  return <WorkspaceContext.Provider value={w}>
    <ErrorContext.Provider value={w.error}>
      <div className={`op-app app-${app} theme-${w.data.settings.theme} ${w.data.settings.collapsed ? 'is-collapsed' : ''} ${mobile ? 'mobile-nav-open' : ''}`}>
        <a className="op-skip" href="#op-main">Pular para o conteúdo</a>
        {mobile && <button className="op-nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobile(false)} />}

        <aside className="op-sidebar">
          <Link className="op-brand" href={`/${app}`} aria-label={`${config.name} — início`}>
            <span className="op-brand-symbol" style={{background:'transparent',color:'var(--op-nav-ink)',overflow:'hidden'}}>
              <AppAsset
                app={app}
                kind="icon"
                alt=""
                fallback={config.short}
                style={{width:'100%',height:'100%',display:'grid',placeItems:'center',objectFit:'contain'}}
              />
            </span>
            <div><strong>{config.name}</strong><small>{config.subtitle}</small></div>
          </Link>
          <span className="op-nav-label">Sua operação</span>
          <nav aria-label={`Navegação ${config.name}`}>
            {nav.map(item => {
              const Icon = icons[item.icon as keyof typeof icons];
              const label = app === 'zeus' && item.path === 'clientes' ? `Clientes e ${w.data.settings.assetLabel.toLowerCase()}s` : item.label;
              const active = navigationPage === item.path || (app === 'artemis' && item.path === 'inicio' && legacyArtemisOperation);
              return <Link key={item.path} href={`/${app}/${item.path}`} title={label} onClick={() => setMobile(false)} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon size={20} /><span>{label}</span></Link>;
            })}
          </nav>

          <div className="op-sidebar-bottom">
            <Link href={`/${app}/configuracoes`} title={corporateUi.settingsLabel} className={page === 'configuracoes' ? 'active' : ''} aria-current={page === 'configuracoes' ? 'page' : undefined}><Settings2 size={20} /><span>{corporateUi.settingsLabel}</span></Link>
            <button onClick={() => w.mutate(data => { data.settings.collapsed = !data.settings.collapsed; }, '')} aria-label={w.data.settings.collapsed ? 'Expandir menu' : 'Recolher menu'}>{w.data.settings.collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}<span>Recolher menu</span></button>
          </div>
          <Link className="op-sidebar-credit" href="/" aria-label="Ir para a home da CRM PLUS">CRM PLUS <span>Store</span></Link>
        </aside>

        <div className="op-workspace">
          <header className="op-header">
            <button className="op-icon op-mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Abrir navegação"><Menu size={22} /></button>
            <div className="op-breadcrumb"><span>{config.name}</span><i>/</i><strong>{pageLabel}</strong>{recordId && <><i>/</i><span>registro</span></>}</div>
            <div className="op-header-tools">
              <span className="op-business-name">{w.data.settings.business}</span>
              <ExternalShare w={w} app={app} page={page} recordId={recordId} />
              <Link className="op-icon" href={`/${app}/configuracoes`} aria-label={corporateUi.settingsLabel}><Settings2 size={19} /></Link>
              <button className="op-icon" onClick={() => setHelp(!help)} aria-label="Sobre os dados deste aplicativo" aria-expanded={help}><CircleHelp size={19} /></button>
              <button className="op-icon" onClick={() => w.mutate(data => { data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light'; }, '')} aria-label={w.data.settings.theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}>{w.data.settings.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
              {canConfigure ? <Link className="op-user" href={`/${app}/configuracoes`} aria-label="Perfil e configurações">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</Link> : <span className="op-user" aria-label="Usuário sem permissão de configuração">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</span>}
            </div>
          </header>

          {help && <div className="op-help"><strong>Configuração por aplicativo.</strong><span>O Artemis mostra somente os canais e áreas que o restaurante decidiu usar. Pedidos de loja física, delivery e retirada convergem para a mesma operação.</span><button className="op-icon" aria-label="Fechar informação" onClick={() => setHelp(false)}><X size={18} /></button></div>}

          <main id="op-main" className="op-main">
            {!recordId && ((app === 'zeus' && ['atendimentos','historico'].includes(page)) || (app === 'kronos' && ['oportunidades','historico'].includes(page))) && <nav className="op-compact-tabs" aria-label="Situação dos registros"><Link href={`/${app}/${app === 'zeus' ? 'atendimentos' : 'oportunidades'}`} aria-current={page !== 'historico' ? 'page' : undefined}>Em aberto <span>{app === 'zeus' ? w.data.jobs.filter(job => !['Encerrado','Cancelado','Reprovado'].includes(job.status)).length : w.data.deals.filter(deal => !['Ganha','Perdida'].includes(deal.stage)).length}</span></Link>{operation.actionVisible('module:historico') && <Link href={`/${app}/historico`} aria-current={page === 'historico' ? 'page' : undefined}>Histórico</Link>}</nav>}
            {body}
          </main>

          <footer className="op-local-status"><span>{corporateDeveloperLine()}</span><Link href={`/${app}/configuracoes`}>{corporateUi.settingsLabel} <ArrowUpRight size={13} /></Link></footer>
        </div>

        {w.error && <div className="op-alert" role="alert"><span>{w.error}</span><button className="op-icon" onClick={() => w.setError('')} aria-label="Fechar erro"><X size={18} /></button></div>}
        {w.notice && <div className="op-toast" role="status">{w.notice}</div>}
      </div>
    </ErrorContext.Provider>
  </WorkspaceContext.Provider>;
}

