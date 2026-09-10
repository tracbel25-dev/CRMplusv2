# Mercado Pago conectado — cobranças dos clientes dos clientes

Esta integração é separada da cobrança das assinaturas do próprio CRM PLUS.

## Fluxo

1. O titular entra em **Minha conta > Assinaturas e cobrança**.
2. Lê e aceita o Termo de Integração de Pagamentos.
3. O CRM PLUS cria `state` de uso único e PKCE S256 no servidor.
4. O titular é enviado ao Mercado Pago, faz login na própria conta e concede a autorização.
5. O Mercado Pago retorna um `code` para a Edge Function `mercadopago-connect`.
6. A Edge Function troca o código por `access_token` e `refresh_token` usando o Client ID/Client Secret da aplicação Marketplace do CRM PLUS.
7. Os tokens são criptografados com AES-GCM antes de serem gravados no banco. Nenhum token OAuth é devolvido ao navegador.
8. Dentro de Zeus ou Artemis, um usuário autorizado habilita ou desabilita o uso do pagamento para aquele aplicativo.

## Separação financeira

A integração não configura `marketplace_fee`, `application_fee`, split, comissão ou repasse para o CRM PLUS. A cobrança é feita usando a autorização da conta Mercado Pago conectada. Tarifas, prazos, retenções, chargebacks e demais condições pertencem ao relacionamento entre o estabelecimento e o Mercado Pago.

## Banco

O arquivo `mercadopago-connected-accounts.sql` foi aplicado no Supabase central nas migrations:

- `20260910160342 mercadopago_connected_accounts_oauth`
- `mercadopago_connected_accounts_rpc` (migration subsequente; confira `supabase migration list` no ambiente conectado)

As tabelas ficam no schema `private`, têm RLS ativo e não concedem acesso a `anon` ou `authenticated`. As operações passam por RPCs públicas com `EXECUTE` revogado de usuários e concedido somente a `service_role`.

O aceite guarda conta, usuário autenticado, versão do termo, hash SHA-256, data/hora e user-agent. O `state` OAuth é armazenado somente como hash e expira em 15 minutos.

## Edge Function

Função: `mercadopago-connect`

- `POST action=status`: usuário autenticado da empresa consulta apenas metadados da conexão e habilitações por app.
- `POST action=authorize`: somente titular; exige aceite da versão atual do termo.
- `GET ?code&state`: callback do Mercado Pago; consome o state uma única vez, valida titular/empresa, troca o código e grava tokens protegidos.
- `POST action=disconnect`: somente titular; apaga os tokens utilizáveis localmente e desabilita pagamentos dos apps.
- `POST action=set-app-enabled`: titular ou usuário com `can_configure` no aplicativo ativo.

`verify_jwt=false` é intencional porque o mesmo endpoint recebe o callback público do Mercado Pago. Todas as ações POST validam manualmente o Bearer token com `auth.getUser()` e a associação do usuário à empresa.

## Configuração obrigatória no Mercado Pago

Na aplicação Marketplace do CRM PLUS, cadastre exatamente esta URL de redirecionamento, salvo se `MERCADO_PAGO_CONNECT_REDIRECT_URI` for alterada:

`https://sodcfarvfhkdjecjmdwc.supabase.co/functions/v1/mercadopago-connect`

Habilite o fluxo Authorization Code com PKCE e mantenha as permissões `read`, `write` e `offline_access`.

## Secrets do Supabase central

Cadastrar em **Edge Functions > Secrets**:

- `MERCADO_PAGO_CONNECT_CLIENT_SECRET` — obrigatório.
- `MERCADO_PAGO_CONNECT_CLIENT_ID` — opcional se continuar usando a aplicação `4059087158712728`, que é o fallback atual.
- `MERCADO_PAGO_CONNECT_REDIRECT_URI` — opcional enquanto usar a URL padrão acima.
- `MERCADO_PAGO_CONNECT_ENCRYPTION_KEY` — obrigatório; base64url de exatamente 32 bytes aleatórios.

Exemplo local para gerar somente a chave de criptografia (não versionar a saída):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Limite desta entrega

Esta entrega cria a autorização OAuth, o aceite auditável e o liga/desliga por aplicativo. Ela ainda não cria a API operacional que emite uma cobrança concreta para uma OS, pedido ou comanda. Essa API deve consumir somente conexões com `status=active` e app habilitado, renovar tokens quando necessário e nunca aceitar valor final confiando apenas no navegador.
