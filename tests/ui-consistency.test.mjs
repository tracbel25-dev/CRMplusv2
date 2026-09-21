import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const operations = readFileSync(join(root, 'app', '(operations)', '[app]', '[[...path]]', 'operations.css'), 'utf8');
const lean = readFileSync(join(root, 'components', 'operations', 'lean-operations.css'), 'utf8');

test('operational action buttons use the shared geometry tokens', () => {
  assert.match(operations, /--op-button-height:42px/);
  assert.match(operations, /--op-button-compact-height:36px/);
  assert.match(operations, /--op-button-radius:10px/);
  assert.match(operations, /--op-button-font-size:13px/);
  assert.match(operations, /--op-icon-button-size:38px/);

  const actionButtonBlock = operations.match(/\.op-button\{[^}]+\}/)?.[0] || '';
  assert.match(actionButtonBlock, /min-height:var\(--op-button-height\)/);
  assert.match(actionButtonBlock, /border-radius:var\(--op-button-radius\)/);
  assert.match(actionButtonBlock, /font-size:var\(--op-button-font-size\)/);

  const localHardcodedGeometry = [...lean.matchAll(/\.op-button\{[^}]*?(?:min-height|padding|font-size):(?:36px|38px|7px|8px|10px|11px|12px)[^}]*\}/g)];
  assert.equal(localHardcodedGeometry.length, 0, 'Lean Zeus styles must use shared button tokens instead of local geometry.');
});


test('Zeus atendimentos keeps one filter per visible column and no global filter/sort control', () => {
  const bar = readFileSync(join(root, 'components', 'operations', 'ZeusFilterBar.tsx'), 'utf8');
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');

  assert.match(bar, /zeus-filter-column-bar/);
  assert.match(bar, /definitions\.map\(definition/);
  assert.doesNotMatch(bar, /zeus-sort-control/);
  assert.doesNotMatch(bar, />Filtros</);
  assert.doesNotMatch(zeus, /sortOptions=/);
  assert.doesNotMatch(zeus, /onDescending=/);
  assert.match(zeus, /key === 'Orçamento'.*zeusViewHasFeature\(s, 'budgets'\)/s);
});


test('Zeus keeps visible filter columns even when there are no records yet', () => {
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');
  assert.match(zeus, /return available\.map\(key => \(\{ key, label: display\[key\] \|\| key, options: values\[key\] \|\| \[\] \}\)\);/);
  assert.doesNotMatch(zeus, /filter\(item => item\.options\.length\)/);
});


test('Zeus runtime syncs operational plan from the active Store subscription', () => {
  const appAccess = readFileSync(join(root, 'lib', 'server', 'appAccess.ts'), 'utf8');
  const planAccess = readFileSync(join(root, 'lib', 'server', 'zeusPlanAccess.ts'), 'utf8');

  assert.match(appAccess, /select:'app_id,plan_id,status,current_period_end,seats'/);
  assert.match(appAccess, /syncZeusEntitlementsFromStore\(membership\.account_id, storePlanCode\)/);
  assert.match(planAccess, /tenant_entitlements\?on_conflict=tenant_key/);
  assert.match(planAccess, /source: 'store_runtime'/);
});



test('Zeus separates commercial modules from operational field visibility', () => {
  const plans = readFileSync(join(root, 'lib', 'operations', 'zeusPlans.ts'), 'utf8');
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');

  assert.match(plans, /const START: ZeusFeature\[\] = \[[^\]]*'responsible'/s);
  assert.match(plans, /const ESSENCIAL: ZeusFeature\[\] = \[[^\]]*'team_management'/s);
  assert.match(plans, /const PLUS: ZeusFeature\[\] = \[[^\]]*'granular_permissions'/s);
  assert.doesNotMatch(plans, /'Responsável \/ técnico'/);
  assert.match(zeus, /key === 'Responsável'\) return operation\.fieldVisible\('technician'\)/);
  assert.match(zeus, /key === 'Prazo'\) return operation\.fieldVisible\('due'\)/);
  assert.match(zeus, /key === 'Orçamento'\) return zeusViewHasFeature\(s, 'budgets'\)/);
});

