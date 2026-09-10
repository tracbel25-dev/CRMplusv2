# Assinaturas Mercado Pago — Store central

Projeto: `sodcfarvfhkdjecjmdwc`. Aplicação MP: `4059087158712728`.
Retorno temporário: `https://crmplusv2.vercel.app/assinaturas?retorno=1`.

## Estado desta entrega

Migration aplicada e funções `mercadopago-subscription` e `mercadopago-webhook` publicadas no Supabase central em 10/09/2026, após autorização explícita do titular.
O webhook responde HTTP 200 no health check. O checkout exige autenticação (HTTP 401 sem sessão). A ativação de novas cobranças permanece bloqueada até cadastrar `MERCADO_PAGO_WEBHOOK_SECRET`.
A prévia do Vercel deste PR foi publicada com sucesso; o limite de deploy observado no commit base não impediu a prévia.

## Configuração e manutenção

1. `mercadopago.sql` já foi aplicado como migration no projeto central. Não reaplicar. O teste `tests/billing.transaction.sql` valida sincronização, duplicidade, estorno, cancelamento, isolamento e vencimento com ROLLBACK.
2. Funções já publicadas. Para atualizar `mercadopago-subscription` e `mercadopago-webhook`, incluir `_shared/mercadopago.ts`, com a configuração deste diretório. A primeira valida o JWT em `auth.getUser()` e verifica empresa, membro e permissão financeira; a segunda valida HMAC. As duas usam autenticação própria, com `verify_jwt=false`.
3. O usuário já cadastrou `MERCADO_PAGO_ACCESS_TOKEN` nos Secrets. Nunca versionar seu valor.
4. No Mercado Pago → CRMPlus Assinaturas → Webhooks, configurar produção:
   `https://sodcfarvfhkdjecjmdwc.supabase.co/functions/v1/mercadopago-webhook`
   Eventos: **Planos e assinaturas** e **Pagamentos**.
5. Salvar a assinatura secreta gerada como `MERCADO_PAGO_WEBHOOK_SECRET` nos Secrets do Supabase. Até isso acontecer, checkout permanece indisponível.
6. Mesclar o PR e aguardar o deploy Vercel. Testar o fluxo com uma conta própria e pagamento autorizado pelo titular. Nenhuma cobrança real foi criada nesta entrega.
7. Ao mudar o domínio, cadastrar `STORE_SITE_URL` nos Secrets e conferir as URLs permitidas de redirecionamento no Supabase Auth.

## Comportamento

- Preço, moeda, aplicativo e ciclo vêm do banco; o cliente envia somente o ID do plano.
- Uma assinatura em criação/pendente/autorizada/pausada por empresa e app; POST duplicado não cria segunda assinatura.
- Timeout ambíguo preserva a trava. Atualizar status tenta recuperar pelo provedor; falha de recuperação exige conferência, nunca nova cobrança automática.
- A criação da assinatura e o retorno do checkout não liberam apps. Uma cobrança de produção aprovada e correlacionada à fatura é necessária.
- Pagamentos são únicos pelo ID do Mercado Pago e processados em transação. Datas de atualização impedem regressão por evento atrasado.
- Cancelar impede novas renovações e preserva o período pago; reembolso/chargeback remove o período daquela cobrança. Reembolso parcial é tratado conservadoramente como reembolso e exige avaliação do suporte.
- O acesso verifica também vencimento e suspensão. Os 4 assentos definidos no banco são preservados.
- Atualização manual consulta as últimas faturas retornadas (até 20) como recuperação complementar. Webhooks são responsáveis por todo o histórico; reconciliação histórica em lote não faz parte desta entrega.
- Novas tabelas têm RLS. Navegador só lê assinaturas da empresa com permissão financeira; pagamentos e RPC de sincronização são exclusivos do backend.
- Tabelas legadas Stripe são preservadas. Não são usados os bancos operacionais dos apps.

## Verificação

`node --test tests/billing.test.mjs` cobre HMAC, autenticação, autorização financeira, correlação, valor, moeda, modo de produção e URLs de checkout.
`npm run build` verifica TypeScript e compilação Next.js. Edge Functions têm verificação de tipos separada.
SQL/RLS passaram nos testes transacionais com ROLLBACK, incluindo acesso entre empresas e eventos repetidos/atrasados. Security Advisor: nenhum alerta WARN/ERROR; apenas INFO esperado em `mp_payments` (RLS sem policies, tabela exclusiva do backend). [Explicação do lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
As Edge Functions foram publicadas e os checks HTTP passaram. Pagamento ponta a ponta depende da configuração do webhook e de uma transação de teste autorizada; nenhuma cobrança real foi criada.

Referências: [Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [tipos oficiais PreApproval](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/commonTypes.ts), [autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth).

## Teste grátis de 7 dias

Aplique `trials.sql` uma vez após `mercadopago.sql` no projeto Store. A função
`start_app_trial(target_account, target_app, document)` exige titular da empresa ativa,
e-mail confirmado e telefone confirmado pelo Supabase Auth. Disponível para Zeus e Artemis.

Antes de disponibilizar ao público, habilite Phone em Authentication / Sign In / Providers,
configure um provedor de SMS com suas credenciais e mantenha confirmação de telefone obrigatória.
Configure também os limites de envio no Auth; não habilite confirmação automática nem números
fixos de teste em produção. Nenhuma mensagem SMS é enviada pelo deploy.
A interface verifica a disponibilidade e bloqueia ativação enquanto Phone estiver desativado.

Cada teste dura exatamente 168 horas desde a ativação, sem cartão ou cobrança automática.
A autorização consulta o vencimento em cada operação; `trialing` sem data é negado. O rótulo
no banco pode continuar `trialing` depois de vencer, mas isso não concede acesso. Dados e acesso
à área de assinatura são preservados. Clientes pagantes e acessos existentes não são convertidos.

Documento (validação de dígitos, sem comprovação de titularidade), telefone e e-mail são registrados
como HMAC em tabelas privadas, com chave gerada no banco e sem leitura pública. Restrições únicas
por aplicativo impedem repetir com a mesma conta, usuário, documento, telefone ou e-mail.
O histórico não é apagado em cascata ao excluir contas. Trocar todas as identidades continua sendo
uma limitação; IP e identificação do dispositivo não são usados como prova de identidade.
A retenção desses identificadores deve acompanhar a política de exclusão e privacidade do produto.

Verificação: `tests/trials.transaction.sql` usa dados sintéticos dentro de uma transação revertida.
Inclui prazo, repetição, telefone confirmado, isolamento da empresa, documento/telefone reutilizado,
expiração, preservação de acesso pago e retenção do teste após exclusão.

### Correção do carregamento de assinatura

Aplique `billing-flow-fix.sql` depois das alterações de teste pelo Mercado Pago.
As funções de cobrança usam `security invoker`; o papel `service_role` precisa de
USAGE no schema privado e SELECT no histórico antigo e na chave de comparação.
Essas permissões não são concedidas a `anon` ou `authenticated`.
O registro repetido de um teste já autorizado é reconhecido antes de validar a janela
de início, preservando o prazo original mesmo em notificações dos dias seguintes.

`tests/billing-flow.transaction.sql` executa com o papel real do backend e desfaz
as contas sintéticas. Verifica consulta, identidade, repetição de evento, prazo fixo
e isolamento das tabelas privadas. O frontend carrega o catálogo independentemente
da consulta de assinatura e distingue erro de consulta de pagamento não configurado.
