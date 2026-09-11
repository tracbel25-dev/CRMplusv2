'use client';

import Link from 'next/link';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3, BookOpen, Box, CalendarDays, ChefHat, ClipboardCheck,
  FileText, History, Home, Inbox, Menu, MessageSquareText, Moon,
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
import './zeus-modal-layout.css';

const Zeus = dynamic(() => import('./Zeus').then(module => module.Zeus));
const LeanZeusJobDetail = dynamic(() => import('./LeanZeusJobDetail').then(module => module.LeanZeusJobDetail));
const ZeusBudgets = dynamic(() => import('./ZeusBudgets').then(module => module.ZeusBudgets));
const ZeusDashboard = dynamic(() => import('./ZeusDashboard').then(module => module.ZeusDashboard));
const ZeusBilling = dynamic(() => import('./ZeusBilling').then(module => module.ZeusBilling));
const ZeusCheckIn = dynamic(() => import('./ZeusCheckIn').then(module => module.ZeusCheckIn));
const LeanBudgetDetail = dynamic(() => import('./LeanBudgetDetail').then(module => module.LeanBudgetDetail));
const LeanArtemisOrderDetail = dynamic(() => import('./LeanArtemisOrderDetail').then(module => module.LeanArtemisOrderDetail));
const ArtemisDirect = dynamic(() => import('./ArtemisDirect').then(module => module.ArtemisDirect));
const Research = dynamic(() => import('./Athena').then(module => module.Research));
const Budgets = dynamic(() => import('./AthenaBudgets').then(module => module.Budgets));
const Kronos = dynamic(() => import('./Kronos').then(module => module.Kronos));

import { AppSettings } from './Settings';
import { ArtemisSettings } from './ArtemisSettings';
import { ErrorContext } from './errors';
import { ExternalShare } from './ExternalShare';

const icons = {
  home: Home, calendar: CalendarDays, wrench: Wrench, users: Users, history: History,
  bag: ShoppingBag, utensils: UtensilsCrossed, chef: ChefHat, book: BookOpen,
  wallet: Wallet, box: Box, chart: BarChart3, message: MessageSquareText,
  inbox: Inbox, target: Target, file: FileText, checklist: ClipboardCheck
};

const zeusPagePermissions: Record<string,string> = {
  dashboard:'dashboard_view',
  agendamentos:'appointments_view',
  checklist:'jobs_view',
  atendimentos:'jobs_view',
  historico:'jobs_view',
  orcamentos:'quotes_view',
  faturamento:'billing_view',
  clientes:'customers_manage'
};

