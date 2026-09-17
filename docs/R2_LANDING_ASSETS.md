# R2 da landing CRM PLUS

A landing usa uma base pública única do Cloudflare R2. As credenciais de escrita ficam somente no servidor/Vercel.

## Variáveis de ambiente

```env
LANDING_R2_ACCOUNT_ID=
LANDING_R2_ACCESS_KEY_ID=
LANDING_R2_SECRET_ACCESS_KEY=
LANDING_R2_BUCKET=
NEXT_PUBLIC_LANDING_R2_BASE_URL=
```

`NEXT_PUBLIC_LANDING_R2_BASE_URL` deve ser somente a URL pública do bucket ou domínio customizado, sem `/` no final. Nunca coloque Access Key ou Secret em variável `NEXT_PUBLIC_`.

## Estrutura dos arquivos

Padronização preferida: PNG, nomes minúsculos e sem espaços.

```text
home/
  store-cover.png

apps/
  zeus/
    cover.png
    card.png
    icon.png
  artemis/
    cover.png
    card.png
    icon.png
  athena-pesquisa/
    cover.png
    card.png
    icon.png
  kronos/
    cover.png
    card.png
    icon.png
  athena-orcamentos/
    cover.png
    card.png
    icon.png
```

A landing procura o R2 primeiro e mantém os arquivos locais como fallback enquanto a migração não estiver completa. Assim as imagens podem ser transferidas uma por vez sem quebrar o site.

## Cloudflare

1. Criar ou escolher um bucket exclusivo para a landing/publicidade.
2. Criar credencial R2 com acesso somente a esse bucket.
3. Habilitar leitura pública por domínio customizado ou URL pública do R2.
4. Configurar as cinco variáveis acima na Vercel em Production/Preview conforme necessário.
5. Fazer novo deploy após configurar `NEXT_PUBLIC_LANDING_R2_BASE_URL`, pois ela é incorporada no build do Next.js.
