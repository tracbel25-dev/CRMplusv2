# Assinaturas Mercado Pago — Store central

Projeto: `sodcfarvfhkdjecjmdwc`. Aplicação MP: `4059087158712728`.
Retorno temporário: `https://crmplusv2.vercel.app/assinaturas?retorno=1`.

## Estado desta entrega

Código preparado para revisão. **A alteração do banco foi bloqueada pela revisão automática e NÃO foi aplicada. As funções NÃO foram publicadas.**
Autorizar explicitamente a criação das tabelas de cobrança e atualização das regras de acesso antes de aplicar `mercadopago.sql` no projeto central.
O último status do Vercel no commit base indica limite diário de deploy. A conexão Vercel desta sessão pertence a outra equipe; acompanhar a publicação pelo GitHub/conta correta.

## Publicação após autorização

1. Aplicar `mercadopago.sql` como migration no Supabase central, testar atomicidade/RLS com transação revertida e executar Security Advisor.
2. Publicar `mercadopago-subscription` e `mercadopago-webhook`, incluindo `_shared/mercadopago.ts`, com a configuração deste diretório. A primeira valida o JWT em `auth.getUser()` e verifica empresa, membro e permissão financeira; a segunda valida HMAC. As duas usam autenticação própria, com `verify_jwt=false`.
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
SQL/RLS, execução das Edge Functions em produção e pagamento ponta a ponta permanecem pendentes da aplicação autorizada.

Referências: [Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [tipos oficiais PreApproval](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/preApproval/commonTypes.ts), [autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth).
