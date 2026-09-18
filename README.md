# CRM PLUS Store

Store e cinco aplicativos operacionais em Next.js 16, React 19 e TypeScript.

- Store: `/inicio`
- Acesso direto: `/entrar`
- Apps: `/zeus`, `/artemis`, `/athena-pesquisa`, `/kronos`, `/athena-orcamentos`

## Regras do projeto

Antes de alterar interface, fluxo ou páginas públicas, consulte:

- [Índice de regras](docs/RULES-INDEX.md)
- [Regras de interface pública](docs/public-ui-rules.md)
- [Design da CRM PLUS Store](docs/DESIGN-CRMPLUS-STORE.md)
- [Design e formatação](docs/UI-FORMATTING-RULES.md)
- [Design Zeus](docs/DESIGN-ZEUS.md)
- [Design Artemis](docs/DESIGN-ARTEMIS.md)

O arquivo [AGENTS.md](AGENTS.md) define a leitura obrigatória por área e a precedência entre documentos e implementação atual.

## Executar

```bash
npm install
npm run dev
npm run build
```

Para testar as regras operacionais, use Node 24:

```bash
node --test tests/operations.test.mjs
```

O acesso está sem autenticação por solicitação do projeto. Os registros desta etapa são locais no navegador, isolados por aplicativo, e podem ser exportados/restaurados em Configurações. Não existe conexão operacional com Supabase/R2 nesta versão. Não use esta etapa como sistema multiusuário com isolamento de empresas no servidor.

Os fluxos, requisitos atendidos, integrações pendentes e detalhes de validação estão em [docs/APPS-E-FLUXOS.md](docs/APPS-E-FLUXOS.md).

A landing mantém as capas fornecidas pelo usuário. Os apps internos usam interfaces próprias e começam vazios, sem imagens ou registros inventados.
