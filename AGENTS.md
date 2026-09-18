# AGENTS.md — CRM PLUS Store

Antes de alterar páginas públicas, landing, catálogo, SEO ou rotas comerciais, leia `docs/public-ui-rules.md`.

## Regra obrigatória de preço

Preço, mensalidade, "a partir de", valores em reais, tabela de planos e dados estruturados de preço pertencem **somente** à rota `/planos`.

Não colocar preço em rotas individuais dos aplicativos, incluindo `/aplicativos/[slug]`, nem em:

- conteúdo visível;
- metadata;
- título ou descrição SEO;
- Open Graph ou Twitter Card;
- JSON-LD ou schema `Offer`;
- componentes ou consultas de planos usados para renderizar valores.

A página individual do aplicativo deve permanecer limpa e pode apenas direcionar para `/planos?app=<slug>` com uma ação como "Conhecer planos".

Não remover nem contornar `tests/public-ui-rules.test.mjs`.
