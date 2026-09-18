# AGENTS.md — CRM PLUS Store

Antes de alterar qualquer parte do projeto, leia `docs/RULES-INDEX.md`.

## Leitura por área

### Landing, catálogo, SEO, header, footer ou página comercial
Leia obrigatoriamente:
- `docs/public-ui-rules.md`
- `docs/DESIGN-CRMPLUS-STORE.md`
- `docs/UI-FORMATTING-RULES.md`

### Zeus
Leia obrigatoriamente:
- `docs/DESIGN-ZEUS.md`
- `docs/UI-FORMATTING-RULES.md`
- documentos operacionais relacionados à função alterada.

### Artemis
Leia obrigatoriamente:
- `docs/DESIGN-ARTEMIS.md`
- `docs/UI-FORMATTING-RULES.md`
- documentos operacionais relacionados à função alterada.

## Regra de precedência

Não use um exemplo antigo de documento para desfazer uma decisão já aplicada no código.

- nomes e slugs atuais: fonte atual do catálogo;
- preços e planos: fonte central atual;
- disponibilidade: implementação real;
- design e formatação: documentos de design vigentes.

Em caso de conflito real, preserve o estado atual e registre a incompatibilidade em vez de "corrigir" silenciosamente.

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

## Regras visuais que não devem ser quebradas sem decisão explícita

- Store pública não pode parecer ERP/dashboard.
- Evitar neon, glow e visual tecnológico genérico.
- Contraste forte e texto legível.
- Não transformar toda informação em card.
- Não inventar estatísticas, depoimentos, disponibilidade ou integrações.
- Mobile é uma adaptação própria, não desktop comprimido.
- Informação essencial não depende só de cor ou hover.
- Cada aplicativo mantém identidade própria.
- Zeus começa no tema claro.
- Áreas operacionais priorizam fluxo de trabalho, não decoração.

## Alterações visuais

Antes de substituir uma composição aprovada por um padrão genérico, confira os documentos de design.

Não trocar imagem aprovada, identidade, hierarquia ou estrutura principal por conveniência técnica sem necessidade.

Toda alteração deve preservar comportamento responsivo, acessibilidade, estados de erro/carregamento e rotas existentes.