test('Zeus does not leak checklist or fixed team limits outside plan capabilities', () => {
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');
  const detail = readFileSync(join(root, 'components', 'operations', 'LeanZeusJobDetail.tsx'), 'utf8');
  const team = readFileSync(join(root, 'components', 'operations', 'LocalAccountSettings.tsx'), 'utf8');
  const server = readFileSync(join(root, 'lib', 'server', 'appAccess.ts'), 'utf8');

  assert.match(zeus, /checklistAllowed && <ZeusChecklistChoicePicker/);
  assert.match(detail, /zeusViewHasFeature\(w\.data\.settings, 'checklist'\)/);
  assert.doesNotMatch(team, /TEAM_LIMIT/);
  assert.match(team, /seatLimit=Math\.max\(1,Number\(appRow\?\.seats\|\|1\)\)/);
  assert.match(team, /granularPermissions=appId!=='zeus'\|\|!!w&&zeusViewHasFeature\(w\.data\.settings,'granular_permissions'\)/);
  assert.match(server, /granularPermissions = zeusHasFeature\(entitlements\.plan, 'granular_permissions'\)/);
});


test('Zeus keeps configuration and payments universal while plan tiers gate business modules', () => {
  const plans = readFileSync(join(root, 'lib', 'operations', 'zeusPlans.ts'), 'utf8');
  const settings = readFileSync(join(root, 'components', 'operations', 'Settings.tsx'), 'utf8');
  const configuration = readFileSync(join(root, 'lib', 'operations', 'configuration.ts'), 'utf8');

  assert.match(plans, /const START: ZeusFeature\[\] = \[[^\]]*'payments'/s);
  assert.match(plans, /const ESSENCIAL: ZeusFeature\[\] = \[[^\]]*'team_management'/s);
  assert.match(plans, /const PLUS: ZeusFeature\[\] = \[[^\]]*'billing'[^\]]*'dashboard'[^\]]*'granular_permissions'/s);
  assert.doesNotMatch(plans, /basic_filters|advanced_filters|full_operational_settings/);
  assert.match(settings, /\{ id:'operacao', label:'Fluxo do processo' \}/);
  assert.match(settings, /app === 'zeus' && <PaymentIntegrationSetting app="zeus" \/>/);
  assert.doesNotMatch(settings, /zeusViewHasFeature\(w\.data\.settings, 'full_operational_settings'\)/);
  assert.match(configuration, /actionVisibility\.manualStatus = false/);
  assert.match(configuration, /\['year','meter','technician','due','internalNotes','partBrand','finalNotes'\]/);
});


test('Zeus enforces purchased seat limits after downgrades', () => {
  const client = readFileSync(join(root, 'lib', 'account', 'storeAccess.ts'), 'utf8');
  const server = readFileSync(join(root, 'lib', 'server', 'appAccess.ts'), 'utf8');

  assert.match(client, /const seatEligible = \(app: AppId\)/);
  assert.match(client, /Math\.max\(0, Math\.max\(1, Number\(entitlement\.seats \|\| 1\)\) - ownerCount\)/);
  assert.match(server, /const seatLimitFromStore = Math\.max\(1, Number\(accountApps\[0\]\?\.seats \|\| 1\)\)/);
  assert.match(server, /\.slice\(0, slots\)[\s\S]*\.some\(row => row\.user_id === user\.id\)/);
});


test('Zeus Start home organizes current work by status instead of duplicating the full attendance list', () => {
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');

  assert.match(zeus, /startHomeSection\('Em identificação', startIdentification\)/);
  assert.match(zeus, /startHomeSection\('Em andamento', startWorking\)/);
  assert.match(zeus, /startHomeSection\('Parados', startStopped\)/);
  assert.match(zeus, /startHomeSection\('Prontos para entregar', startReady\)/);
  assert.match(zeus, /\['Pausado', 'Aguardando peça'\]\.includes\(job\.status\)/);
  assert.match(zeus, /jobList\(list\.slice\(0, 4\)\)/);
  assert.match(zeus, /simpleFlow && canViewJobs && <Link className="op-button secondary" href="\/zeus\/atendimentos">Ver atendimentos/);
  assert.match(zeus, /canViewJobs && !simpleFlow && <SearchBox/);
  assert.doesNotMatch(zeus, /simpleFlow \? <Section title="Atendimentos"/);
});


