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