export function AppRuntime({ app, page, recordId = '' }: { app: AppId; page: string; recordId?: string }) {
  const access = useStoreAccess();
  const workspaceScope = access.ready ? (access.account?.id || 'guest') : undefined;
  const w = useWorkspace(app, workspaceScope);
  const operation = useOperationPreferences(app);
  const config = navigation[app];
  const [mobile, setMobile] = useState(false);
  const canConfigure = access.ready && (!access.account || access.canConfigureApp(app));
  const canUsePage = app !== 'zeus' || !access.account || page === 'inicio' || page === 'configuracoes'
    || !zeusPagePermissions[page] || access.hasPermission(app, zeusPagePermissions[page]);

  const nav = config.sections.filter(section => {
    if (app === 'zeus' && section.path === 'agendamentos' && !w.data.settings.scheduleEnabled) return false;
    if (app === 'zeus' && section.path === 'orcamentos' && !w.data.settings.budgetEnabled) return false;
    if (section.path === 'historico') return false;
    if (app === 'zeus' && access.account && zeusPagePermissions[section.path] && !access.hasPermission(app, zeusPagePermissions[section.path])) return false;
    return operation.actionVisible(`module:${section.path}`);
  });

  const legacyArtemisOperation = app === 'artemis' && ['pedidos', 'mesas', 'cozinha'].includes(page);
  const navigationPage = page === 'historico' ? (app === 'zeus' ? 'atendimentos' : app === 'kronos' ? 'oportunidades' : page) : page;
  const zeusClientsLabel = `Clientes e ${w.data.settings.assetLabel.toLowerCase()}s`;
  const pageLabel = page === 'configuracoes'
    ? corporateUi.settingsLabel
    : legacyArtemisOperation
      ? 'Operação'
      : app === 'zeus' && navigationPage === 'clientes'
        ? zeusClientsLabel
        : nav.find(section => section.path === navigationPage)?.label || 'Área do aplicativo';

  const settingsBody = app === 'artemis'
    ? <ArtemisSettings w={w} />
    : <AppSettings key={app} w={w} app={app} />;

  const restricted = <section className="op-section"><div className="op-section-head"><h2>Acesso não liberado</h2></div><p className="op-muted">Seu perfil não possui permissão para abrir esta área. O titular da conta pode alterar isso em Configurações → Acessos.</p><div className="op-actions"><Link className="op-button secondary" href={`/${app}/inicio`}>Voltar ao início</Link></div></section>;

  const body = !w.ready ? <div className="op-loading" role="status">Abrindo {config.name}…</div>
    : page === 'configuracoes' ? (!access.ready ? <div className="op-loading" role="status">Validando permissão…</div> : canConfigure ? settingsBody : restricted)
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

  return <WorkspaceContext.Provider value={w}>
    <ErrorContext.Provider value={w.error}>
      <div className={`op-app app-${app} theme-${w.data.settings.theme} ${w.data.settings.collapsed ? 'is-collapsed' : ''} ${mobile ? 'mobile-nav-open' : ''}`}>
        <a className="op-skip" href="#op-main">Pular para o conteúdo</a>
        {mobile && <button className="op-nav-backdrop" aria-label="Fechar navegação" onClick={() => setMobile(false)} />}

        <aside className="op-sidebar">
          <Link className="op-brand" href={`/${app}`} aria-label={`${config.name} — início`}>
            <span className="op-brand-symbol" style={{background:'transparent',color:'var(--op-nav-ink)',overflow:'hidden'}}>
              <AppAsset app={app} kind="icon" alt="" fallback={config.short} style={{width:'100%',height:'100%',display:'grid',placeItems:'center',objectFit:'contain'}} />
            </span>
            <div><strong>{config.name}</strong><small>{config.subtitle}</small></div>
          </Link>
          <span className="op-nav-label">Sua operação</span>
          <nav aria-label={`Navegação ${config.name}`}>
            {nav.map(item => {
              const Icon = icons[item.icon as keyof typeof icons];
              const label = app === 'zeus' && item.path === 'clientes' ? zeusClientsLabel : item.label;
              const active = navigationPage === item.path || (app === 'artemis' && item.path === 'inicio' && legacyArtemisOperation);
              return <Link key={item.path} href={`/${app}/${item.path}`} title={label} onClick={() => setMobile(false)} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon size={20} /><span>{label}</span></Link>;
            })}
          </nav>

          <div className="op-sidebar-bottom">
            {canConfigure ? <Link href={`/${app}/configuracoes`} title={corporateUi.settingsLabel} className={page === 'configuracoes' ? 'active' : ''} aria-current={page === 'configuracoes' ? 'page' : undefined}><Settings2 size={20} /><span>{corporateUi.settingsLabel}</span></Link> : null}
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
              <button className="op-icon" onClick={() => w.mutate(data => { data.settings.theme = data.settings.theme === 'light' ? 'dark' : 'light'; }, '')} aria-label={w.data.settings.theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}>{w.data.settings.theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
              {canConfigure ? <Link className="op-user" href={`/${app}/configuracoes`} aria-label="Perfil e configurações">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</Link> : <span className="op-user" aria-label="Usuário sem permissão de configuração">{w.data.settings.operator ? w.data.settings.operator.slice(0, 2).toUpperCase() : <Users size={17} />}</span>}
            </div>
          </header>

          <main id="op-main" className="op-main">
            {!recordId && canUsePage && ((app === 'zeus' && ['atendimentos','historico'].includes(page)) || (app === 'kronos' && ['oportunidades','historico'].includes(page))) && <nav className="op-compact-tabs" aria-label="Situação dos registros"><Link href={`/${app}/${app === 'zeus' ? 'atendimentos' : 'oportunidades'}`} aria-current={page !== 'historico' ? 'page' : undefined}>Em aberto <span>{app === 'zeus' ? w.data.jobs.filter(job => !['Encerrado','Cancelado','Reprovado'].includes(job.status)).length : w.data.deals.filter(deal => !['Ganha','Perdida'].includes(deal.stage)).length}</span></Link>{operation.actionVisible('module:historico') && <Link href={`/${app}/historico`} aria-current={page === 'historico' ? 'page' : undefined}>Histórico</Link>}</nav>}
            {body}
          </main>

          <footer className="op-local-status"><span>{corporateDeveloperLine()}</span></footer>
        </div>

        {w.error && <div className="op-alert" role="alert"><span>{w.error}</span><button className="op-icon" onClick={() => w.setError('')} aria-label="Fechar erro"><X size={18} /></button></div>}
        {w.notice && <div className="op-toast" role="status">{w.notice}</div>}

        <style jsx global>{`
          details.op-config-group{padding:0!important;overflow:hidden;border-radius:12px!important}
          details.op-config-group>summary{min-height:68px!important;padding:0 18px!important;margin:0!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;cursor:pointer}
          details.op-config-group>summary strong{font-size:16px!important}
          details.op-config-group>summary span{margin-left:auto!important;color:var(--op-muted)!important}
          details.op-config-group[open]>summary{border-bottom:1px solid var(--op-line)}
          .op-config-groups{gap:10px!important}
          .zeus-dashboard-grid>div{min-width:0;padding:18px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-paper)}
          .zeus-dashboard-grid{align-items:start}
          @media(max-width:900px){.zeus-dashboard-grid{grid-template-columns:1fr!important}}
          @media(max-width:720px){
            .app-zeus .op-main{padding-left:14px!important;padding-right:14px!important}
            .app-zeus .op-title{display:grid!important;gap:14px!important}
            .app-zeus .op-title>.op-actions{width:100%;display:grid!important;grid-template-columns:1fr!important}
            .app-zeus .op-title>.op-actions .op-button{width:100%}
            .app-zeus .zeus-stage-rail{display:flex!important;overflow-x:auto!important;flex-wrap:nowrap!important;scroll-snap-type:x proximity;padding-bottom:7px}
            .app-zeus .zeus-stage-rail>span{flex:0 0 auto;scroll-snap-align:start}
            .app-zeus .zeus-workbench{grid-template-columns:1fr!important}
            .app-zeus .zeus-context-stack{grid-template-columns:1fr 1fr!important;order:2}
            .app-zeus .zeus-now{min-width:0}
            .app-zeus .op-actions{flex-wrap:wrap}
            .app-zeus .op-dialog.wide{width:calc(100vw - 16px)!important;max-width:none!important}
          }
          @media(max-width:430px){.app-zeus .zeus-context-stack{grid-template-columns:1fr!important}}
        `}</style>
      </div>
    </ErrorContext.Provider>
  </WorkspaceContext.Provider>;
}