test('Zeus Start has no AI, trial watermark text is invisible, and photos are highlighted on every plan', () => {
  const plans = readFileSync(join(root, 'lib', 'operations', 'zeusPlans.ts'), 'utf8');
  const cards = readFileSync(join(root, 'components', 'ZeusPlanCards.tsx'), 'utf8');
  const detail = readFileSync(join(root, 'components', 'operations', 'LeanZeusJobDetailBase.tsx'), 'utf8');
  const assistant = readFileSync(join(root, 'components', 'operations', 'ZeusStageAssistant.tsx'), 'utf8');
  const settings = readFileSync(join(root, 'components', 'operations', 'Settings.tsx'), 'utf8');
  const trialCss = readFileSync(join(root, 'components', 'operations', 'trial-protection.css'), 'utf8');
  const aiApi = readFileSync(join(root, 'app', 'api', 'zeus', 'assistente', 'route.ts'), 'utf8');

  const startBlock = plans.match(/const START: ZeusFeature\[\] = \[([\s\S]*?)\];/)?.[1] || '';
  const essencialBlock = plans.match(/const ESSENCIAL: ZeusFeature\[\] = \[([\s\S]*?)\];/)?.[1] || '';
  assert.doesNotMatch(startBlock, /'ai'/);
  assert.match(essencialBlock, /'ai'/);
  assert.match(plans, /'Fotos nos atendimentos'/);
  assert.match(plans, /highlights:\['OS pronta para usar','Personalização e filtros','Pagamentos','Fotos nos atendimentos'\]/);
  assert.match(cards, /\{ label:'Fotos nos atendimentos', feature:'core_os' \}/);
  assert.match(detail, /access\.hasPermission\('zeus', 'ai_use'\) && zeusViewHasFeature\(w\.data\.settings, 'ai'\)/);
  assert.match(assistant, /if \(!zeusViewHasFeature\(w\.data\.settings, 'ai'\)\) return null/);
  assert.match(settings, /app !== 'zeus' \|\| zeusViewHasFeature\(w\.data\.settings, 'ai'\)/);
  assert.match(aiApi, /requireZeusFeature\(access\.accountId, 'ai'\)/);
  assert.match(trialCss, /\.trial-watermark\{[^}]*opacity:0/s);
});


test('Zeus exposes payment collection inside the OS for every plan, including Start without budgets', () => {
  const plans = readFileSync(join(root, 'lib', 'operations', 'zeusPlans.ts'), 'utf8');
  const detail = readFileSync(join(root, 'components', 'operations', 'LeanZeusJobDetailBase.tsx'), 'utf8');
  const payments = readFileSync(join(root, 'components', 'operations', 'PostCompletionPayments.tsx'), 'utf8');

  const startBlock = plans.match(/const START: ZeusFeature\[\] = \[([\s\S]*?)\];/)?.[1] || '';
  assert.match(startBlock, /'payments'/);
  assert.match(detail, /zeusViewHasFeature\(s, 'payments'\) && <PostCompletionPayments/);
  assert.match(detail, /cobrança pode ser feita diretamente nesta OS/);
  assert.match(payments, /allowManualAmount=\{amountCents <= 0\}/);
  assert.match(payments, /Valor a cobrar \(R\$\)/);
  assert.match(payments, /amountCents: manualAmountCents, items: effectiveItems/);
  assert.match(payments, /onApproved\?\.\(charge\.amount_cents\)/);
});


test('billing center exposes a real action to end an active direct trial', () => {
  const billing = readFileSync(join(root, 'components', 'BillingPortal.tsx'), 'utf8');
  const route = readFileSync(join(root, 'app', 'api', 'billing', 'trial', 'route.ts'), 'utf8');

  assert.match(billing, /Encerrar teste/);
  assert.match(billing, /\/api\/billing\/trial/);
  assert.match(billing, /endTrial\(entitlement\.appId\)/);
  assert.match(route, /manage_billing/);
  assert.match(route, /entitlement\?\.status!==['"]trialing['"]/);
  assert.match(route, /current_period_end:now/);
});
