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


test('Zeus Start does not expose technician/responsible UI, while Essencial does', () => {
  const plans = readFileSync(join(root, 'lib', 'operations', 'zeusPlans.ts'), 'utf8');
  const zeus = readFileSync(join(root, 'components', 'operations', 'Zeus.tsx'), 'utf8');

  assert.match(plans, /const START: ZeusFeature\[\] = \[[^\]]*'service_types'[^\]]*'deadlines'/s);
  assert.doesNotMatch(plans.match(/const START: ZeusFeature\[\] = \[[^\]]*\]/s)?.[0] || '', /'responsible'/);
  assert.match(plans.match(/const ESSENCIAL: ZeusFeature\[\] = \[[^\]]*\]/s)?.[0] || '', /'responsible'/);
  assert.match(zeus, /if \(key === 'Responsável'\) return zeusViewHasFeature\(s, 'responsible'\)/);
  assert.match(zeus, /hasResponsible && <span>/);
  assert.match(zeus, /zeusViewHasFeature\(s, 'responsible'\) \? \[\{ name: 'technician'/);
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
  assert.match(team, /granularPermissions=appId!=='zeus'\|\|zeusViewHasFeature\(w\.data\.settings,'granular_permissions'\)/);
  assert.match(server, /granularPermissions = zeusHasFeature\(entitlements\.plan, 'granular_permissions'\)/);
});
