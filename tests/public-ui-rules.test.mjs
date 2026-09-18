import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const productRoute = join(root, 'app', 'aplicativos', '[slug]');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : sourceExtensions.has(extname(name))
        ? [full]
        : [];
  });
}

test('individual app pages keep pricing only on /planos', () => {
  const files = sourceFiles(productRoute);
  assert.ok(files.length > 0, 'Expected source files under app/aplicativos/[slug].');

  const forbidden = [
    ['PublicPricing', /\bPublicPricing\b/i],
    ['getPublicPlans', /\bgetPublicPlans\b/i],
    ['currency value (R$)', /R\$/i],
    ['"a partir de"', /a\s+partir\s+de/i],
    ['monthly price wording', /\bmensalidade\b|\bpor\s+m[eê]s\b/i],
    ['price SEO field', /\bpriceCurrency\b|\bprice\s*:/i],
    ['Offer structured data', /['"`]Offer['"`]/i],
    ['visible price wording', /\bpre[çc]os?\b/i],
  ];

  const violations = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    for (const [label, pattern] of forbidden) {
      if (pattern.test(source)) violations.push(`${file}: ${label}`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    [
      'Individual application routes must not expose pricing or price SEO.',
      'Keep values exclusively on /planos and link there with "Conhecer planos".',
      ...violations,
    ].join('\n'),
  );

  const page = readFileSync(join(productRoute, 'page.tsx'), 'utf8');
  assert.match(page, /\/planos\?app=/, 'The product page should link to /planos?app=<slug>.');
});
