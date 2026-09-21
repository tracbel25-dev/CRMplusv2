'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3, BookOpen, Box, CalendarDays, ChefHat, ClipboardCheck,
  FileText, History, Home, Inbox, Menu, MessageSquareText, Moon,
  PanelLeftClose, PanelLeftOpen, Settings2, ShoppingBag, Sun, Target, Users,
  UtensilsCrossed, Wallet, Wrench, X
} from 'lucide-react';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';
import { clientMessage } from '@/lib/clientMessage';
import { AppId } from '@/lib/operations/model';
import { corporateDeveloperLine, corporateUi } from '@/lib/operations/corporate';
import { navigation } from '@/lib/operations/navigation';
import { useWorkspace, WorkspaceContext } from '@/lib/operations/storage';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { ZEUS_PAGE_FEATURE, zeusViewHasFeature } from '@/lib/operations/zeusPlans';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { AppAsset } from '@/components/AppAsset';
import './lean-operations.css';
import './zeus.css';

const Zeus = dynamic(() => import('./Zeus').then(module => module.Zeus));
const LeanZeusJobDetail = dynamic(() => import('./LeanZeusJobDetail').then(module => module.LeanZeusJobDetail));
const ZeusBudgets = dynamic(() => import('./ZeusBudgets').then(module => module.ZeusBudgets));
const ZeusDashboard = dynamic(() => import('./ZeusDashboard').then(module => module.ZeusDashboard));
const ZeusBilling = dynamic(() => import('./ZeusBilling').then(module => module.ZeusBilling));
const ZeusCheckIn = dynamic(() => import('./ZeusCheckIn').then(module => module.ZeusCheckIn));
const ZeusExternalSync = dynamic(() => import('./ZeusExternalSync').then(module => module.ZeusExternalSync), { ssr: false });
const ZeusServiceTypesCloudBridge = dynamic(() => import('./ZeusServiceTypesCloud').then(module => module.ZeusServiceTypesCloudBridge), { ssr: false });
const LeanBudgetDetail = dynamic(() => import('./LeanBudgetDetail').then(module => module.LeanBudgetDetail));
const LeanArtemisOrderDetail = dynamic(() => import('./LeanArtemisOrderDetail').then(module => module.LeanArtemisOrderDetail));
const ArtemisDirect = dynamic(() => import('./ArtemisDirect').then(module => module.ArtemisDirect));
const ArtemisViewHome = dynamic(() => import('./ArtemisViews').then(module => module.ArtemisViewHome));
const ArtemisManagementHome = dynamic(() => import('./ArtemisViews').then(module => module.ArtemisManagementHome));
const Research = dynamic(() => import('./Athena').then(module => module.Research));
const Budgets = dynamic(() => import('./AthenaBudgets').then(module => module.Budgets));
const Kronos = dynamic(() => import('./Kronos').then(module => module.Kronos));

import { AppSettings } from './Settings';
import { ArtemisSettings } from './ArtemisSettings';
import { ErrorContext } from './errors';
import { ExternalShare } from './ExternalShare';
import { ArtemisViewSwitcher } from './ArtemisViewSwitcher';

const icons = {
  home: Home, calendar: CalendarDays, wrench: Wrench, users: Users, history: History,
  bag: ShoppingBag, utensils: UtensilsCrossed, chef: ChefHat, book: BookOpen,
  wallet: Wallet, box: Box, chart: BarChart3, message: MessageSquareText,
  inbox: Inbox, target: Target, file: FileText, checklist: ClipboardCheck, settings: Settings2
};

const zeusPagePermissions: Record<string,string> = {
  dashboard:'dashboard_view', agendamentos:'appointments_view', checklist:'jobs_view', atendimentos:'jobs_view',
  historico:'jobs_view', orcamentos:'quotes_view', faturamento:'billing_view', clientes:'customers_manage'
};

const artemisPagePermissions: Record<string,string> = {
  atendimento:'artemis_service', pedidos:'artemis_service', mesas:'artemis_service', caixa:'artemis_service',
  cozinha:'artemis_kitchen',
  gestao:'artemis_manage', cardapio:'artemis_manage', estoque:'artemis_manage', clientes:'artemis_manage',
  relatorios:'artemis_manage', configuracoes:'artemis_manage', 'cardapio-digital':'artemis_manage'
};
const artemisManagementPages = new Set(['gestao','cardapio','estoque','clientes','relatorios','configuracoes','cardapio-digital']);
const artemisServicePages = new Set(['atendimento','pedidos','mesas','caixa']);

