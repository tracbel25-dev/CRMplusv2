# Índice de regras — CRM PLUS Store

Este arquivo é a porta de entrada para alterações no CRM PLUS Store.

## Ordem de leitura obrigatória

1. `AGENTS.md`
2. Este arquivo
3. O documento específico da área alterada
4. O código e as fontes de dados atuais do repositório

## Precedência

Quando existir conflito entre um documento antigo e a implementação atual:

1. Não reintroduza automaticamente uma regra antiga.
2. Nomes, slugs, estados de publicação e dados comerciais devem usar as fontes atuais do repositório.
3. Design e formatação aprovados continuam válidos quando não contradizem uma decisão posterior.
4. Mudanças comerciais, de preço, plano ou produto exigem fonte atual específica; exemplos antigos de design não substituem a configuração vigente.
5. Não invente uma solução para "resolver" conflitos silenciosamente.

## Documentos principais

### Público / Store
- `docs/public-ui-rules.md` — preço, SEO, catálogo e comunicação pública.
- `docs/DESIGN-CRMPLUS-STORE.md` — direção de arte da Store, landing, capa, header, catálogo e rodapé.
- `docs/UI-FORMATTING-RULES.md` — tipografia, densidade, formulários, responsividade e acessibilidade.

### Aplicativos
- `docs/DESIGN-ZEUS.md` — direção visual e comportamento da interface do Zeus.
- `docs/DESIGN-ARTEMIS.md` — regras visuais e de experiência confirmadas para o Artemis.
- `docs/APPS-E-FLUXOS.md` — fluxos e requisitos operacionais existentes.
- `docs/FLUXOS-OPERACIONAIS.md` — regras de operação.
- `docs/NAVEGACAO-COMPACTA.md` — organização de navegação.
- `docs/NIVEL-CORPORATIVO.md` — regras do nível corporativo.

### Infraestrutura e dados
- `docs/SUPABASE-ZEUS-ARTEMIS.md`
- `docs/R2-ZEUS-ARTEMIS.md`
- `docs/AI-MEMORY.md`
- `docs/CRMPLUS_STORE_ACCESS_ARCHITECTURE.md`

## Fontes de verdade atuais

- Catálogo público: `lib/catalog.ts`.
- Preços e planos: fonte central usada pela rota `/planos` e pelas APIs de cobrança.
- Rotas: estrutura existente no App Router.
- Estado real de uma função: código, banco e integrações efetivamente implementadas.

Documentos de design não podem renomear aplicativos, criar recursos, alterar preços ou declarar disponibilidade.
