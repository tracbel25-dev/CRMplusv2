# CRM PLUS Store — conta, acesso e fronteira dos aplicativos

## Regra principal

O projeto Supabase central da CRM PLUS Store é a fonte de verdade para **identidade e direito de acesso**, não para a operação dos aplicativos.

Projeto central previsto: `sodcfarvfhkdjecjmdwc`.

Ele concentra:

- Supabase Auth: cadastro, login, sessão, recuperação/troca de senha;
- conta/empresa do cliente;
- titular e demais usuários da conta;
- permissões da conta;
- quais aplicativos a conta contratou;
- quais aplicativos cada usuário pode abrir;
- planos e preços da Store;
- cliente/assinatura Stripe;
- processamento idempotente de webhooks Stripe;
- convites e auditoria de acesso.

Ele **não** recebe:

- ordens de serviço do Zeus;
- clientes operacionais do Zeus;
- pedidos, mesas, caixa, cardápio ou estoque do Artemis;
- oportunidades e atividades do Kronos;
- pesquisas/respostas do Athena Pesquisa;
- orçamentos/itens do Athena Orçamentos;
- anexos, fotos ou documentos operacionais dos apps.

Cada aplicativo terá projeto Supabase próprio, conta/chaves próprias e schema operacional próprio.

## Fluxo da Store

### Visitante

1. Acessa a home corporativa `/` ou a landing de um aplicativo.
2. Pode conhecer os produtos sem autenticação.
3. Escolhe aplicativo + plano.
4. Vai para cadastro/checkout preservando `app` e `plan` no destino.

### Cadastro do titular

1. Supabase Auth central cria o usuário.
2. A Store cria uma `account` para o negócio.
3. O usuário entra em `account_members` como `owner`.
4. O checkout Stripe cria/associa o cliente de cobrança.
5. O webhook Stripe confirma a assinatura.
6. O webhook ativa `account_apps` para o aplicativo comprado.
7. O titular recebe acesso ao app automaticamente.

### Usuários adicionais

O titular adiciona usuários e controla duas coisas independentes:

- **Acesso ao aplicativo**: `member_app_access`;
- **Permissão administrativa**: `member_permissions`.

A permissão inicial importante é:

- `manage_configuration`: pode alterar nomes de campos, opções, módulos e ações dos apps a que já possui acesso.

Ter acesso a um app **não** concede acesso às configurações.

### Configurações

A área Configurações só deve existir visualmente e funcionalmente para:

- o titular (`owner`); ou
- usuário com `manage_configuration`.

A autorização real será aplicada por RLS/servidor, não apenas escondendo botão no frontend.

## Ligação com os Supabase operacionais

`account_apps.tenant_key` é a chave de correlação da Store com a futura instância operacional do aplicativo.

A Store pode informar ao backend do app:

- `account_id`;
- `user_id`;
- `app_id`;
- `tenant_key`;
- permissões centrais necessárias.

O backend do app resolve isso para o tenant existente no projeto Supabase próprio do aplicativo. Nenhuma chave secreta do Supabase operacional deve chegar ao navegador nem ser armazenada no banco central.

## Fase atual de protótipo

- os aplicativos continuam abrindo sem login para validar UX;
- configuração já segue a regra de titular/permissão no protótipo local;
- autenticação central não deve bloquear a navegação operacional até a etapa ser ativada explicitamente;
- ao conectar Supabase central, o protótipo local de conta deve ser substituído, e não mantido em paralelo como segunda fonte de verdade.

## Stripe

O Stripe altera entitlement somente por backend/webhook verificado.

Eventos mínimos a tratar:

- checkout concluído;
- assinatura criada/atualizada;
- pagamento aprovado/falhou quando relevante;
- assinatura cancelada.

`private.stripe_events` garante idempotência: o mesmo evento não pode liberar/cancelar o app duas vezes.

Segredos Stripe e chave secreta Supabase ficam apenas no backend/Edge Function. Nunca usar `NEXT_PUBLIC_` para esses valores.