const zeusNavigationGroups = [
  { label: 'Ordens de serviço', paths: ['agendamentos', 'atendimentos', 'checklist', 'orcamentos'] },
  { label: 'Cadastros', paths: ['clientes'] },
  { label: 'Gestão administrativa', paths: ['faturamento', 'dashboard'] },
];

export function AppRuntime({ app, page, recordId = '' }: { app: AppId; page: string; recordId?: string }) {
  const access = useStoreAccess();
  const workspaceScope = access.ready ? (access.account?.id || 'guest') : undefined;
  const w = useWorkspace(app, workspaceScope);
  const operation = useOperationPreferences(app, w);
  const config = navigation[app];
  const [mobile, setMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(w.data.settings.collapsed);
  const canConfigure = access.ready && (!access.account || access.canConfigureApp(app));
  const permanentArtemisService = app === 'artemis' && access.hasPermission('artemis','artemis_service');
  const permanentArtemisKitchen = app === 'artemis' && access.hasPermission('artemis','artemis_kitchen');
  const temporaryArtemisSwitch = app === 'artemis' && !access.isOwner && !!w.data.settings.staffViewSwitchEnabled && (permanentArtemisService || permanentArtemisKitchen);
  const artemisPermissionGranted = (permission?: string) => {
    if (!permission || !access.account) return true;
    if (access.hasPermission('artemis', permission)) return true;
    return temporaryArtemisSwitch && (permission === 'artemis_service' || permission === 'artemis_kitchen');
  };
  const artemisRequiredPermission = app === 'artemis' ? artemisPagePermissions[page] : undefined;
  const canUsePage = app === 'zeus'
    ? (!access.account || page === 'inicio' || page === 'configuracoes' || !zeusPagePermissions[page] || access.hasPermission(app, zeusPagePermissions[page]))
    : app === 'artemis'
      ? (!access.account || page === 'inicio' || artemisPermissionGranted(artemisRequiredPermission))
      : true;
  const planFeature = app === 'zeus' ? ZEUS_PAGE_FEATURE[page] : undefined;
  const canUsePlanPage = !planFeature || zeusViewHasFeature(w.data.settings, planFeature);

  useEffect(() => { setSidebarCollapsed(w.data.settings.collapsed); }, [app, workspaceScope, w.data.settings.collapsed]);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    void w.mutate(data => { data.settings.collapsed = next; }, '').then(ok => { if (!ok) setSidebarCollapsed(w.data.settings.collapsed); });
  };

  if (!w.ready) return <AppLoadingScreen label={`Carregando ${config.name}`} />;

  const publicError = w.error ? clientMessage(w.error) : '';
  const nav = config.sections.filter(section => {
    if (app === 'zeus' && section.path === 'agendamentos' && !w.data.settings.scheduleEnabled) return false;
    if (app === 'zeus' && section.path === 'orcamentos' && !w.data.settings.budgetEnabled) return false;
    if (section.path === 'historico') return false;
    if (app === 'zeus' && access.account && zeusPagePermissions[section.path] && !access.hasPermission(app, zeusPagePermissions[section.path])) return false;
    if (app === 'artemis' && access.account && artemisPagePermissions[section.path] && !artemisPermissionGranted(artemisPagePermissions[section.path])) return false;
    if (app === 'zeus') {
      const feature = ZEUS_PAGE_FEATURE[section.path];
      if (feature && !zeusViewHasFeature(w.data.settings, feature)) return false;
    }
    return operation.actionVisible(`module:${section.path}`);
  });

  const legacyArtemisOperation = app === 'artemis' && ['pedidos', 'mesas', 'caixa'].includes(page);
  const navigationPage = page === 'historico' ? (app === 'zeus' ? 'atendimentos' : app === 'kronos' ? 'oportunidades' : page) : page;
  const zeusClientsLabel = `Clientes e ${w.data.settings.assetLabel.toLowerCase()}s`;
  const artemisArea = app === 'artemis'
    ? (artemisManagementPages.has(page) ? 'gestao' : artemisServicePages.has(page) ? 'atendimento' : page)
    : '';
  const artemisPageLabel: Record<string,string> = { inicio:'Início', atendimento:'Atendimento', cozinha:'Cozinha', gestao:'Gestão', cardapio:'Cardápio', estoque:'Estoque', clientes:'Clientes', relatorios:'Relatórios', configuracoes:'Configurações', caixa:'Caixa', pedidos:'Atendimento', mesas:'Atendimento' };
  const pageLabel = app === 'artemis'
    ? (artemisPageLabel[page] || 'Artemis')
    : page === 'configuracoes' ? corporateUi.settingsLabel
    : app === 'zeus' && navigationPage === 'clientes' ? zeusClientsLabel
    : nav.find(section => section.path === navigationPage)?.label || 'Área do aplicativo';

  const settingsBody = app === 'artemis' ? <ArtemisSettings w={w} /> : <AppSettings key={app} w={w} app={app} />;
  const restricted = <section className="op-section"><div className="op-section-head"><h2>Acesso não liberado</h2></div><p className="op-muted">Seu perfil não possui permissão para abrir esta área. O titular da conta pode alterar isso em Configurações → Acessos.</p><div className="op-actions"><Link className="op-button secondary" href={`/${app}/inicio`}>Voltar ao início</Link></div></section>;
  const planRestricted = <section className="op-section"><div className="op-section-head"><h2>Recurso não incluído no plano</h2></div><p className="op-muted">Os dados existentes permanecem preservados. Faça upgrade do Zeus para voltar a usar este módulo.</p><div className="op-actions"><Link className="op-button secondary" href="/zeus/inicio">Voltar ao início</Link><Link className="op-button" href="/planos?app=zeus">Ver planos</Link></div></section>;

  const body = app === 'artemis' && page === 'inicio' ? <ArtemisViewHome w={w} />
    : app === 'artemis' && page === 'gestao' ? (canUsePage ? <ArtemisManagementHome w={w} /> : restricted)
    : page === 'configuracoes' ? (canConfigure && canUsePage ? settingsBody : restricted)
    : !canUsePlanPage ? planRestricted
    : !canUsePage ? restricted
    : app === 'zeus' && page === 'dashboard' ? <ZeusDashboard w={w} />
    : app === 'zeus' && page === 'faturamento' ? <ZeusBilling w={w} />
    : app === 'zeus' && page === 'checklist' ? <ZeusCheckIn w={w} />
    : app === 'zeus' && page === 'orcamentos' ? <ZeusBudgets key={recordId || 'list'} w={w} recordId={recordId} />
    : app === 'zeus' && recordId ? <LeanZeusJobDetail key={recordId} w={w} recordId={recordId} />
    : app === 'athena-orcamentos' && recordId ? <LeanBudgetDetail key={recordId} w={w} recordId={recordId} />
    : app === 'artemis' && recordId ? <LeanArtemisOrderDetail key={recordId} w={w} recordId={recordId} />
    : app === 'zeus' ? <Zeus key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'artemis' ? <ArtemisDirect key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'kronos' ? <Kronos key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : app === 'athena-pesquisa' ? <Research key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />
    : <Budgets key={`${page}:${recordId}`} w={w} page={page} recordId={recordId} />;

  const renderNavItem = (item: (typeof config.sections)[number]) => {
    const Icon = icons[item.icon as keyof typeof icons];
    const label = app === 'zeus' && item.path === 'clientes' ? zeusClientsLabel : item.label;
    const active = app === 'artemis' ? artemisArea === item.path : navigationPage === item.path;
    return <Link prefetch key={item.path} href={`/${app}/${item.path}`} title={label} onClick={() => setMobile(false)} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon size={20} /><span>{label}</span></Link>;
  };

  return <WorkspaceContext.Provider value={w}>
    <ErrorContext.Provider value={publicError}>
      {app === 'zeus' && <>{zeusViewHasFeature(w.data.settings, 'checklist') && operation.actionVisible('module:checklist') && <ZeusExternalSync w={w} />}<ZeusServiceTypesCloudBridge w={w} /></>}
      <div className={`op-app app-${app} theme-${w.data.settings.theme} ${sidebarCollapsed ? 'is-collapsed' : ''} ${mobile ? 'mobile-nav-open' : ''}`}>
        <a className="op-skip" href="#op-main">Pular para o conteúdo</a>
        {mobile && <button className="op-nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobile(false)} />}

        <aside className="op-sidebar">
          <Link className="op-brand" href={`/${app}`} aria-label={`${config.name} — início`}>
            <span className="op-brand-symbol" style={{background:'transparent',color:'var(--op-nav-ink)',overflow:'hidden'}}><AppAsset app={app} kind="icon" alt="" fallback={config.short} style={{width:'100%',height:'100%',display:'grid',placeItems:'center',objectFit:'contain'}} /></span>
            <div><strong>{config.name}</strong><small>{config.subtitle}</small></div>
          </Link>
          {app === 'artemis' ? <span className="op-nav-label">Visões</span> : app !== 'zeus' && <span className="op-nav-label">Sua operação</span>}
          <nav aria-label={`Navegação ${config.name}`}>
            {app === 'zeus' ? <>{nav.filter(item => item.path === 'inicio').map(renderNavItem)}{zeusNavigationGroups.map(group => { const items = nav.filter(item => group.paths.includes(item.path)); if (!items.length) return null; return <div className="zeus-nav-group" key={group.label}><span className="op-nav-label zeus-nav-group-label">{group.label}</span>{items.map(renderNavItem)}</div>; })}</> : nav.map(renderNavItem)}
          </nav>

          <div className="op-sidebar-bottom">
            {canConfigure && (app !== 'artemis' || artemisPermissionGranted('artemis_manage')) ? <Link href={`/${app}/configuracoes`} title={corporateUi.settingsLabel} className={page === 'configuracoes' ? 'active' : ''} aria-current={page === 'configuracoes' ? 'page' : undefined}><Settings2 size={20} /><span>{corporateUi.settingsLabel}</span></Link> : null}
            <button onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}>{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}<span>{sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}</span></button>
          </div>
          <Link className="op-sidebar-credit" href="/" aria-label="Ir para a home da CRM PLUS">CRM PLUS <span>Store</span></Link>
        </aside>

        <div className="op-workspace">
          <header className="op-header">
            <button className="op-icon op-mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Abrir navegação"><Menu size={22} /></button>
            <div className="op-breadcrumb"><span>{config.name}</span><i>/</i><strong>{pageLabel}</strong></div>
            <div className="op-header-tools"><span className="op-business-name">{w.data.settings.business}</span>{app === 'artemis' && <ArtemisViewSwitcher w={w} page={page} />}{(app !== 'artemis' || artemisManagementPages.has(page)) && <ExternalShare w={w} app={app} page={page} recordId={recordId} />}<button className="op-icon" onClick={() => w.mutate(data => { data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light'; }, '')} aria-label={w.data.settings.theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}>{w.data.settings.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>{canConfigure ? <Link className="op-user" href={`/${app}/configuracoes`} aria-label="Perfil e configurações">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</Link> : <span className="op-user" aria-label="Usuário sem permissão de configuração">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</span>}</div>
          </header>

          <main id="op-main" className="op-main">
            {!recordId && canUsePage && canUsePlanPage && ((app === 'zeus' && ['atendimentos','historico'].includes(page)) || (app === 'kronos' && ['oportunidades','historico'].includes(page))) && <nav className="op-compact-tabs" aria-label="Situação dos registros"><Link href={`/${app}/${app === 'zeus' ? 'atendimentos' : 'oportunidades'}`} aria-current={page !== 'historico' ? 'page' : undefined}>Em aberto <span>{app === 'zeus' ? w.data.jobs.filter(job => !['Encerrado','Cancelado','Reprovado'].includes(job.status)).length : w.data.deals.filter(deal => !['Ganha','Perdida'].includes(deal.stage)).length}</span></Link>{operation.actionVisible('module:historico') && <Link href={`/${app}/historico`} aria-current={page === 'historico' ? 'page' : undefined}>Histórico</Link>}</nav>}
            {body}
          </main>
          <footer className="op-local-status"><span>{corporateDeveloperLine()}</span></footer>
        </div>

        {publicError && <div className="op-alert" role="alert"><span>{publicError}</span><button className="op-icon" onClick={() => w.setError('')} aria-label="Fechar erro"><X size={18} /></button></div>}
        {w.notice && <div className="op-toast" role="status">{w.notice}</div>}
        <style jsx global>{`
          details.op-config-group{padding:0!important;overflow:hidden;border-radius:12px!important}
          details.op-config-group>summary{min-height:68px!important;padding:0 18px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;cursor:pointer}
          details.op-config-group>summary strong{font-size:16px!important}
          details.op-config-group>summary span{margin-left:auto!important;color:var(--op-muted)!important}
          details.op-config-group[open]>summary{border-bottom:1px solid var(--op-line)}
          .op-config-groups{gap:10px!important}
        `}</style>
      </div>
    </ErrorContext.Provider>
  </WorkspaceContext.Provider>;
}
